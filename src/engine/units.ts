/**
 * Unit algebra — 9 dimensions, alias resolution, temperature handled non-linearly.
 */

export interface Unit {
  key: string;
  names: string[];
  factor: number;
  temp?: 'C' | 'F' | 'K';
}

export interface Category {
  id: string;
  label: string;
  approx?: boolean;
  units: Unit[];
}

export const CATEGORIES: Category[] = [
  {
    id: 'length',
    label: 'length',
    units: [
      { key: 'mm', factor: 0.001, names: ['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'] },
      { key: 'cm', factor: 0.01, names: ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'] },
      { key: 'm', factor: 1, names: ['m', 'meter', 'meters', 'metre', 'metres'] },
      { key: 'km', factor: 1000, names: ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'] },
      { key: 'in', factor: 0.0254, names: ['in', 'inch', 'inches'] },
      { key: 'ft', factor: 0.3048, names: ['ft', 'foot', 'feet'] },
      { key: 'yd', factor: 0.9144, names: ['yd', 'yard', 'yards'] },
      { key: 'mi', factor: 1609.344, names: ['mi', 'mile', 'miles'] },
      { key: 'nmi', factor: 1852, names: ['nmi', 'nautical mile', 'nautical miles'] },
    ],
  },
  {
    id: 'mass',
    label: 'mass',
    units: [
      { key: 'mg', factor: 1e-6, names: ['mg', 'milligram', 'milligrams'] },
      { key: 'g', factor: 0.001, names: ['g', 'gram', 'grams', 'gramme', 'grammes'] },
      { key: 'kg', factor: 1, names: ['kg', 'kilogram', 'kilograms', 'kgs'] },
      { key: 't', factor: 1000, names: ['t', 'tonne', 'tonnes', 'ton', 'tons'] },
      { key: 'oz', factor: 0.028349523125, names: ['oz', 'ounce', 'ounces'] },
      { key: 'lb', factor: 0.45359237, names: ['lb', 'lbs', 'pound', 'pounds'] },
      { key: 'st', factor: 6.35029318, names: ['st', 'stone', 'stones'] },
    ],
  },
  {
    id: 'temperature',
    label: 'temperature',
    units: [
      { key: '°c', factor: 1, temp: 'C', names: ['c', '°c', 'celsius', 'centigrade', 'deg c', 'degrees celsius'] },
      { key: '°f', factor: 1, temp: 'F', names: ['f', '°f', 'fahrenheit', 'deg f', 'degrees fahrenheit'] },
      { key: 'k', factor: 1, temp: 'K', names: ['k', 'kelvin', 'kelvins'] },
    ],
  },
  {
    id: 'volume',
    label: 'volume',
    units: [
      { key: 'ml', factor: 0.001, names: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'] },
      { key: 'l', factor: 1, names: ['l', 'liter', 'liters', 'litre', 'litres'] },
      { key: 'm³', factor: 1000, names: ['m3', 'm³', 'cubic meter', 'cubic meters', 'cubic metre'] },
      { key: 'tsp', factor: 0.00492892159, names: ['tsp', 'teaspoon', 'teaspoons'] },
      { key: 'tbsp', factor: 0.0147867648, names: ['tbsp', 'tablespoon', 'tablespoons'] },
      { key: 'fl oz', factor: 0.0295735296, names: ['fl oz', 'floz', 'fluid ounce', 'fluid ounces'] },
      { key: 'cup', factor: 0.236588236, names: ['cup', 'cups'] },
      { key: 'pt', factor: 0.473176473, names: ['pt', 'pint', 'pints'] },
      { key: 'qt', factor: 0.946352946, names: ['qt', 'quart', 'quarts'] },
      { key: 'gal', factor: 3.78541178, names: ['gal', 'gallon', 'gallons'] },
    ],
  },
  {
    id: 'area',
    label: 'area',
    units: [
      { key: 'm²', factor: 1, names: ['m2', 'm²', 'sqm', 'square meter', 'square meters', 'square metre'] },
      { key: 'km²', factor: 1e6, names: ['km2', 'km²', 'square kilometer', 'square kilometers', 'square kilometre'] },
      { key: 'ft²', factor: 0.09290304, names: ['ft2', 'ft²', 'sqft', 'sq ft', 'square foot', 'square feet'] },
      { key: 'yd²', factor: 0.83612736, names: ['yd2', 'yd²', 'square yard', 'square yards'] },
      { key: 'acre', factor: 4046.85642, names: ['acre', 'acres'] },
      { key: 'ha', factor: 10000, names: ['ha', 'hectare', 'hectares'] },
      { key: 'mi²', factor: 2589988.11, names: ['mi2', 'mi²', 'square mile', 'square miles'] },
    ],
  },
  {
    id: 'speed',
    label: 'speed',
    units: [
      { key: 'm/s', factor: 1, names: ['m/s', 'mps', 'meter per second', 'meters per second'] },
      { key: 'km/h', factor: 1 / 3.6, names: ['km/h', 'kmh', 'kph', 'kilometer per hour', 'kilometre per hour'] },
      { key: 'mph', factor: 0.44704, names: ['mph', 'mile per hour', 'miles per hour'] },
      { key: 'kn', factor: 0.514444, names: ['kn', 'kt', 'knot', 'knots'] },
      { key: 'ft/s', factor: 0.3048, names: ['ft/s', 'foot per second', 'feet per second'] },
    ],
  },
  {
    id: 'data',
    label: 'data',
    units: [
      { key: 'B', factor: 1, names: ['b', 'byte', 'bytes'] },
      { key: 'KB', factor: 1e3, names: ['kb', 'kilobyte', 'kilobytes'] },
      { key: 'MB', factor: 1e6, names: ['mb', 'megabyte', 'megabytes'] },
      { key: 'GB', factor: 1e9, names: ['gb', 'gigabyte', 'gigabytes'] },
      { key: 'TB', factor: 1e12, names: ['tb', 'terabyte', 'terabytes'] },
      { key: 'KiB', factor: 1024, names: ['kib', 'kibibyte', 'kibibytes'] },
      { key: 'MiB', factor: 1024 ** 2, names: ['mib', 'mebibyte', 'mebibytes'] },
      { key: 'GiB', factor: 1024 ** 3, names: ['gib', 'gibibyte', 'gibibytes'] },
      { key: 'TiB', factor: 1024 ** 4, names: ['tib', 'tebibyte', 'tebibytes'] },
    ],
  },
  {
    id: 'time',
    label: 'time',
    units: [
      { key: 's', factor: 1, names: ['s', 'sec', 'secs', 'second', 'seconds'] },
      { key: 'min', factor: 60, names: ['min', 'mins', 'minute', 'minutes'] },
      { key: 'h', factor: 3600, names: ['h', 'hr', 'hrs', 'hour', 'hours'] },
      { key: 'day', factor: 86400, names: ['d', 'day', 'days'] },
      { key: 'week', factor: 604800, names: ['wk', 'week', 'weeks'] },
      { key: 'month', factor: 2629800, names: ['mo', 'month', 'months'] },
      { key: 'year', factor: 31557600, names: ['yr', 'year', 'years'] },
    ],
  },
  {
    id: 'currency',
    label: 'currency',
    approx: true,
    units: [
      { key: 'USD', factor: 1, names: ['usd', '$', 'dollar', 'dollars', 'us dollar', 'us dollars'] },
      { key: 'EUR', factor: 0.92, names: ['eur', '€', 'euro', 'euros'] },
      { key: 'GBP', factor: 0.79, names: ['gbp', '£', 'pound sterling', 'british pound', 'british pounds'] },
      { key: 'JPY', factor: 149.6, names: ['jpy', '¥', 'yen', 'japanese yen'] },
      { key: 'INR', factor: 83.2, names: ['inr', '₹', 'rupee', 'rupees', 'indian rupee'] },
      { key: 'CAD', factor: 1.36, names: ['cad', 'canadian dollar', 'canadian dollars'] },
      { key: 'AUD', factor: 1.52, names: ['aud', 'australian dollar', 'australian dollars'] },
      { key: 'CHF', factor: 0.88, names: ['chf', 'swiss franc', 'swiss francs'] },
      { key: 'CNY', factor: 7.24, names: ['cny', 'rmb', 'chinese yuan', 'yuan'] },
    ],
  },
];

function normalizeUnit(s: string): string {
  return s.toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ').trim();
}

function findUnit(raw: string): { unit: Unit; cat: Category } | null {
  const s = normalizeUnit(raw);
  if (!s) return null;
  for (const cat of CATEGORIES) {
    for (const u of cat.units) {
      if (u.names.includes(s)) return { unit: u, cat };
    }
  }
  // last resort: drop a trailing plural "s"
  if (s.endsWith('s') && s.length > 2) {
    const stem = s.slice(0, -1);
    for (const cat of CATEGORIES) {
      for (const u of cat.units) {
        if (u.names.includes(stem)) return { unit: u, cat };
      }
    }
  }
  return null;
}

export interface ConvertResult {
  value: number;
  result: number;
  from: string;
  to: string;
  category: string;
  approx: boolean;
}

function toCelsius(v: number, t: 'C' | 'F' | 'K'): number {
  if (t === 'F') return ((v - 32) * 5) / 9;
  if (t === 'K') return v - 273.15;
  return v;
}
function fromCelsius(c: number, t: 'C' | 'F' | 'K'): number {
  if (t === 'F') return (c * 9) / 5 + 32;
  if (t === 'K') return c + 273.15;
  return c;
}

export function convert(value: number, fromRaw: string, toRaw: string): ConvertResult {
  const from = findUnit(fromRaw);
  const to = findUnit(toRaw);
  if (!from) {
    throw new Error(`Unknown unit \`${fromRaw.trim()}\` — I speak metric, imperial, bytes, kelvin and 9 currencies`);
  }
  if (!to) {
    throw new Error(`Unknown unit \`${toRaw.trim()}\` — I speak metric, imperial, bytes, kelvin and 9 currencies`);
  }
  if (from.cat.id !== to.cat.id) {
    throw new Error(
      `Dimension clash — \`${fromRaw.trim()}\` is ${from.cat.label} but \`${toRaw.trim()}\` is ${to.cat.label}. I don't bend physics.`,
    );
  }
  let result: number;
  if (from.unit.temp && to.unit.temp) {
    result = fromCelsius(toCelsius(value, from.unit.temp), to.unit.temp);
  } else {
    result = (value * from.unit.factor) / to.unit.factor;
  }
  return { value, result, from: from.unit.key, to: to.unit.key, category: from.cat.label, approx: !!from.cat.approx };
}

export function formatConverted(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const r = Number(n.toPrecision(10));
  if (Number.isInteger(r) && Math.abs(r) < 1e15) return r.toLocaleString('en-US');
  const a = Math.abs(r);
  if (a !== 0 && (a >= 1e15 || a < 1e-7)) return r.toExponential(5);
  if (a < 0.01) return String(r);
  return String(Number(r.toFixed(6)));
}
