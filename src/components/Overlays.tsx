import { useEffect, useRef, useState } from 'react';
import { IconAlert, IconCheck, IconCommand, IconInfo, IconSearch } from './icons';

/* ---------------- command palette ---------------- */

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
}

interface PaletteProps {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  onRun: (id: string) => void;
}

export function Palette({ open, onClose, items, onRun }: PaletteProps) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()));

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setSel(0), [q]);

  if (!open) return null;

  const groups = [...new Set(filtered.map((f) => f.group))];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <button type="button" aria-label="Close palette" onClick={onClose} className="anim-fade-in absolute inset-0 bg-ink-950/75 backdrop-blur-sm" />
      <div className="anim-fade-up relative w-full max-w-xl overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-[0_24px_80px_rgb(0_0_0/0.6)]">
        <div className="flex items-center gap-2.5 border-b border-ink-700 px-4 py-3">
          <IconSearch size={15} className="shrink-0 text-ember-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(filtered.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter' && filtered[sel]) {
                onRun(filtered[sel].id);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Search directives and actions…"
            className="flex-1 bg-transparent text-[14px] text-ink-50 outline-none placeholder:text-ink-500"
          />
          <kbd className="rounded border border-ink-600 bg-ink-850 px-1.5 py-0.5 font-mono text-[9.5px] text-ink-400">esc</kbd>
        </div>
        <div className="max-h-[46vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center font-mono text-[12px] text-ink-500">no directive matches “{q}”</div>
          )}
          {groups.map((g) => (
            <div key={g}>
              <div className="px-4 pb-1 pt-2.5 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-500">{g}</div>
              {filtered
                .filter((f) => f.group === g)
                .map((item) => {
                  const idx = filtered.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setSel(idx)}
                      onClick={() => onRun(item.id)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${idx === sel ? 'bg-ink-700/70' : ''}`}
                    >
                      <IconCommand size={13} className={idx === sel ? 'text-ember-300' : 'text-ink-500'} />
                      <span className="flex-1 truncate text-[13px] text-ink-100">{item.label}</span>
                      {item.hint && <span className="shrink-0 truncate font-mono text-[10px] text-ink-500">{item.hint}</span>}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- toasts ---------------- */

export type ToastKind = 'ok' | 'err' | 'info';
export interface ToastItem {
  id: string;
  kind: ToastKind;
  text: string;
}

const KIND_STYLE: Record<ToastKind, { border: string; icon: typeof IconCheck; color: string }> = {
  ok: { border: 'border-ok/50', icon: IconCheck, color: 'text-ok' },
  err: { border: 'border-danger/50', icon: IconAlert, color: 'text-danger' },
  info: { border: 'border-aqua-400/50', icon: IconInfo, color: 'text-aqua-300' },
};

export function Toasts({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[300px] flex-col gap-2">
      {toasts.map((t) => {
        const s = KIND_STYLE[t.kind];
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onDismiss(t.id)}
            className={`anim-toast pointer-events-auto flex items-center gap-2.5 rounded-lg border ${s.border} bg-ink-900/95 px-3.5 py-2.5 text-left shadow-[0_10px_36px_rgb(0_0_0/0.5)] backdrop-blur transition-transform hover:scale-[1.02]`}
          >
            <s.icon size={14} className={`shrink-0 ${s.color}`} />
            <span className="text-[12.5px] leading-snug text-ink-100">{t.text}</span>
          </button>
        );
      })}
    </div>
  );
}
