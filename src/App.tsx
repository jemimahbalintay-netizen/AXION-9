import { useCallback, useEffect, useRef, useState } from 'react';
import {
  countTokens,
  loadJSON,
  saveJSON,
  uid,
  type Memory,
  type Message,
  type Session,
  type Stats,
} from './lib/store';
import { runBrain, type MemoryOps } from './engine/brain';
import { MessageBubble, Welcome } from './components/Chat';
import { Composer } from './components/Composer';
import { Sidebar } from './components/Sidebar';
import { MemoryPanel } from './components/MemoryPanel';
import { Palette, Toasts, type PaletteItem, type ToastItem, type ToastKind } from './components/Overlays';
import { IconMenu, IconPanel, IconSearch } from './components/icons';

const K_SESSIONS = 'axion.sessions.v1';
const K_ACTIVE = 'axion.active.v1';
const K_MEMORY = 'axion.memory.v1';
const K_STATS = 'axion.stats.v1';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function makeSession(): Session {
  return { id: uid(), title: 'Untitled session', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
}

function stripTransient(sessions: Session[]): Session[] {
  return sessions.map((s) => ({
    ...s,
    messages: s.messages.map((m) => ({ ...m, thinking: false, stopped: m.stopped })),
  }));
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>(() => {
    const loaded = loadJSON<Session[]>(K_SESSIONS, []);
    return loaded.length > 0 ? stripTransient(loaded) : [makeSession()];
  });
  const [activeId, setActiveId] = useState<string | null>(() => loadJSON<string | null>(K_ACTIVE, null));
  const [memory, setMemory] = useState<Memory>(() => loadJSON<Memory>(K_MEMORY, { notes: [], tasks: [] }));
  const [stats, setStats] = useState<Stats>(() => loadJSON<Stats>(K_STATS, { queries: 0, tools: {} }));
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [inject, setInject] = useState({ text: '', n: 0 });

  const streamCtrl = useRef<{ cancelled: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  /* ---------- toasts ---------- */
  const toast = useCallback((kind: ToastKind, text: string) => {
    const id = uid();
    setToasts((p) => [...p.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3200);
  }, []);
  const dismissToast = (id: string) => setToasts((p) => p.filter((t) => t.id !== id));

  /* ---------- persistence ---------- */
  useEffect(() => {
    if (!saveJSON(K_SESSIONS, sessions)) toast('err', 'Local store is full — oldest data may not persist');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);
  useEffect(() => {
    saveJSON(K_ACTIVE, activeId);
  }, [activeId]);
  useEffect(() => {
    saveJSON(K_MEMORY, memory);
  }, [memory]);
  useEffect(() => {
    saveJSON(K_STATS, stats);
  }, [stats]);

  /* ---------- session reconciliation ---------- */
  useEffect(() => {
    if (sessions.length === 0) {
      const s = makeSession();
      setSessions([s]);
      setActiveId(s.id);
      return;
    }
    if (!activeId || !sessions.some((s) => s.id === activeId)) {
      setActiveId(sessions[0].id);
    }
  }, [sessions, activeId]);

  /* ---------- autoscroll ---------- */
  const lastMsg = activeSession?.messages[activeSession.messages.length - 1];
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: streaming ? 'auto' : 'smooth' });
  }, [activeSession?.id, activeSession?.messages.length, lastMsg?.content, streaming]);

  /* ---------- memory ops (shared by brain + panel) ---------- */
  const ops: MemoryOps = {
    addNote: (text) => setMemory((p) => ({ ...p, notes: [...p.notes, { id: uid(), text, ts: Date.now() }] })),
    removeNote: (id) => setMemory((p) => ({ ...p, notes: p.notes.filter((n) => n.id !== id) })),
    addTask: (text) => setMemory((p) => ({ ...p, tasks: [...p.tasks, { id: uid(), text, done: false, ts: Date.now() }] })),
    setTaskDone: (id, done) => setMemory((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === id ? { ...t, done } : t)) })),
    removeTask: (id) => setMemory((p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== id) })),
    clearDoneTasks: () => setMemory((p) => ({ ...p, tasks: p.tasks.filter((t) => !t.done) })),
  };

  /* ---------- patching helpers ---------- */
  const patchSession = useCallback((sid: string, fn: (s: Session) => Session) => {
    setSessions((prev) => prev.map((s) => (s.id === sid ? fn(s) : s)));
  }, []);
  const patchMsg = useCallback(
    (sid: string, mid: string, fn: (m: Message) => Message) => {
      patchSession(sid, (s) => ({ ...s, updatedAt: Date.now(), messages: s.messages.map((m) => (m.id === mid ? fn(m) : m)) }));
    },
    [patchSession],
  );

  /* ---------- the pipeline ---------- */
  const runPipeline = useCallback(
    async (sid: string, userText: string, opts?: { pushUser?: boolean }) => {
      if (streamCtrl.current) return;
      const pushUser = opts?.pushUser !== false;
      const asstId = uid();
      patchSession(sid, (s) => {
        const userMsg: Message = { id: uid(), role: 'user', content: userText, ts: Date.now() };
        const asst: Message = { id: asstId, role: 'assistant', content: '', ts: Date.now(), thinking: true, steps: [] };
        return { ...s, updatedAt: Date.now(), messages: pushUser ? [...s.messages, userMsg, asst] : [...s.messages, asst] };
      });

      const ctrl = { cancelled: false };
      streamCtrl.current = ctrl;
      setStreaming(true);
      const t0 = performance.now();

      try {
        const result = runBrain(userText, { memory, ops });

        // reveal reasoning steps one by one
        for (let i = 0; i < result.steps.length; i++) {
          if (ctrl.cancelled) break;
          await sleep(i === 0 ? 180 : 240);
          const step = result.steps[i];
          patchMsg(sid, asstId, (m) => ({
            ...m,
            steps: [...(m.steps ?? []), step],
            candidates: i >= 1 ? result.candidates : m.candidates,
            confidence: i >= 1 ? result.confidence : m.confidence,
            tool: i >= 2 ? result.tool : m.tool,
            toolLabel: i >= 2 ? result.toolLabel : m.toolLabel,
          }));
        }

        // stream the answer token by token
        let acc = '';
        if (!ctrl.cancelled) {
          const pieces = result.answer.split(/(\s+)/).filter((p) => p.length > 0);
          const chunks: string[] = [];
          if (pieces.length > 150) {
            for (let i = 0; i < pieces.length; i += 3) chunks.push(pieces.slice(i, i + 3).join(''));
          } else {
            chunks.push(...pieces);
          }
          for (const c of chunks) {
            if (ctrl.cancelled) break;
            acc += c;
            patchMsg(sid, asstId, (m) => ({ ...m, content: acc }));
            await sleep(/^\s/.test(c) ? 10 : 13 + Math.random() * 15);
          }
        }

        const stopped = ctrl.cancelled;
        const finalContent = stopped && acc ? `${acc}\n\n— generation halted by operator —` : result.answer;
        patchMsg(sid, asstId, (m) => ({
          ...m,
          thinking: false,
          stopped,
          content: finalContent,
          steps: result.steps,
          candidates: result.candidates,
          tool: result.tool,
          toolLabel: result.toolLabel,
          confidence: result.confidence,
          error: result.error,
          latency: Math.round(performance.now() - t0),
          tokens: countTokens(finalContent),
        }));

        if (pushUser) {
          patchSession(sid, (s) => ({
            ...s,
            title: s.title === 'Untitled session' ? (userText.length > 42 ? `${userText.slice(0, 42)}…` : userText) : s.title,
          }));
        }

        setStats((p) => ({
          queries: p.queries + 1,
          tools: { ...p.tools, [result.tool]: (p.tools[result.tool] ?? 0) + 1 },
        }));

        if (result.effect === 'clear-chat') {
          await sleep(1100);
          patchSession(sid, (s) => ({ ...s, messages: [] }));
          toast('info', 'Session buffer wiped — memory lattice intact');
        }
      } finally {
        streamCtrl.current = null;
        setStreaming(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memory, patchMsg, patchSession, toast],
  );

  const send = (text: string) => {
    if (!activeId || streamCtrl.current) return;
    void runPipeline(activeId, text);
  };

  const stop = () => {
    if (streamCtrl.current) {
      streamCtrl.current.cancelled = true;
      toast('info', 'Halt signal sent to the core');
    }
  };

  const regenerate = (msgId: string) => {
    if (!activeSession || streamCtrl.current) return;
    const idx = activeSession.messages.findIndex((m) => m.id === msgId);
    if (idx <= 0) return;
    const userMsg = activeSession.messages[idx - 1];
    if (userMsg.role !== 'user') return;
    patchSession(activeSession.id, (s) => ({ ...s, messages: s.messages.slice(0, idx) }));
    void runPipeline(activeSession.id, userMsg.content, { pushUser: false });
  };

  /* ---------- session management ---------- */
  const newSession = () => {
    const s = makeSession();
    setSessions((p) => [s, ...p]);
    setActiveId(s.id);
    setSidebarOpen(false);
    toast('ok', 'New session initialized');
  };

  const deleteSession = (id: string) => {
    setSessions((p) => p.filter((s) => s.id !== id));
    toast('info', 'Session deleted');
  };

  /* ---------- clipboard ---------- */
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('ok', 'Copied to clipboard');
    } catch {
      toast('err', 'Clipboard unavailable in this context');
    }
  };

  /* ---------- command palette ---------- */
  const paletteItems: PaletteItem[] = [
    { id: 'new', label: 'New session', group: 'Session' },
    { id: 'clear-session', label: 'Clear current session', group: 'Session' },
    { id: 'panel', label: 'Toggle telemetry panel', group: 'Session' },
    { id: 'd-math', label: 'Run — (128 * 46) - 17^2', group: 'Directives', hint: 'math.evaluate' },
    { id: 'd-convert', label: 'Run — convert 100 km to mi', group: 'Directives', hint: 'unit.convert' },
    { id: 'd-time', label: 'Run — days until christmas', group: 'Directives', hint: 'time.until' },
    { id: 'd-remember', label: 'Insert — remember: …', group: 'Directives', hint: 'mem.note.add' },
    { id: 'd-task', label: 'Insert — add task: …', group: 'Directives', hint: 'mem.task.add' },
    { id: 'd-help', label: 'Run — /help registry', group: 'Directives', hint: 'core.help' },
    { id: 'wipe', label: 'Wipe memory lattice', group: 'Danger zone' },
  ];

  const runPalette = (id: string) => {
    setPaletteOpen(false);
    switch (id) {
      case 'new':
        newSession();
        break;
      case 'clear-session':
        if (activeId) {
          patchSession(activeId, (s) => ({ ...s, messages: [] }));
          toast('info', 'Session buffer wiped');
        }
        break;
      case 'panel':
        setPanelOpen((v) => !v);
        break;
      case 'd-math':
        send('(128 * 46) - 17^2');
        break;
      case 'd-convert':
        send('convert 100 km to mi');
        break;
      case 'd-time':
        send('days until christmas');
        break;
      case 'd-remember':
        setInject({ text: 'remember: ', n: Date.now() });
        break;
      case 'd-task':
        setInject({ text: 'add task: ', n: Date.now() });
        break;
      case 'd-help':
        send('/help');
        break;
      case 'wipe':
        setMemory({ notes: [], tasks: [] });
        toast('err', 'Memory lattice wiped');
        break;
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const lastLatency = [...(activeSession?.messages ?? [])].reverse().find((m) => m.role === 'assistant' && m.latency)?.latency;

  /* ---------- render ---------- */
  return (
    <div className="relative flex h-screen overflow-hidden bg-ink-950 font-body text-ink-100">
      {/* ambient layers */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="bg-gridlines absolute inset-0" />
        <div className="absolute -left-40 -top-40 h-[540px] w-[540px] rounded-full bg-ember-500/8 blur-[130px]" />
        <div className="absolute -bottom-48 -right-40 h-[580px] w-[580px] rounded-full bg-aqua-500/8 blur-[140px]" />
        <div className="bg-noise absolute inset-0" />
      </div>

      <Sidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          setSidebarOpen(false);
        }}
        onNew={newSession}
        onDelete={deleteSession}
        onOpenPanel={() => setPanelOpen(true)}
        stats={stats}
        memory={memory}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* header */}
        <header className="flex shrink-0 items-center gap-3 border-b border-ink-700/70 bg-ink-900/60 px-4 py-3 backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-50 lg:hidden"
          >
            <IconMenu size={17} />
          </button>
          <div className="min-w-0">
            <h2 className="truncate font-display text-[15px] font-semibold tracking-tight text-ink-50">
              {activeSession?.title ?? 'AXION'}
            </h2>
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-500">
              {activeSession ? `${activeSession.messages.length} messages` : 'no session'}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {typeof lastLatency === 'number' && (
              <span className="hidden rounded-md border border-ink-600 bg-ink-850 px-2 py-1 font-mono text-[10px] text-ink-300 sm:inline">
                last run {lastLatency}ms
              </span>
            )}
            <span className="flex items-center gap-1.5 rounded-md border border-ok/40 bg-ok/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ok">
              <span className="anim-dot h-1.5 w-1.5 rounded-full bg-ok" /> online
            </span>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-1.5 rounded-md border border-ink-600 bg-ink-850 px-2 py-1 font-mono text-[10px] text-ink-300 transition-all hover:border-aqua-400/60 hover:text-aqua-300 sm:flex"
            >
              <IconSearch size={11} /> ⌘K
            </button>
            <button
              type="button"
              aria-label="Toggle telemetry panel"
              onClick={() => setPanelOpen((v) => !v)}
              className={`rounded-md p-1.5 transition-colors xl:hidden ${panelOpen ? 'bg-ink-800 text-aqua-300' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-50'}`}
            >
              <IconPanel size={16} />
            </button>
          </div>
        </header>

        {/* conversation */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {activeSession && activeSession.messages.length === 0 ? (
            <Welcome onSend={send} noteCount={memory.notes.length} taskCount={memory.tasks.length} />
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
              {activeSession?.messages.map((m) => (
                <MessageBubble key={m.id} msg={m} onCopy={copyText} onRegenerate={regenerate} />
              ))}
            </div>
          )}
        </div>

        <Composer onSend={send} onStop={stop} streaming={streaming} inject={inject} />
      </main>

      <MemoryPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        memory={memory}
        stats={stats}
        onAddNote={(t) => {
          ops.addNote(t);
          toast('ok', 'Note committed to the lattice');
        }}
        onDelNote={(id) => {
          ops.removeNote(id);
          toast('info', 'Note erased');
        }}
        onAddTask={(t) => {
          ops.addTask(t);
          toast('ok', 'Task committed to the lattice');
        }}
        onToggleTask={(id) => {
          const t = memory.tasks.find((x) => x.id === id);
          ops.setTaskDone(id, !(t?.done ?? false));
        }}
        onDelTask={(id) => {
          ops.removeTask(id);
          toast('info', 'Task purged');
        }}
        onClearDone={() => {
          ops.clearDoneTasks();
          toast('ok', 'Completed tasks swept');
        }}
        onWipe={() => {
          setMemory({ notes: [], tasks: [] });
          toast('err', 'Memory lattice wiped');
        }}
        onCopy={copyText}
      />

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} onRun={runPalette} />
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
