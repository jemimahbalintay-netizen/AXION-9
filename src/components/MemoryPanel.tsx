import { useState } from 'react';
import type { Memory, Stats } from '../lib/store';
import type { KnowledgeGraph } from '../engine/graphdb';
import type { NeuroState } from '../engine/neuro';
import { describeProvider } from '../engine/neuro';
import type { LiveMetrics } from './Telemetry';
import { GaugeRow } from './Telemetry';
import {
  IconBrain,
  IconCheck,
  IconCopy,
  IconDatabase,
  IconGauge,
  IconLattice,
  IconNote,
  IconOrbit,
  IconPlus,
  IconTask,
  IconTrash,
  IconX,
} from './icons';

type Tab = 'lattice' | 'neural' | 'telemetry';

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
  graph: KnowledgeGraph;
  onOpenGraph: () => void;
  neuro: NeuroState;
  neuroEnabled: boolean;
  onToggleNeural: () => void;
  onInitNeural: () => void;
  onUnloadNeural: () => void;
  metrics: LiveMetrics;
  kernelLabel: string;
}

const NEURO_STATUS_META: Record<NeuroState['status'], { label: string; color: string; pulse: boolean }> = {
  absent: { label: 'no substrate', color: 'text-ink-400', pulse: false },
  detecting: { label: 'probing hardware', color: 'text-warn', pulse: true },
  downloading: { label: 'downloading model', color: 'text-warn', pulse: true },
  loading: { label: 'loading weights', color: 'text-warn', pulse: true },
  ready: { label: 'ready', color: 'text-ok', pulse: false },
  error: { label: 'fault', color: 'text-danger', pulse: false },
};

