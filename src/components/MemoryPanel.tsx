import { useState } from 'react';
import { bytesUsed, relTime, type Memory, type Stats } from '../lib/store';
import { IconCheck, IconCopy, IconDatabase, IconPlus, IconTask, IconTrash, IconX } from './icons';

interface MemoryPanelProps {
  open: boolean;
  onClose: () => void;
  memory: Memory;
  stats: Stats;
  onAddNote: (text: string) => void;
  onDelNote: (id: string) => void;
  onAddTask: (text: string) => void;
  onToggleTask: (id: string) => void;
  onDelTask: (id: string) => void;
  onClearDone: () => void;
  onWipe: () => void;
  onCopy: (text: string) => void;
}

const STORE_KEYS = ['axion.sessions.v1', 'axion.active.v1', 'axion.memory.v1', 'axion.stats.v1'];

export function MemoryPanel({
  open,
  onClose,
  memory,
  stats,
  onAddNote,
  onDelNote,
  onAddTask,
  onToggleTask,
  onDelTask,
  onClearDone,
  onWipe,
  onCopy,
}: MemoryPanelProps) {
  const [noteDraft, setNoteDraft] = useState('');
  const [taskDraft, setTaskDraft] = useState('');

  if (!open) return null;

  const toolTop = Object.entries(stats.tools).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxTool = toolTop[0]?.[1] ?? 1;
  const kb = (bytesUsed(STORE_KEYS) / 1024).toFixed(1);
  const doneCount = memory.tasks.filter((t) => t.done).length;

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink-700/70 px-4 py-4">
        <IconDatabase size={16} className="text-aqua-400" />
        <div>
          <div className="font-display text-[14px] font-semibold tracking-tight text-ink-50">Telemetry & Lattice</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-500">local persistence</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="ml-auto rounded p-1.5 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100"
        >
          <IconX size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* telemetry */}
        <section className="border-b border-ink-700/70 px-4 py-4">
          <h3 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-500">core telemetry</h3>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-2">
              <div className="font-display text-[19px] font-bold leading-none text-ember-300">{stats.queries}</div>
              <div className="mt-1 font-mono text-[8.5px] uppercase tracking-wider text-ink-500">queries</div>
            </div>
            <div className="rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-2">
              <div className="font-display text-[19px] font-bold leading-none text-aqua-300">{memory.notes.length + memory.tasks.length}</div>
              <div className="mt-1 font-mono text-[8.5px] uppercase tracking-wider text-ink-500">records</div>
            </div>
            <div className="rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-2">
              <div className="font-display text-[19px] font-bold leading-none text-ink-100">{kb}</div>
              <div className="mt-1 font-mono text-[8.5px] uppercase tracking-wider text-ink-500">kb stored</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-500">tool dispatch frequency</div>
            {toolTop.length === 0 ? (
              <p className="font-mono text-[10.5px] text-ink-500">no dispatches yet — the kernel is idle</p>
            ) : (
              <div className="space-y-1.5">
                {toolTop.map(([tool, n]) => (
                  <div key={tool} className="flex items-center gap-2 font-mono text-[10px]">
                    <span className="w-28 shrink-0 truncate text-ink-300">{tool}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-ember-600 to-ember-400 transition-all duration-700"
                        style={{ width: `${Math.max(8, (n / maxTool) * 100)}%` }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right text-ink-400">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* notes */}
        <section className="border-b border-ink-700/70 px-4 py-4">
          <h3 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-500">notes · {memory.notes.length}</h3>
          <form
            className="mt-2 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (noteDraft.trim()) {
                onAddNote(noteDraft.trim());
                setNoteDraft('');
              }
            }}
          >
            <input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="store a note…"
              className="min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-850 px-2.5 py-1.5 text-[12.5px] text-ink-50 outline-none transition-colors placeholder:text-ink-500 focus:border-ember-400/70"
            />
            <button
              type="submit"
              disabled={!noteDraft.trim()}
              aria-label="Add note"
              className="shrink-0 rounded-md border border-ink-600 bg-ink-800 p-1.5 text-ember-300 transition-all hover:border-ember-400/60 active:scale-90 disabled:text-ink-500"
            >
              <IconPlus size={14} />
            </button>
          </form>
          <ul className="mt-2 space-y-1.5">
            {memory.notes.length === 0 && (
              <li className="rounded-md border border-dashed border-ink-700 px-3 py-3 text-center font-mono text-[10.5px] text-ink-500">
                lattice empty — say “remember: …”
              </li>
            )}
            {memory.notes.map((n) => (
              <li key={n.id} className="group flex items-start gap-2 rounded-md border border-ink-700 bg-ink-850 px-2.5 py-2 transition-colors hover:border-ink-600">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[12.5px] leading-snug text-ink-100">{n.text}</p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-500">{relTime(n.ts)}</p>
                </div>
                <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button type="button" aria-label="Copy note" onClick={() => onCopy(n.text)} className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-aqua-300">
                    <IconCopy size={12} />
                  </button>
                  <button type="button" aria-label="Delete note" onClick={() => onDelNote(n.id)} className="rounded p-1 text-ink-400 hover:bg-danger/15 hover:text-danger">
                    <IconTrash size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* tasks */}
        <section className="px-4 py-4">
          <h3 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-500">
            tasks · {memory.tasks.length - doneCount} open / {doneCount} done
          </h3>
          <form
            className="mt-2 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (taskDraft.trim()) {
                onAddTask(taskDraft.trim());
                setTaskDraft('');
              }
            }}
          >
            <input
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
              placeholder="commit a task…"
              className="min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-850 px-2.5 py-1.5 text-[12.5px] text-ink-50 outline-none transition-colors placeholder:text-ink-500 focus:border-ember-400/70"
            />
            <button
              type="submit"
              disabled={!taskDraft.trim()}
              aria-label="Add task"
              className="shrink-0 rounded-md border border-ink-600 bg-ink-800 p-1.5 text-ember-300 transition-all hover:border-ember-400/60 active:scale-90 disabled:text-ink-500"
            >
              <IconPlus size={14} />
            </button>
          </form>
          <ul className="mt-2 space-y-1.5">
            {memory.tasks.length === 0 && (
              <li className="rounded-md border border-dashed border-ink-700 px-3 py-3 text-center font-mono text-[10.5px] text-ink-500">
                queue empty — say “add task: …”
              </li>
            )}
            {memory.tasks.map((t) => (
              <li key={t.id} className="group flex items-start gap-2 rounded-md border border-ink-700 bg-ink-850 px-2.5 py-2 transition-colors hover:border-ink-600">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={t.done}
                  aria-label={`Toggle ${t.text}`}
                  onClick={() => onToggleTask(t.id)}
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all active:scale-90 ${
                    t.done ? 'border-ok/70 bg-ok/20 text-ok' : 'border-ink-500 text-transparent hover:border-aqua-400'
                  }`}
                >
                  <IconCheck size={10} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`break-words text-[12.5px] leading-snug ${t.done ? 'text-ink-500 line-through' : 'text-ink-100'}`}>{t.text}</p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-500">{relTime(t.ts)}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Delete ${t.text}`}
                  onClick={() => onDelTask(t.id)}
                  className="shrink-0 rounded p-1 text-ink-500 opacity-0 transition-all hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
                >
                  <IconTrash size={12} />
                </button>
              </li>
            ))}
          </ul>
          {doneCount > 0 && (
            <button
              type="button"
              onClick={onClearDone}
              className="mt-2.5 flex items-center gap-1.5 rounded-md border border-ink-600 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-300 transition-all hover:border-warn/60 hover:text-warn active:scale-95"
            >
              <IconTask size={12} /> sweep {doneCount} done
            </button>
          )}
        </section>
      </div>

      <div className="border-t border-ink-700/70 p-3">
        <button
          type="button"
          onClick={onWipe}
          className="w-full rounded-md border border-danger/40 bg-danger/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-danger/90 transition-all hover:bg-danger/15 active:scale-[0.98]"
        >
          wipe memory lattice
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-[304px] shrink-0 border-l border-ink-700/70 bg-ink-900/80 backdrop-blur xl:block">{content}</aside>
      <div className="fixed inset-0 z-40 xl:hidden">
        <button type="button" aria-label="Close" onClick={onClose} className="anim-fade-in absolute inset-0 bg-ink-950/70 backdrop-blur-sm" />
        <aside className="anim-fade-up absolute inset-y-0 right-0 w-[320px] border-l border-ink-700 bg-ink-900 shadow-2xl">{content}</aside>
      </div>
    </>
  );
}
