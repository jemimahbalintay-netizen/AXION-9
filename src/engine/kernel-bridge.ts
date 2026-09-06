/**
 * Kernel bridge — routes compute to the Rust/WASM worker when the artifact
 * exists (`wasm-pack build crates/axion-kernel --target web --out-dir pkg/axion-kernel`),
 * and degrades to the audited TypeScript kernel otherwise. Both paths share
 * identical semantics; the backend used is surfaced in the reasoning trace.
 */
import { evaluate as tsEvaluate, formatNumber as tsFormat } from './math';
import { convert as tsConvert, type ConvertResult } from './units';

export type KernelBackend = 'wasm-worker' | 'ts';

export interface KernelOutcome {
  value: number;
  formatted: string;
  backend: KernelBackend;
  version: string;
}

interface RpcReply {
  id?: number;
  type?: 'hello' | 'ready' | 'unavailable';
  version?: string;
  ok?: boolean;
  value?: number | string;
  error?: string;
}

let worker: Worker | null = null;
let workerState: 'idle' | 'booting' | 'ready' | 'unavailable' = 'idle';
let wasmVersion = 'unknown';
const waiters = new Set<(state: 'ready' | 'unavailable') => void>();
let nextId = 1;
const pending = new Map<number, (reply: RpcReply) => void>();

function spawnWorker(): void {
  if (worker || workerState !== 'idle') return;
  workerState = 'booting';
  try {
    worker = new Worker(new URL('./kernel-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<RpcReply>) => {
      const d = ev.data;
      if (d.type === 'ready') {
        wasmVersion = d.version ?? 'wasm';
        workerState = 'ready';
        waiters.forEach((w) => w('ready'));
        waiters.clear();
        return;
      }
      if (d.type === 'unavailable') {
        workerState = 'unavailable';
        waiters.forEach((w) => w('unavailable'));
        waiters.clear();
        return;
      }
      if (typeof d.id === 'number') {
        const resolve = pending.get(d.id);
        if (resolve) {
          pending.delete(d.id);
          resolve(d);
        }
      }
    };
    worker.onerror = () => {
      workerState = 'unavailable';
      waiters.forEach((w) => w('unavailable'));
      waiters.clear();
    };
    worker.postMessage({ type: 'boot' });
    // hard ceiling: if WASM hasn't reported in 2.5s, stay on TS forever
    setTimeout(() => {
      if (workerState === 'booting') {
        workerState = 'unavailable';
        waiters.forEach((w) => w('unavailable'));
        waiters.clear();
      }
    }, 2500);
  } catch {
    workerState = 'unavailable';
  }
}

function whenWorker(): Promise<'ready' | 'unavailable'> {
  spawnWorker();
  if (workerState === 'ready') return Promise.resolve('ready');
  if (workerState === 'unavailable') return Promise.resolve('unavailable');
  return new Promise((resolve) => waiters.add(resolve));
}

function rpc(kind: 'evaluate' | 'format' | 'convert', args: Record<string, unknown>): Promise<RpcReply> {
  return new Promise((resolve) => {
    if (!worker || workerState !== 'ready') {
      resolve({ ok: false, error: 'worker-not-ready' });
      return;
    }
    const id = nextId++;
    pending.set(id, resolve);
    worker.postMessage({ id, kind, ...args });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ ok: false, error: 'rpc-timeout' });
      }
    }, 1500);
  });
}

/** Warm the bridge at boot; returns the backend that will serve compute. */
export async function warmKernel(): Promise<KernelBackend> {
  const state = await whenWorker();
  return state === 'ready' ? 'wasm-worker' : 'ts';
}

export function kernelBackend(): KernelBackend {
  return workerState === 'ready' ? 'wasm-worker' : 'ts';
}

export function kernelVersion(): string {
  return workerState === 'ready' ? wasmVersion : 'axion-kernel 9.4.1 (typescript)';
}

/** Evaluate arithmetic — WASM worker first, TypeScript fallback. */
export async function evaluateKernel(expr: string): Promise<KernelOutcome> {
  const state = await whenWorker();
  if (state === 'ready') {
    const reply = await rpc('evaluate', { expr });
    if (reply.ok && typeof reply.value === 'number') {
      const value = reply.value;
      const fmt = await rpc('format', { value });
      return {
        value,
        formatted: fmt.ok && typeof fmt.value === 'string' ? fmt.value : tsFormat(value),
        backend: 'wasm-worker',
        version: wasmVersion,
      };
    }
    // WASM rejected the expression — surface its exact error message
    throw new Error(typeof reply.error === 'string' && reply.error !== 'rpc-timeout' ? reply.error : 'Kernel fault');
  }
  const value = tsEvaluate(expr);
  return { value, formatted: tsFormat(value), backend: 'ts', version: 'axion-kernel 9.4.1 (typescript)' };
}

/** Unit conversion — WASM worker first, TypeScript fallback. */
export async function convertKernel(value: number, from: string, to: string): Promise<ConvertResult & { backend: KernelBackend }> {
  const state = await whenWorker();
  if (state === 'ready') {
    const reply = await rpc('convert', { value, from, to });
    if (reply.ok && typeof reply.value === 'number') {
      // canonical keys come from the TS table (kept as the semantic source of truth)
      const meta = tsConvert(value, from, to);
      return { ...meta, result: reply.value, backend: 'wasm-worker' };
    }
    throw new Error(typeof reply.error === 'string' && reply.error !== 'rpc-timeout' ? reply.error : 'Kernel fault');
  }
  return { ...tsConvert(value, from, to), backend: 'ts' };
}