export function MemoryPanel(props: MemoryPanelProps) {
  const {
    open, onClose, memory, stats, onAddNote, onDelNote, onAddTask, onToggleTask, onDelTask,
    onClearDone, onWipe, onCopy, graph, onOpenGraph, neuro, neuroEnabled, onToggleNeural,
    onInitNeural, onUnloadNeural, metrics, kernelLabel,
  } = props;
  const [tab, setTab] = useState<Tab>('lattice');
  const [noteDraft, setNoteDraft] = useState('');
  const [taskDraft, setTaskDraft] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);

  if (!open) return null;

  const doneCount = memory.tasks.filter((t) => t.done).length;
  const toolRows = Object.entries(stats.tools).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const maxTool = toolRows[0]?.[1] ?? 1;
  const meta = NEURO_STATUS_META[neuro.status];

  return (
    <>
      <button type="button" aria-label="Close panel" onClick={onClose} className="anim-fade-in fixed inset-0 z-30 bg-ink-950/60 backdrop-blur-sm xl:hidden" />
      <aside className="anim-fade-up fixed inset-y-0 right-0 z-40 flex w-[350px] max-w-[92vw] flex-col border-l border-ink-700 bg-ink-900 shadow-[-20px_0_60px_rgb(0_0_0/0.45)] xl:static xl:z-auto xl:shadow-none">
        <div className="flex items-center gap-2.5 border-b border-ink-700/70 px-4 py-3.5">
          <IconLattice size={16} className="text-aqua-400" />
          <span className="font-display text-[14px] font-bold tracking-tight text-ink-50">System panel</span>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-50">
            <IconX size={15} />
          </button>
        </div>

        <div className="flex gap-1 border-b border-ink-700/70 px-3 pt-2.5">
          {(
            [
              { id: 'lattice', label: 'Lattice', icon: IconNote },
              { id: 'neural', label: 'Neural', icon: IconBrain },
              { id: 'telemetry', label: 'Telemetry', icon: IconGauge },
            ] as { id: Tab; label: string; icon: typeof IconNote }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors ${
                tab === t.id ? 'border-ember-400 text-ember-300' : 'border-transparent text-ink-400 hover:text-ink-200'
              }`}
            >
              <t.icon size={12} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
          {/* ============ LATTICE ============ */}
          {tab === 'lattice' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={onOpenGraph}
                className="group flex w-full items-center gap-3 rounded-lg border border-aqua-400/40 bg-aqua-400/5 px-3.5 py-3 text-left transition-all hover:border-aqua-400/70 hover:bg-aqua-400/10"
              >
                <IconOrbit size={20} className="shrink-0 text-aqua-400 transition-transform duration-500 group-hover:rotate-180" />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[13px] font-semibold text-ink-50">Open 3D knowledge graph</div>
                  <div className="font-mono text-[9.5px] text-ink-400">
                    {graph.nodes.length} nodes · {graph.edges.length} edges
                  </div>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-widest text-aqua-300">launch</span>
              </button>

              <section>
                <div className="mb-1.5 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-500">
                  <IconNote size={11} className="text-ember-400" /> facts · {memory.notes.length}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && noteDraft.trim()) {
                        onAddNote(noteDraft.trim());
                        setNoteDraft('');
                      }
                    }}
                    placeholder="remember: …"
                    className="min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-850 px-2.5 py-1.5 text-[12px] text-ink-100 outline-none transition-colors placeholder:text-ink-500 focus:border-ember-400/60"
                  />
                  <button
                    type="button"
                    aria-label="Add note"
                    onClick={() => {
                      if (noteDraft.trim()) {
                        onAddNote(noteDraft.trim());
                        setNoteDraft('');
                      }
                    }}
                    className="rounded-md border border-ink-600 bg-ink-850 px-2 text-ink-300 transition-all hover:border-ember-400/60 hover:text-ember-300 active:scale-95"
                  >
                    <IconPlus size={13} />
                  </button>
                </div>
                <div className="mt-2 space-y-1.5">
                  {memory.notes.length === 0 && <div className="px-1 py-3 text-center font-mono text-[10.5px] text-ink-500">lattice is blank — store a fact above</div>}
                  {memory.notes.map((n) => (
                    <div key={n.id} className="group flex items-start gap-2 rounded-md border border-ink-700 bg-ink-850/70 px-2.5 py-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 bg-ember-400/80" />
                      <span className="min-w-0 flex-1 break-words text-[12px] leading-snug text-ink-100">{n.text}</span>
                      <button type="button" aria-label="Copy note" onClick={() => onCopy(n.text)} className="rounded p-1 text-ink-500 opacity-0 transition-all hover:text-aqua-300 group-hover:opacity-100">
                        <IconCopy size={11} />
                      </button>
                      <button type="button" aria-label="Delete note" onClick={() => onDelNote(n.id)} className="rounded p-1 text-ink-500 opacity-0 transition-all hover:text-danger group-hover:opacity-100">
                        <IconTrash size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-1.5 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-500">
                  <IconTask size={11} className="text-aqua-400" /> tasks · {memory.tasks.length - doneCount} open / {doneCount} done
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={taskDraft}
                    onChange={(e) => setTaskDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && taskDraft.trim()) {
                        onAddTask(taskDraft.trim());
                        setTaskDraft('');
                      }
                    }}
                    placeholder="add task: …"
                    className="min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-850 px-2.5 py-1.5 text-[12px] text-ink-100 outline-none transition-colors placeholder:text-ink-500 focus:border-aqua-400/60"
                  />
                  <button
                    type="button"
                    aria-label="Add task"
                    onClick={() => {
                      if (taskDraft.trim()) {
                        onAddTask(taskDraft.trim());
                        setTaskDraft('');
                      }
                    }}
                    className="rounded-md border border-ink-600 bg-ink-850 px-2 text-ink-300 transition-all hover:border-aqua-400/60 hover:text-aqua-300 active:scale-95"
                  >
                    <IconPlus size={13} />
                  </button>
                </div>
                <div className="mt-2 space-y-1.5">
                  {memory.tasks.length === 0 && <div className="px-1 py-3 text-center font-mono text-[10.5px] text-ink-500">no tasks committed</div>}
                  {memory.tasks.map((t) => (
                    <div key={t.id} className="group flex items-center gap-2 rounded-md border border-ink-700 bg-ink-850/70 px-2.5 py-2">
                      <button
                        type="button"
                        aria-label={t.done ? 'Reopen task' : 'Complete task'}
                        onClick={() => onToggleTask(t.id)}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all active:scale-90 ${
                          t.done ? 'border-ok bg-ok/20 text-ok' : 'border-ink-500 text-transparent hover:border-aqua-400'
                        }`}
                      >
                        <IconCheck size={10} />
                      </button>
                      <span className={`min-w-0 flex-1 break-words text-[12px] leading-snug ${t.done ? 'text-ink-500 line-through' : 'text-ink-100'}`}>{t.text}</span>
                      <button type="button" aria-label="Delete task" onClick={() => onDelTask(t.id)} className="rounded p-1 text-ink-500 opacity-0 transition-all hover:text-danger group-hover:opacity-100">
                        <IconTrash size={11} />
                      </button>
                    </div>
                  ))}
                </div>
                {doneCount > 0 && (
                  <button type="button" onClick={onClearDone} className="mt-2 w-full rounded-md border border-ink-600 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-400 transition-all hover:border-warn/60 hover:text-warn">
                    sweep {doneCount} completed
                  </button>
                )}
              </section>

              <section className="border-t border-ink-700/70 pt-3">
                {confirmWipe ? (
                  <div className="rounded-md border border-danger/50 bg-danger/10 p-2.5">
                    <p className="text-[11.5px] text-ink-100">Purge every note and task? This cannot be undone.</p>
                    <div className="mt-2 flex gap-1.5">
                      <button type="button" onClick={() => { onWipe(); setConfirmWipe(false); }} className="flex-1 rounded border border-danger/60 bg-danger/20 px-2 py-1 font-mono text-[10px] uppercase text-danger transition-all hover:bg-danger/30">
                        yes, wipe
                      </button>
                      <button type="button" onClick={() => setConfirmWipe(false)} className="flex-1 rounded border border-ink-600 px-2 py-1 font-mono text-[10px] uppercase text-ink-300 transition-all hover:bg-ink-800">
                        keep
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmWipe(true)} className="w-full rounded-md border border-ink-700 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-500 transition-all hover:border-danger/50 hover:text-danger">
                    wipe memory lattice
                  </button>
                )}
              </section>
            </div>
          )}

          {/* ============ NEURAL ============ */}
          {tab === 'neural' && (
            <div className="space-y-3.5">
              <div className="rounded-lg border border-ink-700 bg-ink-850/80 p-3.5">
                <div className="flex items-center gap-2.5">
                  <IconBrain size={18} className="text-aqua-400" />
                  <div>
                    <div className="font-display text-[13.5px] font-bold text-ink-50">Neuro-symbolic layer</div>
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">layer 2 · on-device inference</div>
                  </div>
                  <span className={`ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider ${meta.color}`}>
                    <span className={`h-1.5 w-1.5 rounded-full bg-current ${meta.pulse ? 'anim-dot' : ''}`} />
                    {meta.label}
                  </span>
                </div>

                {(neuro.status === 'downloading' || neuro.status === 'loading') && (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-ink-700">
                      <div className="bar-live h-full rounded-full bg-aqua-400 transition-all duration-500" style={{ width: `${Math.round(neuro.progress * 100)}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between font-mono text-[9.5px] text-ink-400">
                      <span>{neuro.model}</span>
                      <span>{Math.round(neuro.progress * 100)}%</span>
                    </div>
                  </div>
                )}

                <div className="mt-3 space-y-1 font-mono text-[10.5px] text-ink-300">
                  <div className="flex justify-between gap-2"><span className="text-ink-500">provider</span><span className="truncate">{neuro.provider ?? '—'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-ink-500">model</span><span className="truncate">{neuro.model ?? '—'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-ink-500">webgpu</span><span>{neuro.webgpu ? 'detected' : 'absent'}</span></div>
                </div>
                {neuro.error && <p className="mt-2 break-words rounded border border-danger/40 bg-danger/10 px-2 py-1.5 font-mono text-[10px] text-danger">{neuro.error}</p>}

                <div className="mt-3 flex gap-1.5">
                  {neuro.status !== 'ready' ? (
                    <button
                      type="button"
                      onClick={onInitNeural}
                      disabled={neuro.status === 'downloading' || neuro.status === 'loading' || neuro.status === 'detecting'}
                      className="flex-1 rounded-md border border-aqua-400/60 bg-aqua-400/15 px-2 py-1.5 font-display text-[11.5px] font-semibold text-aqua-300 transition-all hover:bg-aqua-400/25 active:scale-95 disabled:opacity-50"
                    >
                      {neuro.status === 'downloading' || neuro.status === 'loading' ? 'Warming…' : 'Initialize neural layer'}
                    </button>
                  ) : (
                    <button type="button" onClick={onUnloadNeural} className="flex-1 rounded-md border border-ink-600 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-300 transition-all hover:border-danger/50 hover:text-danger">
                      unload engine
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-850/80 px-3.5 py-3">
                <div>
                  <div className="text-[12.5px] font-medium text-ink-100">Neural fallback routing</div>
                  <div className="font-mono text-[9.5px] text-ink-500">answer conceptual questions the parser refuses</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={neuroEnabled}
                  onClick={onToggleNeural}
                  className={`relative h-5.5 w-10 shrink-0 rounded-full border transition-colors ${neuroEnabled ? 'border-ok/60 bg-ok/25' : 'border-ink-500 bg-ink-800'}`}
                  style={{ height: 22 }}
                >
                  <span className={`absolute top-[2.5px] h-4 w-4 rounded-full transition-all ${neuroEnabled ? 'left-[21px] bg-ok' : 'left-[3px] bg-ink-400'}`} />
                </button>
              </div>

              <div className="rounded-lg border border-ink-700 bg-ink-850/60 p-3.5 font-mono text-[10px] leading-relaxed text-ink-400">
                <span className="text-ember-300">DOCTRINE</span> — the deterministic core stays the source of truth. The neural
                layer only engages when no tool clears the 45% confidence bar <span className="text-ink-200">and</span> the input
                is language-shaped. Neural output carries a <span className="text-aqua-300">[Neural Fallback]</span> badge and is
                never mixed into computed results. {neuro.status !== 'ready' ? `Current status: ${describeProvider()}.` : ''}
              </div>
            </div>
          )}

          {/* ============ TELEMETRY ============ */}
          {tab === 'telemetry' && (
            <div className="space-y-4">
              <GaugeRow metrics={metrics} neuro={neuro} />

              <section className="rounded-lg border border-ink-700 bg-ink-850/80 p-3.5">
                <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-500">tool dispatch frequency</div>
                {toolRows.length === 0 && <div className="py-3 text-center font-mono text-[10.5px] text-ink-500">no dispatches yet — run a directive</div>}
                <div className="space-y-1.5">
                  {toolRows.map(([tool, n]) => (
                    <div key={tool} className="flex items-center gap-2 font-mono text-[10px]">
                      <span className="w-28 shrink-0 truncate text-ink-300">{tool}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-700">
                        <span className="block h-full rounded-full bg-gradient-to-r from-ember-500 to-ember-300 transition-all duration-700" style={{ width: `${Math.max(6, (n / maxTool) * 100)}%` }} />
                      </span>
                      <span className="w-7 shrink-0 text-right text-ink-400">{n}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-ink-700 bg-ink-850/80 p-3.5">
                <div className="mb-2 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-500">
                  <IconDatabase size={11} className="text-aqua-400" /> storage & identity
                </div>
                <div className="space-y-1 font-mono text-[10.5px] text-ink-300">
                  <div className="flex justify-between"><span className="text-ink-500">queries served</span><span>{stats.queries}</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">lattice footprint</span><span>{metrics.storageKB} KB</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">graph store</span><span>indexeddb · axion-graph</span></div>
                  <div className="flex justify-between gap-2"><span className="text-ink-500">compute kernel</span><span className="truncate text-right">{kernelLabel}</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">shell</span><span>{metrics.tauri ? `tauri · rust` : 'browser · vite'}</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">version</span><span>9.4.1 parallax</span></div>
                </div>
              </section>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
