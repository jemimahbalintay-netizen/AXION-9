import { useEffect, useState } from 'react';
import type { NeuroState } from '../engine/neuro';

/* ---------------- system bridge (Tauri sysinfo → browser synthetic) ---------------- */

export interface TauriMetrics {
  cpu_usage: number;
  ram_used_mb: number;
  ram_total_mb: number;
  core_count: number;
  uptime_secs: number;
}

interface TauriBridge {
  core?: { invoke?: <T>(cmd: string) => Promise<T> };
}
interface WindowWithTauri extends Window {
  __TAURI__?: TauriBridge;
  __TAURI_INTERNALS__?: unknown;
}

export function detectTauri(): boolean {
  const w = window as WindowWithTauri;
  return !!w.__TAURI__ || !!w.__TAURI_INTERNALS__;
}

async function fetchTauriMetrics(): Promise<TauriMetrics | null> {
  const w = window as WindowWithTauri;
  const invoke = w.__TAURI__?.core?.invoke;
  if (!invoke) return null;
  try {
    return await invoke<TauriMetrics>('system_metrics');
  } catch {
    return null;
  }
}

interface PerfWithMemory extends Performance {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
}

export interface LiveMetrics {
  coreLoad: number; // 0..1 — pipeline pressure
  fps: number;
  heapMB: number | null;
  storageKB: number;
  tauri: TauriMetrics | null;
}

function storageKB(): number {
  try {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) bytes += k.length + (localStorage.getItem(k)?.length ?? 0);
    }
    return Math.round((bytes * 2) / 1024); // UTF-16
  } catch {
    return 0;
  }
}

export function useLiveMetrics(latencySamples: number[], neuro: NeuroState): LiveMetrics {
  const [metrics, setMetrics] = useState<LiveMetrics>({ coreLoad: 0, fps: 60, heapMB: null, storageKB: 0, tauri: null });

  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = () => {
      frames++;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const iv = setInterval(() => {
      const now = performance.now();
      const fps = Math.min(120, Math.round((frames * 1000) / Math.max(1, now - last)));
      frames = 0;
      last = now;

      const recent = latencySamples.slice(-6);
      const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
      const neuralHeat = neuro.status === 'downloading' || neuro.status === 'loading' ? 0.35 : 0;
      const coreLoad = Math.min(1, avg / 1600 + neuralHeat);

      const perf = performance as PerfWithMemory;
      const heapMB = perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1048576) : null;

      void fetchTauriMetrics().then((tauri) => {
        setMetrics({ coreLoad, fps, heapMB, storageKB: storageKB(), tauri });
      });
    }, 1300);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
    };
  }, [latencySamples, neuro.status]);

  return metrics;
}

/* ---------------- radial gauge ---------------- */

interface GaugeProps {
  label: string;
  sub: string;
  value: number; // 0..1
  display: string;
  accent: 'ember' | 'aqua' | 'ok' | 'warn';
}

const ACCENTS: Record<GaugeProps['accent'], string> = {
  ember: '#ffb454',
  aqua: '#4fe0c2',
  ok: '#5ce39d',
  warn: '#ffd166',
};

export function Gauge({ label, sub, value, display, accent }: GaugeProps) {
  const R = 30;
  const C = 2 * Math.PI * R;
  const sweep = 0.75; // 270°
  const v = Math.max(0, Math.min(1, value));
  const offset = C * sweep * (1 - v);
  const color = ACCENTS[accent];
  return (
    <div className="flex flex-col items-center rounded-lg border border-ink-700 bg-ink-850/80 px-2 py-3">
      <div className="relative h-[76px] w-[76px]">
        <svg viewBox="0 0 76 76" className="h-full w-full -rotate-[225deg]">
          <circle cx="38" cy="38" r={R} fill="none" stroke="var(--color-ink-700)" strokeWidth="5" strokeDasharray={`${C * sweep} ${C}`} strokeLinecap="round" />
          <circle
            cx="38"
            cy="38"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${C * sweep} ${C}`}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)', filter: `drop-shadow(0 0 4px ${color}66)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[13px] font-bold leading-none text-ink-50">{display}</span>
        </div>
      </div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-200">{label}</div>
      <div className="font-mono text-[8px] text-ink-500">{sub}</div>
    </div>
  );
}

export function GaugeRow({ metrics, neuro }: { metrics: LiveMetrics; neuro: NeuroState }) {
  const t = metrics.tauri;
  return (
    <div className="grid grid-cols-3 gap-2">
      <Gauge
        label="core load"
        sub={t ? `sysinfo · ${t.core_count} cores` : 'pipeline latency'}
        value={t ? Math.min(1, t.cpu_usage / 100) : metrics.coreLoad}
        display={t ? `${Math.round(t.cpu_usage)}%` : `${Math.round(metrics.coreLoad * 100)}%`}
        accent="ember"
      />
      <Gauge
        label="memory"
        sub={t ? `of ${t.ram_total_mb} MB` : metrics.heapMB !== null ? 'JS heap' : 'local store'}
        value={t ? Math.min(1, t.ram_used_mb / Math.max(1, t.ram_total_mb)) : metrics.heapMB !== null ? Math.min(1, metrics.heapMB / 2048) : Math.min(1, metrics.storageKB / 4096)}
        display={t ? `${t.ram_used_mb}` : metrics.heapMB !== null ? `${metrics.heapMB}M` : `${metrics.storageKB}K`}
        accent="aqua"
      />
      <Gauge
        label="render"
        sub={neuro.status === 'ready' ? `${neuro.provider} hot` : neuro.status}
        value={Math.min(1, metrics.fps / 60)}
        display={`${metrics.fps}`}
        accent={neuro.status === 'ready' ? 'ok' : metrics.fps > 45 ? 'aqua' : 'warn'}
      />
    </div>
  );
}
