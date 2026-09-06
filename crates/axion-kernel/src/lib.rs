//! AXION-9 deterministic compute kernel.
//!
//! A faithful Rust port of `src/engine/math.ts` and `src/engine/units.ts`:
//! recursive-descent arithmetic (no eval, ever) plus 9-dimension unit algebra.
//!
//! Build:
//!   wasm-pack build crates/axion-kernel --target web --out-dir ../../pkg/axion-kernel
//! The frontend (`src/engine/kernel-bridge.ts`) loads the artifact lazily and
//! falls back to the TypeScript kernel when it is absent.

use std::f64::consts::{E, PI, TAU};
use wasm_bindgen::prelude::*;

const PHI: f64 = 1.618_033_988_749_895;

/* ============================ arithmetic kernel ============================ */

#[derive(Debug, Clone)]
enum Tok {
    Num(f64),
    Id(String),
    Op(char),
    LP,
    RP,
    Comma,
    Bang,
}

fn tokenize(raw: &str) -> Result<Vec<Tok>, String> {
    let src = raw
        .replace('×', "*")
        .replace('÷', "/")
        .replace('−', "-")
        .replace('π', " pi ")
        .replace("**", "^");
    let chars: Vec<char> = src.chars().collect();
    let mut toks: Vec<Tok> = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        let ch = chars[i];
        if ch.is_whitespace() {
            i += 1;
            continue;
        }
        if ch.is_ascii_digit() || ch == '.' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            let word: String = chars[start..i].iter().collect();
            let dots = word.matches('.').count();
            let v: f64 = word
                .parse()
                .map_err(|_| format!("Malformed number `{}`", word))?;
            if !v.is_finite() || dots > 1 {
                return Err(format!("Malformed number `{}`", word));
            }
            toks.push(Tok::Num(v));
            continue;
        }
        if ch.is_ascii_alphabetic() {
            let start = i;
            while i < chars.len() && chars[i].is_ascii_alphabetic() {
                i += 1;
            }
            let word: String = chars[start..i].iter().collect::<String>().to_lowercase();
            match word.as_str() {
                "mod" => toks.push(Tok::Op('%')),
                "x" => toks.push(Tok::Op('*')),
                _ => toks.push(Tok::Id(word)),
            }
            continue;
        }
        match ch {
            '+' | '-' | '*' | '/' | '%' | '^' => {
                toks.push(Tok::Op(ch));
                i += 1;
            }
            '(' => {
                toks.push(Tok::LP);
                i += 1;
            }
            ')' => {
                toks.push(Tok::RP);
                i += 1;
            }
            ',' => {
                toks.push(Tok::Comma);
                i += 1;
            }
            '!' => {
                toks.push(Tok::Bang);
                i += 1;
            }
            other => {
                return Err(format!(
                    "Unexpected character `{}` — only arithmetic is accepted here",
                    other
                ))
            }
        }
    }
    Ok(toks)
}

struct Parser {
    toks: Vec<Tok>,
    pos: usize,
}

