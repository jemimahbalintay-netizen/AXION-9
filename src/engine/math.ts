/**
 * Sandboxed arithmetic kernel — recursive-descent parser.
 * No eval(), no Function(), no network. Pure arithmetic only.
 */

type Tok =
  | { k: 'num'; v: number }
  | { k: 'id'; v: string }
  | { k: 'op'; v: string }
  | { k: 'lp' }
  | { k: 'rp' }
  | { k: 'comma' }
  | { k: 'bang' };

const CONSTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2,
};

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log: Math.log10,
  ln: Math.log,
  log2: Math.log2,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  exp: Math.exp,
  sign: Math.sign,
};

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const s = src
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, ' pi ')
    .replace(/\*\*/g, '^');
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[\d.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[\d.]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      const v = Number(raw);
      if (!Number.isFinite(v) || (raw.match(/\./g) ?? []).length > 1) {
        throw new Error(`Malformed number \`${raw}\``);
      }
      toks.push({ k: 'num', v });
      i = j;
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      let j = i;
      while (j < s.length && /[a-z]/i.test(s[j])) j++;
      let word = s.slice(i, j).toLowerCase();
      if (word === 'mod') {
        toks.push({ k: 'op', v: '%' });
      } else if (word === 'x') {
        toks.push({ k: 'op', v: '*' });
      } else {
        toks.push({ k: 'id', v: word });
      }
      i = j;
      continue;
    }
    if ('+-*/%^'.includes(ch)) {
      toks.push({ k: 'op', v: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      toks.push({ k: 'lp' });
      i++;
      continue;
    }
    if (ch === ')') {
      toks.push({ k: 'rp' });
      i++;
      continue;
    }
    if (ch === ',') {
      toks.push({ k: 'comma' });
      i++;
      continue;
    }
    if (ch === '!') {
      toks.push({ k: 'bang' });
      i++;
      continue;
    }
    throw new Error(`Unexpected character \`${ch}\` — only arithmetic is accepted here`);
  }
  return toks;
}

class Parser {
  private pos = 0;
  constructor(private toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  private next(): Tok | undefined {
    return this.toks[this.pos++];
  }

  parse(): number {
    if (this.toks.length === 0) throw new Error('Empty expression');
    const v = this.expr();
    if (this.pos < this.toks.length) {
      const t = this.toks[this.pos];
      throw new Error(`Unexpected \`${'v' in t ? String(t.v) : t.k === 'lp' ? '(' : ')'}\` — expression malformed`);
    }
    return v;
  }

  private expr(): number {
    let v = this.term();
    for (;;) {
      const t = this.peek();
      if (t && t.k === 'op' && (t.v === '+' || t.v === '-')) {
        this.next();
        const r = this.term();
        v = t.v === '+' ? v + r : v - r;
      } else break;
    }
    return v;
  }

  private term(): number {
    let v = this.factor();
    for (;;) {
      const t = this.peek();
      if (t && t.k === 'op' && (t.v === '*' || t.v === '/' || t.v === '%')) {
        this.next();
        const r = this.factor();
        if (t.v === '*') v *= r;
        else if (t.v === '/') {
          if (r === 0) throw new Error('Division by zero — the kernel refuses');
          v /= r;
        } else {
          if (r === 0) throw new Error('Modulo by zero — the kernel refuses');
          v %= r;
        }
      } else if (t && (t.k === 'num' || t.k === 'id' || t.k === 'lp')) {
        // implicit multiplication: 2pi, 3(4+1), 2sqrt(9)
        v *= this.factor();
      } else break;
    }
    return v;
  }

  private factor(): number {
    const t = this.peek();
    if (t && t.k === 'op' && (t.v === '-' || t.v === '+')) {
      this.next();
      const v = this.factor();
      return t.v === '-' ? -v : v;
    }
    return this.power();
  }

  private power(): number {
    const base = this.postfix();
    const t = this.peek();
    if (t && t.k === 'op' && t.v === '^') {
      this.next();
      const exp = this.factor();
      const r = Math.pow(base, exp);
      if (Number.isNaN(r)) throw new Error(`\`${base}^${exp}\` is undefined in reals`);
      return r;
    }
    return base;
  }

  private postfix(): number {
    let v = this.primary();
    while (this.peek()?.k === 'bang') {
      this.next();
      if (v < 0 || !Number.isInteger(v)) throw new Error('Factorial needs a non-negative integer');
      if (v > 170) throw new Error('Factorial above 170 overflows IEEE-754');
      let acc = 1;
      for (let k = 2; k <= v; k++) acc *= k;
      v = acc;
    }
    return v;
  }

  private primary(): number {
    const t = this.next();
    if (!t) throw new Error('Expression ends abruptly — expected a value');
    if (t.k === 'num') return t.v;
    if (t.k === 'lp') {
      const v = this.expr();
      const close = this.next();
      if (!close || close.k !== 'rp') throw new Error('Missing closing parenthesis');
      return v;
    }
    if (t.k === 'id') {
      if (t.v in CONSTS) return CONSTS[t.v];
      if (t.v in FUNCS) {
        const lp = this.next();
        if (!lp || lp.k !== 'lp') throw new Error(`\`${t.v}\` needs parentheses, e.g. ${t.v}(9)`);
        const args = [this.expr()];
        while (this.peek()?.k === 'comma') {
          this.next();
          args.push(this.expr());
        }
        const close = this.next();
        if (!close || close.k !== 'rp') throw new Error('Missing closing parenthesis');
        if (t.v === 'min') return Math.min(...args);
        if (t.v === 'max') return Math.max(...args);
        if (args.length !== 1) throw new Error(`\`${t.v}\` takes exactly one argument`);
        const r = FUNCS[t.v](args[0]);
        if (Number.isNaN(r)) throw new Error(`\`${t.v}(${args[0]})\` is undefined`);
        return r;
      }
      throw new Error(`Unknown identifier \`${t.v}\` — not a known function or constant`);
    }
    throw new Error('Unexpected token where a value was expected');
  }
}

export function evaluate(expr: string): number {
  const toks = tokenize(expr);
  return new Parser(toks).parse();
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error('Result diverges — not a finite number');
  const r = Number(n.toPrecision(12));
  if (Object.is(r, -0)) return '0';
  if (Number.isInteger(r) && Math.abs(r) < 1e15) return r.toLocaleString('en-US');
  const a = Math.abs(r);
  if (a !== 0 && (a >= 1e15 || a < 1e-9)) return r.toExponential(6);
  return String(r);
}
