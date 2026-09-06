/**
 * Off-main-thread home for the Rust/WASM kernel.
 * The UI thread talks to this worker via postMessage RPC, so heavy
 * computation NEVER blocks rendering. If the WASM artifact is absent
 * (not yet built with wasm-pack), the worker reports `unavailable` and
 * the bridge transparently falls back to the TypeScript kernel.
 */

interface WasmKernel {
  evaluate(expr: string): number;
  format_number(n: number): string;
  convert(value: number, from: string, to: string): number;
  kernel_version(): string;
}

interface RpcRequest {
  id: number;
  kind: 'evaluate' | 'format' | 'convert' | 'version';
  expr?: string;
  value?: number;
  from?: string;
  to?: string;
}

let kernel: WasmKernel | null = null;
let failed = false;

async function boot(): Promise<void> {
  try {
    const base = new URL('../../pkg/axion-kernel/axion_kernel.js', import.meta.url);
    const mod = (await import(/* @vite-ignore */ base.href)) as {
      default?: (init?: unknown) => Promise<void>;
      evaluate: (e: string) => number;
      format_number: (n: number) => string;
      convert: (v: number, f: string, t: string) => number;
      kernel_version: () => string;
    };
    if (typeof mod.default === 'function') await mod.default();
    kernel = mod;
    self.postMessage({ type: 'ready', version: mod.kernel_version() });
  } catch {
    failed = true;
    self.postMessage({ type: 'unavailable' });
  }
}

self.onmessage = (ev: MessageEvent<RpcRequest | { type: 'boot' }>) => {
  const data = ev.data;
  if (!data || typeof data !== 'object') return;
  if ('type' in data && data.type === 'boot') {
    void boot();
    return;
  }
  const req = data as RpcRequest;
  const reply = (payload: Record<string, unknown>) => self.postMessage({ id: req.id, ...payload });
  if (failed || !kernel) {
    reply({ ok: false, error: 'wasm-unavailable' });
    return;
  }
  try {
    switch (req.kind) {
      case 'evaluate':
        reply({ ok: true, value: kernel.evaluate(req.expr ?? '') });
        break;
      case 'format':
        reply({ ok: true, value: kernel.format_number(req.value ?? 0) });
        break;
      case 'convert':
        reply({ ok: true, value: kernel.convert(req.value ?? 0, req.from ?? '', req.to ?? '') });
        break;
      case 'version':
        reply({ ok: true, value: kernel.kernel_version() });
        break;
    }
  } catch (err) {
    reply({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

self.postMessage({ type: 'hello' });