impl Parser {
    fn new(toks: Vec<Tok>) -> Self {
        Parser { toks, pos: 0 }
    }

    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.pos)
    }

    fn next(&mut self) -> Option<Tok> {
        let t = self.toks.get(self.pos).cloned();
        if t.is_some() {
            self.pos += 1;
        }
        t
    }

    fn parse(&mut self) -> Result<f64, String> {
        if self.toks.is_empty() {
            return Err("Empty expression".into());
        }
        let v = self.expr()?;
        if self.pos < self.toks.len() {
            let label = match self.peek() {
                Some(Tok::Num(n)) => n.to_string(),
                Some(Tok::Id(s)) => s.clone(),
                Some(Tok::Op(c)) => c.to_string(),
                Some(Tok::LP) => "(".into(),
                Some(Tok::RP) => ")".into(),
                Some(Tok::Comma) => ",".into(),
                Some(Tok::Bang) => "!".into(),
                None => "end".into(),
            };
            return Err(format!("Unexpected `{}` — expression malformed", label));
        }
        Ok(v)
    }

    fn expr(&mut self) -> Result<f64, String> {
        let mut v = self.term()?;
        loop {
            match self.peek() {
                Some(Tok::Op('+')) => {
                    self.next();
                    v += self.term()?;
                }
                Some(Tok::Op('-')) => {
                    self.next();
                    v -= self.term()?;
                }
                _ => break,
            }
        }
        Ok(v)
    }

    fn term(&mut self) -> Result<f64, String> {
        let mut v = self.factor()?;
        loop {
            match self.peek() {
                Some(Tok::Op('*')) => {
                    self.next();
                    v *= self.factor()?;
                }
                Some(Tok::Op('/')) => {
                    self.next();
                    let r = self.factor()?;
                    if r == 0.0 {
                        return Err("Division by zero — the kernel refuses".into());
                    }
                    v /= r;
                }
                Some(Tok::Op('%')) => {
                    self.next();
                    let r = self.factor()?;
                    if r == 0.0 {
                        return Err("Modulo by zero — the kernel refuses".into());
                    }
                    v %= r;
                }
                Some(Tok::Num(_)) | Some(Tok::Id(_)) | Some(Tok::LP) => {
                    // implicit multiplication: 2pi, 3(4+1), 2sqrt(9)
                    v *= self.factor()?;
                }
                _ => break,
            }
        }
        Ok(v)
    }

    fn factor(&mut self) -> Result<f64, String> {
        match self.peek() {
            Some(Tok::Op('-')) => {
                self.next();
                Ok(-self.factor()?)
            }
            Some(Tok::Op('+')) => {
                self.next();
                self.factor()
            }
            _ => self.power(),
        }
    }

    fn power(&mut self) -> Result<f64, String> {
        let base = self.postfix()?;
        if let Some(Tok::Op('^')) = self.peek() {
            self.next();
            let exp = self.factor()?;
            let r = base.powf(exp);
            if r.is_nan() {
                return Err(format!("`{}^{}` is undefined in reals", base, exp));
            }
            Ok(r)
        } else {
            Ok(base)
        }
    }

    fn postfix(&mut self) -> Result<f64, String> {
        let mut v = self.primary()?;
        while let Some(Tok::Bang) = self.peek() {
            self.next();
            if v < 0.0 || v.fract() != 0.0 {
                return Err("Factorial needs a non-negative integer".into());
            }
            if v > 170.0 {
                return Err("Factorial above 170 overflows IEEE-754".into());
            }
            let mut acc: f64 = 1.0;
            let mut k = 2.0;
            while k <= v {
                acc *= k;
                k += 1.0;
            }
            v = acc;
        }
        Ok(v)
    }

    fn primary(&mut self) -> Result<f64, String> {
        let t = self.next().ok_or("Expression ends abruptly — expected a value")?;
        match t {
            Tok::Num(v) => Ok(v),
            Tok::LP => {
                let v = self.expr()?;
                match self.next() {
                    Some(Tok::RP) => Ok(v),
                    _ => Err("Missing closing parenthesis".into()),
                }
            }
            Tok::Id(name) => {
                let constant = match name.as_str() {
                    "pi" => Some(PI),
                    "e" => Some(E),
                    "tau" => Some(TAU),
                    "phi" => Some(PHI),
                    _ => None,
                };
                if let Some(c) = constant {
                    return Ok(c);
                }
                // function call
                match self.next() {
                    Some(Tok::LP) => {}
                    _ => {
                        return Err(format!(
                            "Unknown identifier `{}` — not a known function or constant",
                            name
                        ))
                    }
                }
                let mut args = vec![self.expr()?];
                while let Some(Tok::Comma) = self.peek() {
                    self.next();
                    args.push(self.expr()?);
                }
                match self.next() {
                    Some(Tok::RP) => {}
                    _ => return Err("Missing closing parenthesis".into()),
                }
                let r = match name.as_str() {
                    "sqrt" => Self::unary(&name, &args)?.sqrt(),
                    "cbrt" => Self::unary(&name, &args)?.cbrt(),
                    "sin" => Self::unary(&name, &args)?.sin(),
                    "cos" => Self::unary(&name, &args)?.cos(),
                    "tan" => Self::unary(&name, &args)?.tan(),
                    "asin" => Self::unary(&name, &args)?.asin(),
                    "acos" => Self::unary(&name, &args)?.acos(),
                    "atan" => Self::unary(&name, &args)?.atan(),
                    "log" => Self::unary(&name, &args)?.log10(),
                    "ln" => Self::unary(&name, &args)?.ln(),
                    "log2" => Self::unary(&name, &args)?.log2(),
                    "abs" => Self::unary(&name, &args)?.abs(),
                    "round" => Self::unary(&name, &args)?.round(),
                    "floor" => Self::unary(&name, &args)?.floor(),
                    "ceil" => Self::unary(&name, &args)?.ceil(),
                    "exp" => Self::unary(&name, &args)?.exp(),
                    "sign" => Self::unary(&name, &args)?.signum(),
                    "min" => args.iter().cloned().fold(f64::INFINITY, f64::min),
                    "max" => args.iter().cloned().fold(f64::NEG_INFINITY, f64::max),
                    _ => {
                        return Err(format!(
                            "Unknown identifier `{}` — not a known function or constant",
                            name
                        ))
                    }
                };
                if r.is_nan() {
                    return Err(format!("`{}` is undefined", name));
                }
                Ok(r)
            }
            _ => Err("Unexpected token where a value was expected".into()),
        }
    }

    fn unary(name: &str, args: &[f64]) -> Result<f64, String> {
        if args.len() != 1 {
            return Err(format!("`{}` takes exactly one argument", name));
        }
        Ok(args[0])
    }
}

