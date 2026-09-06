import { useEffect, useState } from 'react';
import { relTime, type Memory, type Session, type Stats } from '../lib/store';
import { CoreMark } from './Chat';
import { IconDatabase, IconPlus, IconPulse, IconTrash, IconX } from './icons';

interface SidebarProps {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenPanel: () => void;
  stats: Stats;
  memory: Memory;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function useUptime(): string {
  const [s, setS] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${ss}`;
}

export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onOpenPanel,
  stats,
  memory,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const uptime = useUptime();

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-ink-700/70 px-4 py-4">
        <CoreMark size={34} />
        <div className="min-w-0">
          <div className="font-display text-[17px] font-bold tracking-tight text-ink-50">
            AXION<span className="text-ember-400">-9</span>
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-400">reasoning console</div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="ml-auto rounded p-1.5 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100 lg:hidden"
          aria-label="Close sidebar"
        >
          <IconX size={16} />
        </button>
      </div>

      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-ember-400/50 bg-ember-400/10 px-3 py-2.5 font-display text-[13px] font-semibold text-ember-300 transition-all hover:border-ember-400 hover:bg-ember-400/20 active:scale-[0.98]"
        >
          <IconPlus size={15} /> New session
        </button>
      </div>

      <div className="mt-3 px-4 font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-500">
        session buffer · {sessions.length}
      </div>

      <div className="mt-1.5 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {sessions.length === 0 && (
          <div className="px-2 py-6 text-center font-mono text-[11px] text-ink-500">no sessions — spawn one above</div>
        )}
        {sessions.map((s) => {
          const active = s.id === activeId;
          return (
            <div
              key={s.id}
              className={`group relative rounded-lg border transition-all ${
                active ? 'border-ember-400/45 bg-ink-800' : 'border-transparent hover:border-ink-600 hover:bg-ink-850'
              }`}
            >
              <button type="button" onClick={() => onSelect(s.id)} className="w-full px-3 py-2.5 pr-9 text-left">
                <div className={`truncate text-[13px] font-medium ${active ? 'text-ink-50' : 'text-ink-200'}`}>{s.title}</div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-wider text-ink-500">
                  <span>{s.messages.length} msg</span>
                  <span>·</span>
                  <span>{relTime(s.updatedAt)}</span>
                  {active && <span className="anim-dot ml-auto h-1.5 w-1.5 rounded-full bg-ember-400" />}
                </div>
              </button>
              <button
                type="button"
                aria-label={`Delete ${s.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(s.id);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-500 opacity-0 transition-all hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
              >
                <IconTrash size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-t border-ink-700/70 p-3">
        <button
          type="button"
          onClick={onOpenPanel}
          className="mb-2.5 flex w-full items-center gap-2.5 rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-left transition-all hover:border-aqua-400/50 hover:bg-ink-800"
        >
          <IconDatabase size={14} className="shrink-0 text-aqua-400" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium text-ink-100">Memory lattice</div>
            <div className="font-mono text-[9.5px] text-ink-400">
              {memory.notes.length} notes · {memory.tasks.length} tasks
            </div>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-widest text-aqua-300">open</span>
        </button>
        <div className="flex items-center justify-between rounded-lg bg-ink-900 px-3 py-2 font-mono text-[10px]">
          <span className="flex items-center gap-1.5 text-ink-300">
            <span className="anim-dot h-1.5 w-1.5 rounded-full bg-ok" />
            core online
          </span>
          <span className="text-ink-500">{uptime}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-500">
          <span className="flex items-center gap-1">
            <IconPulse size={10} className="text-ember-400" /> {stats.queries} queries served
          </span>
          <span>v9.4.1</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-[272px] shrink-0 border-r border-ink-700/70 bg-ink-900/80 backdrop-blur lg:block">{body}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close" onClick={onCloseMobile} className="anim-fade-in absolute inset-0 bg-ink-950/70 backdrop-blur-sm" />
          <aside className="anim-fade-up absolute inset-y-0 left-0 w-[290px] border-r border-ink-700 bg-ink-900 shadow-2xl">{body}</aside>
        </div>
      )}
    </>
  );
}
