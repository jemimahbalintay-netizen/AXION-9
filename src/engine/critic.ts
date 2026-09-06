/**
 * Critic Agent — an independent verification pass that reviews deterministic
 * engine output before it reaches the operator. When the WASM kernel serves
 * the result, the TypeScript kernel acts as a second witness; when TypeScript
 * serves it, structural invariants (round-trips, bounds, determinism) are
 * re-derived from scratch. A failed check flips the message into fault state.
 */
import { evaluate as tsEvaluate } from './math';
import { convert as tsConvert } from './units';
import type { KernelBackend } from './kernel-bridge';

export interface CriticCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export const criticPassed = (checks: CriticCheck[]): boolean => checks.every((c) => c.ok);

function relClose(a: number, b: number, eps = 1e-9): boolean {
  if (a === b) return true;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) / scale < eps;
}

/** Review an arithmetic result. `witness` re-derives the answer independently. */
export function critiqueMath(expr: string, value: number, backend: KernelBackend): CriticCheck[] {
  const checks: CriticCheck[] = [];

  checks.push({
    name: 'finiteness',
    ok: Number.isFinite(value),
    detail: Number.isFinite(value) ? 'result is a finite IEEE-754 double' : 'result diverged to infinity or NaN',
  });

  const magnitudeOk = !Number.isFinite(value) || Math.abs(value) < 1e150 || value === 0;
  checks.push({
    name: 'magnitude guard',
    ok: magnitudeOk,
    detail: magnitudeOk ? `|result| within safe display envelope` : `|result| ≥ 1e150 — likely an input typo`,
  });

  let witnessOk = true;
  let witnessDetail = '';
  if (backend === 'wasm-worker') {
    try {
      const ts = tsEvaluate(expr);
      witnessOk = relClose(ts, value, 1e-9);
      witnessDetail = witnessOk
        ? 'TypeScript witness re-derived the identical value (cross-kernel agreement)'
        : `witness disagrees: ts=${ts} vs wasm=${value}`;
    } catch {
      witnessOk = false;
      witnessDetail = 'TypeScript witness refused an expression WASM accepted — semantics drift';
    }
  } else {
    try {
      const again = tsEvaluate(expr);
      witnessOk = again === value;
      witnessDetail = witnessOk
        ? 'deterministic re-run produced bit-identical output'
        : 're-run diverged — nondeterminism detected in the kernel';
    } catch {
      witnessOk = false;
      witnessDetail = 'expression failed on re-evaluation — unstable parse';
    }
  }
  checks.push({ name: backend === 'wasm-worker' ? 'cross-kernel witness' : 'determinism re-run', ok: witnessOk, detail: witnessDetail });

  return checks;
}

/** Review a unit conversion via an independent round-trip inverse. */
export function critiqueUnit(value: number, from: string, to: string, result: number): CriticCheck[] {
  const checks: CriticCheck[] = [];
  checks.push({
    name: 'finiteness',
    ok: Number.isFinite(result),
    detail: Number.isFinite(result) ? 'converted value is finite' : 'conversion diverged',
  });

  let roundOk = false;
  let roundDetail = 'inverse path could not be verified';
  try {
    const back = tsConvert(result, to, from).result;
    roundOk = relClose(back, value, 1e-6);
    roundDetail = roundOk
      ? `round-trip ${from} → ${to} → ${from} closed within 1e-6 relative error`
      : `round-trip drifted: ${value} → ${result} → ${back}`;
  } catch (err) {
    roundDetail = `inverse conversion fault: ${err instanceof Error ? err.message : 'unknown'}`;
  }
  checks.push({ name: 'round-trip inverse', ok: roundOk, detail: roundDetail });

  const signOk = !Number.isFinite(result) || (value === 0 ? true : Math.sign(result) === Math.sign(value) || to === '°c' || to === '°f' || to === 'k');
  checks.push({
    name: 'sign preservation',
    ok: signOk,
    detail: signOk ? 'sign is consistent with the affine transform applied' : 'sign flipped unexpectedly — inspect the offset math',
  });

  return checks;
}

/** Review a percentage computation via an order-of-operations variant. */
export function critiquePercent(p: number, n: number, result: number): CriticCheck[] {
  const alt = (n * p) / 100;
  const ok = relClose(alt, result, 1e-12);
  return [
    { name: 'operation-order variant', ok, detail: ok ? `(n·p)/100 agrees with (p/100)·n to 1e-12` : `variants disagree: ${alt} vs ${result}` },
    { name: 'finiteness', ok: Number.isFinite(result), detail: Number.isFinite(result) ? 'result is finite' : 'result diverged' },
  ];
}

/** Review temporal targets against a sanity envelope. */
export function critiqueTime(date: Date): CriticCheck[] {
  const y = date.getFullYear();
  const ok = y >= 1970 && y <= 2300 && Number.isFinite(date.getTime());
  return [
    {
      name: 'temporal envelope',
      ok,
      detail: ok ? `target year ${y} inside [1970, 2300] sanity window` : `target year ${y} outside the sanity window — parser likely misread the input`,
    },
  ];
}

/** Render critic verdicts into a trace line. */
export function criticSummary(checks: CriticCheck[]): string {
  const failed = checks.filter((c) => !c.ok);
  return failed.length === 0
    ? `all ${checks.length} checks passed`
    : `${failed.length}/${checks.length} checks FAILED: ${failed.map((f) => f.name).join(', ')}`;
}