fn evaluate_inner(expr: &str) -> Result<f64, String> {
    let toks = tokenize(expr)?;
    Parser::new(toks).parse()
}

/* ============================ number formatting ============================ */

fn format_inner(n: f64) -> Result<String, String> {
    if !n.is_finite() {
        return Err("Result diverges — not a finite number".into());
    }
    // 12 significant figures, strip trailing zeros (mirrors Number.toPrecision(12))
    let r = format!("{:.11e}", n)
        .parse::<f64>()
        .map_err(|_| "Formatting fault".to_string())?;
    if r == 0.0 {
        return Ok("0".into());
    }
    let a = r.abs();
    if a >= 1e15 || a < 1e-9 {
        return Ok(format!("{:e}", r));
    }
    if r.fract() == 0.0 && a < 1e15 {
        // integer with thousands separators
        let int = r as i64;
        let s = int.abs().to_string();
        let mut out = String::new();
        for (i, c) in s.chars().rev().enumerate() {
            if i > 0 && i % 3 == 0 {
                out.push(',');
            }
            out.push(c);
        }
        if int < 0 {
            out.push('-');
        }
        return Ok(out.chars().rev().collect());
    }
    Ok(format!("{}", r))
}

/* ============================ unit algebra ============================ */

struct UnitDef {
    names: &'static [&'static str],
    factor: f64,
    temp: Option<Temp>,
}

#[derive(Clone, Copy, PartialEq)]
enum Temp {
    C,
    F,
    K,
}

struct CategoryDef {
    id: &'static str,
    approx: bool,
    units: &'static [UnitDef],
}

const CATEGORIES: &[CategoryDef] = &[
    CategoryDef {
        id: "length",
        approx: false,
        units: &[
            UnitDef { names: &["mm", "millimeter", "millimeters", "millimetre", "millimetres"], factor: 0.001, temp: None },
            UnitDef { names: &["cm", "centimeter", "centimeters", "centimetre", "centimetres"], factor: 0.01, temp: None },
            UnitDef { names: &["m", "meter", "meters", "metre", "metres"], factor: 1.0, temp: None },
            UnitDef { names: &["km", "kilometer", "kilometers", "kilometre", "kilometres"], factor: 1000.0, temp: None },
            UnitDef { names: &["in", "inch", "inches"], factor: 0.0254, temp: None },
            UnitDef { names: &["ft", "foot", "feet"], factor: 0.3048, temp: None },
            UnitDef { names: &["yd", "yard", "yards"], factor: 0.9144, temp: None },
            UnitDef { names: &["mi", "mile", "miles"], factor: 1609.344, temp: None },
            UnitDef { names: &["nmi", "nautical mile", "nautical miles"], factor: 1852.0, temp: None },
        ],
    },
    CategoryDef {
        id: "mass",
        approx: false,
        units: &[
            UnitDef { names: &["mg", "milligram", "milligrams"], factor: 1e-6, temp: None },
            UnitDef { names: &["g", "gram", "grams", "gramme", "grammes"], factor: 0.001, temp: None },
            UnitDef { names: &["kg", "kilogram", "kilograms", "kgs"], factor: 1.0, temp: None },
            UnitDef { names: &["t", "tonne", "tonnes", "ton", "tons"], factor: 1000.0, temp: None },
            UnitDef { names: &["oz", "ounce", "ounces"], factor: 0.028349523125, temp: None },
            UnitDef { names: &["lb", "lbs", "pound", "pounds"], factor: 0.45359237, temp: None },
            UnitDef { names: &["st", "stone", "stones"], factor: 6.35029318, temp: None },
        ],
    },
    CategoryDef {
        id: "temperature",
        approx: false,
        units: &[
            UnitDef { names: &["c", "°c", "celsius", "centigrade", "deg c", "degrees celsius"], factor: 1.0, temp: Some(Temp::C) },
            UnitDef { names: &["f", "°f", "fahrenheit", "deg f", "degrees fahrenheit"], factor: 1.0, temp: Some(Temp::F) },
            UnitDef { names: &["k", "kelvin", "kelvins"], factor: 1.0, temp: Some(Temp::K) },
        ],
    },
    CategoryDef {
        id: "volume",
        approx: false,
        units: &[
            UnitDef { names: &["ml", "milliliter", "milliliters", "millilitre", "millilitres"], factor: 0.001, temp: None },
            UnitDef { names: &["l", "liter", "liters", "litre", "litres"], factor: 1.0, temp: None },
            UnitDef { names: &["m3", "m³", "cubic meter", "cubic meters", "cubic metre"], factor: 1000.0, temp: None },
            UnitDef { names: &["tsp", "teaspoon", "teaspoons"], factor: 0.00492892159, temp: None },
            UnitDef { names: &["tbsp", "tablespoon", "tablespoons"], factor: 0.0147867648, temp: None },
            UnitDef { names: &["fl oz", "floz", "fluid ounce", "fluid ounces"], factor: 0.0295735296, temp: None },
            UnitDef { names: &["cup", "cups"], factor: 0.236588236, temp: None },
            UnitDef { names: &["pt", "pint", "pints"], factor: 0.473176473, temp: None },
            UnitDef { names: &["qt", "quart", "quarts"], factor: 0.946352946, temp: None },
            UnitDef { names: &["gal", "gallon", "gallons"], factor: 3.78541178, temp: None },
        ],
    },
    CategoryDef {
        id: "area",
        approx: false,
        units: &[
            UnitDef { names: &["m2", "m²", "sqm", "square meter", "square meters", "square metre"], factor: 1.0, temp: None },
            UnitDef { names: &["km2", "km²", "square kilometer", "square kilometers", "square kilometre"], factor: 1e6, temp: None },
            UnitDef { names: &["ft2", "ft²", "sqft", "sq ft", "square foot", "square feet"], factor: 0.09290304, temp: None },
            UnitDef { names: &["yd2", "yd²", "square yard", "square yards"], factor: 0.83612736, temp: None },
            UnitDef { names: &["acre", "acres"], factor: 4046.85642, temp: None },
            UnitDef { names: &["ha", "hectare", "hectares"], factor: 10000.0, temp: None },
            UnitDef { names: &["mi2", "mi²", "square mile", "square miles"], factor: 2589988.11, temp: None },
        ],
    },
    CategoryDef {
        id: "speed",
        approx: false,
        units: &[
            UnitDef { names: &["m/s", "mps", "meter per second", "meters per second"], factor: 1.0, temp: None },
            UnitDef { names: &["km/h", "kmh", "kph", "kilometer per hour", "kilometre per hour"], factor: 1.0 / 3.6, temp: None },
            UnitDef { names: &["mph", "mile per hour", "miles per hour"], factor: 0.44704, temp: None },
            UnitDef { names: &["kn", "kt", "knot", "knots"], factor: 0.514444, temp: None },
            UnitDef { names: &["ft/s", "foot per second", "feet per second"], factor: 0.3048, temp: None },
        ],
    },
    CategoryDef {
        id: "data",
        approx: false,
        units: &[
            UnitDef { names: &["b", "byte", "bytes"], factor: 1.0, temp: None },
            UnitDef { names: &["kb", "kilobyte", "kilobytes"], factor: 1e3, temp: None },
            UnitDef { names: &["mb", "megabyte", "megabytes"], factor: 1e6, temp: None },
            UnitDef { names: &["gb", "gigabyte", "gigabytes"], factor: 1e9, temp: None },
            UnitDef { names: &["tb", "terabyte", "terabytes"], factor: 1e12, temp: None },
            UnitDef { names: &["kib", "kibibyte", "kibibytes"], factor: 1024.0, temp: None },
            UnitDef { names: &["mib", "mebibyte", "mebibytes"], factor: 1024.0_f64.powi(2), temp: None },
            UnitDef { names: &["gib", "gibibyte", "gibibytes"], factor: 1024.0_f64.powi(3), temp: None },
            UnitDef { names: &["tib", "tebibyte", "tebibytes"], factor: 1024.0_f64.powi(4), temp: None },
        ],
    },
    CategoryDef {
        id: "time",
        approx: false,
        units: &[
            UnitDef { names: &["s", "sec", "secs", "second", "seconds"], factor: 1.0, temp: None },
            UnitDef { names: &["min", "mins", "minute", "minutes"], factor: 60.0, temp: None },
            UnitDef { names: &["h", "hr", "hrs", "hour", "hours"], factor: 3600.0, temp: None },
            UnitDef { names: &["d", "day", "days"], factor: 86400.0, temp: None },
            UnitDef { names: &["wk", "week", "weeks"], factor: 604800.0, temp: None },
            UnitDef { names: &["mo", "month", "months"], factor: 2629800.0, temp: None },
            UnitDef { names: &["yr", "year", "years"], factor: 31557600.0, temp: None },
        ],
    },
    CategoryDef {
        id: "currency",
        approx: true,
        units: &[
            UnitDef { names: &["usd", "$", "dollar", "dollars", "us dollar", "us dollars"], factor: 1.0, temp: None },
            UnitDef { names: &["eur", "€", "euro", "euros"], factor: 0.92, temp: None },
            UnitDef { names: &["gbp", "£", "pound sterling", "british pound", "british pounds"], factor: 0.79, temp: None },
            UnitDef { names: &["jpy", "¥", "yen", "japanese yen"], factor: 149.6, temp: None },
            UnitDef { names: &["inr", "₹", "rupee", "rupees", "indian rupee"], factor: 83.2, temp: None },
            UnitDef { names: &["cad", "canadian dollar", "canadian dollars"], factor: 1.36, temp: None },
            UnitDef { names: &["aud", "australian dollar", "australian dollars"], factor: 1.52, temp: None },
            UnitDef { names: &["chf", "swiss franc", "swiss francs"], factor: 0.88, temp: None },
            UnitDef { names: &["cny", "rmb", "chinese yuan", "yuan"], factor: 7.24, temp: None },
        ],
    },
];

struct FoundUnit<'a> {
    cat: &'a CategoryDef,
    factor: f64,
    temp: Option<Temp>,
    key: &'a str,
}

fn find_unit(raw: &str) -> Option<FoundUnit<'static>> {
    let s = raw.to_lowercase();
    let s = s.trim_end_matches('.').split_whitespace().collect::<Vec<_>>().join(" ");
    let candidates: Vec<String> = if s.ends_with('s') && s.len() > 2 {
        vec![s.clone(), s[..s.len() - 1].to_string()]
    } else {
        vec![s.clone()]
    };
    for needle in candidates {
        for cat in CATEGORIES {
            for u in cat.units {
                if u.names.contains(&needle.as_str()) {
                    return Some(FoundUnit {
                        cat,
                        factor: u.factor,
                        temp: u.temp,
                        key: u.names[0],
                    });
                }
            }
        }
    }
    None
}

fn to_celsius(v: f64, t: Temp) -> f64 {
    match t {
        Temp::F => (v - 32.0) * 5.0 / 9.0,
        Temp::K => v - 273.15,
        Temp::C => v,
    }
}

fn from_celsius(c: f64, t: Temp) -> f64 {
    match t {
        Temp::F => c * 9.0 / 5.0 + 32.0,
        Temp::K => c + 273.15,
        Temp::C => c,
    }
}

fn convert_inner(value: f64, from_raw: &str, to_raw: &str) -> Result<f64, String> {
    let from = find_unit(from_raw).ok_or_else(|| {
        format!(
            "Unknown unit `{}` — I speak metric, imperial, bytes, kelvin and 9 currencies",
            from_raw.trim()
        )
    })?;
    let to = find_unit(to_raw).ok_or_else(|| {
        format!(
            "Unknown unit `{}` — I speak metric, imperial, bytes, kelvin and 9 currencies",
            to_raw.trim()
        )
    })?;
    if from.cat.id != to.cat.id {
        return Err(format!(
            "Dimension clash — `{}` is {} but `{}` is {}. I don't bend physics.",
            from_raw.trim(),
            from.cat.id,
            to_raw.trim(),
            to.cat.id
        ));
    }
    match (from.temp, to.temp) {
        (Some(a), Some(b)) => Ok(from_celsius(to_celsius(value, a), b)),
        _ => Ok(value * from.factor / to.factor),
    }
}

/* ============================ WASM exports ============================ */

/// Evaluate an arithmetic expression. Errors are returned as JsValue strings.
#[wasm_bindgen]
pub fn evaluate(expr: &str) -> Result<f64, JsValue> {
    evaluate_inner(expr).map_err(|e| JsValue::from_str(&e))
}

/// Format a kernel result with 12 significant figures + thousands grouping.
#[wasm_bindgen]
pub fn format_number(n: f64) -> Result<String, JsValue> {
    format_inner(n).map_err(|e| JsValue::from_str(&e))
}

/// Convert `value` between two units. Returns the converted number.
#[wasm_bindgen]
pub fn convert(value: f64, from: &str, to: &str) -> Result<f64, JsValue> {
    convert_inner(value, from, to).map_err(|e| JsValue::from_str(&e))
}

/// Resolve the canonical key + category label for a unit name ("miles" -> "mi|length").
#[wasm_bindgen]
pub fn resolve_unit(raw: &str) -> Result<String, JsValue> {
    match find_unit(raw) {
        Some(u) => Ok(format!("{}|{}", u.key, u.cat.id)),
        None => Err(JsValue::from_str(&format!("Unknown unit `{}`", raw.trim()))),
    }
}

/// Kernel identity, surfaced in the reasoning trace.
#[wasm_bindgen]
pub fn kernel_version() -> String {
    "axion-kernel 9.4.1 (rust/wasm)".into()
}

/* ============================ tests ============================ */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arithmetic_precedence() {
        assert_eq!(evaluate_inner("2 + 3 * 4").unwrap(), 14.0);
        assert_eq!(evaluate_inner("(2 + 3) * 4").unwrap(), 20.0);
        assert_eq!(evaluate_inner("2^10").unwrap(), 1024.0);
        assert_eq!(evaluate_inner("5!").unwrap(), 120.0);
        assert_eq!(evaluate_inner("sqrt(144) + 2pi - 2pi").unwrap(), 12.0);
        assert_eq!(evaluate_inner("min(3,4) + max(1,2)").unwrap(), 5.0);
        assert!(evaluate_inner("1/0").is_err());
        assert!(evaluate_inner("2 +").is_err());
        assert!(evaluate_inner("foo(3)").is_err());
    }

    #[test]
    fn unit_roundtrip() {
        let mi = convert_inner(100.0, "km", "mi").unwrap();
        let back = convert_inner(mi, "miles", "kilometers").unwrap();
        assert!((back - 100.0).abs() < 1e-9);
        assert!((convert_inner(100.0, "c", "f").unwrap() - 212.0).abs() < 1e-9);
        assert!(convert_inner(1.0, "kg", "km").is_err());
    }
}
