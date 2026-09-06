import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  countTokens,
  loadJSON,
  saveJSON,
  uid,
  type CriticCheck,
  type Memory,
  type Message,
  type ReasoningStep,
  type Session,
  type Stats,
} from './lib/store';
import { runBrain, type MemoryOps } from './engine/brain';
import { kernelVersion, warmKernel } from './engine/kernel-bridge';
import {
  NEUTRAL_NEURO,
  describeProvider,
  detectNeuro,
  initNeuro,
  neuroReady,
  streamNeural,
  unloadNeuro,
  type NeuroState,
} from './engine/neuro';
import {
  FS_EXTENSIONS,
  fileExists,
  fsSupported,
  listWorkspace,
  matchFsIntent,
  readFileText,
  requestWorkspace,
  writeFileText,
  type FileEntry,
  type FsIntent,
  type Workspace,
} from './engine/filesystem';
import { captureScreen, digestScreen, ocrFrame, visionSupported } from './engine/vision';
import { syncGraph, type GraphNode, type KnowledgeGraph } from './engine/graphdb';
import { MessageBubble, Welcome } from './components/Chat';
import { Composer } from './components/Composer';
import { Sidebar } from './components/Sidebar';
import { MemoryPanel } from './components/MemoryPanel';
const MemoryLattice3D = lazy(() => import('./components/MemoryGraph').then((m) => ({ default: m.MemoryLattice3D })));
import {
  Palette,
  Toasts,
  WriteConfirmModal,
  type PaletteItem,
  type PendingWrite,
  type ToastItem,
  type ToastKind,
} from './components/Overlays';
import { useLiveMetrics } from './components/Telemetry';
import { IconMenu, IconPanel, IconSearch } from './components/icons';

const K_SESSIONS = 'axion.sessions.v1';
const K_ACTIVE = 'axion.active.v1';
const K_MEMORY = 'axion.memory.v1';
const K_STATS = 'axion.stats.v1';
const K_NEURAL = 'axion.neural.v1';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function makeSession(): Session {
  return { id: uid(), title: 'Untitled session', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
}

function stripTransient(sessions: Session[]): Session[] {
  return sessions.map((s) => ({ ...s, messages: s.messages.map((m) => ({ ...m, thinking: false })) }));
}

interface ExchangeResult {
  answer: string;
  steps: ReasoningStep[];
  tool: string;
  toolLabel: string;
  confidence: number;
  error?: boolean;
  critic?: CriticCheck[];
  backend?: string;
  neural?: boolean;
  effect?: 'clear-chat';
  liveStreamed?: boolean;
}

interface ProducerApi {
  ctrl: { cancelled: boolean };
  reveal: (steps: ReasoningStep[], meta: Partial<Message>) => Promise<void>;
  push: (chunk: string) => void;
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>(() => {
    const loaded = loadJSON<Session[]>(K_SESSIONS, []);
    return loaded.length > 0 ? stripTransient(loaded) : [makeSession()];
  });
  const [activeId, setActiveId] = useState<string | null>(() => loadJSON<string | null>(K_ACTIVE, null));
  const [memory, setMemory] = useState<Memory>(() => loadJSON<Memory>(K_MEMORY, { notes: [], tasks: [] }));
  const [stats, setStats] = useState<Stats>(() => loadJSON<Stats>(K_STATS, { queries: 0, tools: {} }));
  const [neuroEnabled, setNeuroEnabled] = useState<boolean>(() => loadJSON<boolean>(K_NEURAL, true));
  const [neuro, setNeuro] = useState<NeuroState>(() => ({ ...NEUTRAL_NEURO, webgpu: detectNeuro().webgpu }));
  const [graph, setGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] });
  const [graphOpen, setGraphOpen] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null);
  const [kernelLabel, setKernelLabel] = useState('warming kernel…');

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [inject, setInject] = useState({ text: '', n: 0 });

  const streamCtrl = useRef<{ cancelled: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef(sessions);
  const memoryRef = useRef(memory);
  const neuroRef = useRef(neuro);
  const neuroEnabledRef = useRef(neuroEnabled);
  const workspaceRef = useRef(workspace);
  const pendingWriteResolver = useRef<((ok: boolean) => void) | null>(null);
  const latencyRef = useRef<number[]>([]);

  useEffect(() => void (sessionsRef.current = sessions), [sessions]);
  useEffect(() => void (memoryRef.current = memory), [memory]);
  useEffect(() => void (neuroRef.current = neuro), [neuro]);
  useEffect(() => void (neuroEnabledRef.current = neuroEnabled), [neuroEnabled]);
  useEffect(() => void (workspaceRef.current = workspace), [workspace]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;
  const metrics = useLiveMetrics(latencyRef.current, neuro);

  /* ---------- toasts ---------- */
  const toast = useCallback((kind: ToastKind, text: string) => {
    const id = uid();
    setToasts((p) => [...p.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3400);
  }, []);
  const dismissToast = (id: string) => setToasts((p) => p.filter((t) => t.id !== id));

  /* ---------- persistence ---------- */
  useEffect(() => {
    saveJSON(K_SESSIONS, sessions);
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
  useEffect(() => {
    saveJSON(K_NEURAL, neuroEnabled);
  }, [neuroEnabled]);

  /* ---------- boot: kernel warm + graph hydration ---------- */
  useEffect(() => {
    void warmKernel().then((b) => {
      setKernelLabel(b === 'wasm-worker' ? kernelVersion() : 'ts kernel · wasm artifact not built');
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void syncGraph(memory, sessions).then(setGraph);
    }, 700);
    return () => clearTimeout(t);
  }, [memory, sessions]);

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
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: lastMsg?.thinking ? 'auto' : 'smooth' });
  }, [activeSession?.id, activeSession?.messages.length, lastMsg?.content, lastMsg?.thinking]);

  /* ---------- memory ops ---------- */
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

  /* ---------- neural helpers ---------- */
  const ensureNeuro = useCallback(async (): Promise<boolean> => {
    if (neuroReady()) return true;
    const d = detectNeuro();
    if (!d.promptApi && !d.webgpu) return false;
    return initNeuro(setNeuro);
  }, []);

  const neuralUnavailableNote = (): string => {
    const s = neuroRef.current;
    if (s.status === 'downloading' || s.status === 'loading') {
      return `\n\n— The neural layer is still warming up (${Math.round(s.progress * 100)}% — check the Neural tab). Re-run in a moment. —`;
    }
    if (s.status === 'error') return `\n\n— Neural layer fault: ${s.error ?? 'unknown'}. Deterministic core answered instead. —`;
    return `\n\n— No neural substrate in this browser (needs WebGPU or window.ai). The deterministic core answered as far as it honestly can. —`;
  };

  /* ---------- generic exchange runner ---------- */
  const runExchange = useCallback(
    async (sid: string, userText: string, producer: (api: ProducerApi) => Promise<ExchangeResult>, opts?: { pushUser?: boolean; titleText?: string }) => {
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
      let revealed = 0;

      const reveal: ProducerApi['reveal'] = async (steps, meta) => {
        while (revealed < steps.length) {
          if (ctrl.cancelled) break;
          await sleep(revealed === 0 ? 170 : 230);
          revealed++;
          const slice = steps.slice(0, revealed);
          patchMsg(sid, asstId, (m) => ({ ...m, steps: slice, ...meta }));
        }
        if (revealed < steps.length) patchMsg(sid, asstId, (m) => ({ ...m, steps, ...meta }));
      };
      const push: ProducerApi['push'] = (chunk) => {
        patchMsg(sid, asstId, (m) => ({ ...m, content: m.content + chunk }));
      };

      try {
        const res = await producer({ ctrl, reveal, push });

        if (!res.liveStreamed) {
          await reveal(res.steps, {
            tool: res.tool,
            toolLabel: res.toolLabel,
            confidence: res.confidence,
            critic: res.critic,
            backend: res.backend,
            neural: res.neural,
          });
          // token-by-token output
          let acc = '';
          if (!ctrl.cancelled) {
            const pieces = res.answer.split(/(\s+)/).filter((p) => p.length > 0);
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
              await sleep(/^\s/.test(c) ? 9 : 12 + Math.random() * 14);
            }
          }
        }

        const stopped = ctrl.cancelled;
        const latency = Math.round(performance.now() - t0);
        latencyRef.current = [...latencyRef.current.slice(-11), latency];

        patchMsg(sid, asstId, (m) => {
          let content = m.content;
          if (stopped && content) content += '\n\n— generation halted by operator —';
          if (!res.liveStreamed && stopped && !content) content = res.answer;
          return {
            ...m,
            thinking: false,
            stopped,
            content,
            steps: res.steps,
            tool: res.tool,
            toolLabel: res.toolLabel,
            confidence: res.confidence,
            critic: res.critic,
            backend: res.backend,
            neural: res.neural,
            error: res.error,
            latency,
            tokens: countTokens(content || res.answer),
          };
        });

        const titleSource = opts?.titleText ?? userText;
        if (pushUser) {
          patchSession(sid, (s) => ({
            ...s,
            title: s.title === 'Untitled session' ? (titleSource.length > 42 ? `${titleSource.slice(0, 42)}…` : titleSource) : s.title,
          }));
        }

        setStats((p) => ({ queries: p.queries + 1, tools: { ...p.tools, [res.tool]: (p.tools[res.tool] ?? 0) + 1 } }));

        if (res.effect === 'clear-chat') {
          await sleep(1100);
          patchSession(sid, (s) => ({ ...s, messages: [] }));
          toast('info', 'Session buffer wiped — memory lattice intact');
        }
      } finally {
        streamCtrl.current = null;
        setStreaming(false);
      }
    },
    [patchMsg, patchSession, toast],
  );

  /* ---------- brain exchange (with neuro-symbolic fallback) ---------- */
  const runBrainExchange = useCallback(
    (sid: string, text: string) => {
      void runExchange(sid, text, async (api) => {
        const result = await runBrain(text, { memory: memoryRef.current, ops });

        if (result.tool === 'core.fallback' && result.neuralCandidate && neuroEnabledRef.current) {
          const ready = await ensureNeuro();
          if (ready) {
            const steps: ReasoningStep[] = [
              ...result.steps,
              { label: 'Neural fallback', detail: describeProvider(), ms: 0 },
            ];
            await api.reveal(steps, { tool: 'neural.stream', toolLabel: 'Local LLM · on-device', confidence: 0.62, neural: true });
            let acc = '';
            try {
              await streamNeural(
                text,
                (chunk) => {
                  acc += chunk;
                  api.push(chunk);
                },
                () => api.ctrl.cancelled,
              );
            } catch (err) {
              const fault = `\n\n— neural stream fault: ${err instanceof Error ? err.message : String(err)} —`;
              acc += fault;
              api.push(fault);
            }
            return {
              answer: acc || 'The neural layer produced no output.',
              steps,
              tool: 'neural.stream',
              toolLabel: `Local LLM · ${describeProvider()}`,
              confidence: 0.62,
              neural: true,
              liveStreamed: true,
              error: acc.length === 0 || undefined,
            };
          }
          return { ...result, answer: result.answer + neuralUnavailableNote() };
        }
        return result;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runExchange, ensureNeuro],
  );

  /* ---------- filesystem exchange ---------- */
  const confirmWrite = useCallback((pw: PendingWrite) => {
    return new Promise<boolean>((resolve) => {
      pendingWriteResolver.current = resolve;
      setPendingWrite(pw);
    });
  }, []);

  const refreshFiles = useCallback(async (ws: Workspace) => {
    try {
      setFiles(await listWorkspace(ws));
    } catch {
      setFiles([]);
    }
  }, []);

  const attachWorkspaceFlow = useCallback(async (): Promise<Workspace | null> => {
    if (!fsSupported()) {
      toast('err', 'File System Access API unavailable — use Chrome or Edge');
      return null;
    }
    const ws = await requestWorkspace();
    if (!ws) {
      toast('info', 'Directory picker dismissed');
      return null;
    }
    setWorkspace(ws);
    await refreshFiles(ws);
    toast('ok', `Workspace attached: ${ws.name} (${FS_EXTENSIONS.join(' ')})`);
    return ws;
  }, [refreshFiles, toast]);

  const runFsExchange = useCallback(
    (sid: string, text: string, intent: FsIntent) => {
      void runExchange(sid, text, async (api): Promise<ExchangeResult> => {
        const lex: ReasoningStep = { label: 'Lex & route', detail: 'filesystem intent matched', ms: 1 };
        const sandbox = (detail: string): ReasoningStep => ({ label: 'Sandbox check', detail, ms: 1 });
        const ws = workspaceRef.current;

        switch (intent.kind) {
          case 'attach': {
            const w = await attachWorkspaceFlow();
            const list = w ? await listWorkspace(w) : [];
            return {
              answer: w
                ? `### Workspace attached — \`${w.name}\`

${list.length ? `**Sandboxed files visible (${list.length})**\n${list.slice(0, 10).map((f) => `- \`${f.name}\` · ${(f.size / 1024).toFixed(1)} KB`).join('\n')}${list.length > 10 ? `\n- …and ${list.length - 10} more` : ''}` : 'Directory contains no allowlisted files yet.'}

- Allowlist: ${FS_EXTENSIONS.join(' ')} — everything else is invisible to me
- Reads capped at 2 MB · every write asks for your explicit consent`
                : `### No workspace attached

The directory picker was dismissed or is unavailable. Click **workspace** under the composer, or re-run \`fs attach\`.`,
              steps: [lex, sandbox('directory grant requested from operator')],
              tool: 'fs.attach',
              toolLabel: 'Filesystem hands',
              confidence: 0.95,
            };
          }
          case 'detach': {
            setWorkspace(null);
            setFiles([]);
            return {
              answer: `**Workspace released.** The directory handle is dropped from memory — I hold no filesystem access.`,
              steps: [lex, sandbox('handle zeroed')],
              tool: 'fs.detach',
              toolLabel: 'Filesystem hands',
              confidence: 0.95,
            };
          }
          case 'list': {
            if (!ws) {
              return {
                answer: `### No workspace attached

Attach a directory first — click **workspace** under the composer or run \`fs attach\`. I only see ${FS_EXTENSIONS.join(' ')} files inside it.`,
                steps: [lex, sandbox('blocked — no grant held')],
                tool: 'fs.list',
                toolLabel: 'Filesystem hands',
                confidence: 0.95,
                error: true,
              };
            }
            const list = await listWorkspace(ws);
            return {
              answer: list.length
                ? `### Workspace \`${ws.name}\` — ${list.length} sandboxed file${list.length === 1 ? '' : 's'}

${list.slice(0, 18).map((f) => `- \`${f.name}\` · ${(f.size / 1024).toFixed(1)} KB · ${f.ext.slice(1)}`).join('\n')}${list.length > 18 ? `\n- …and ${list.length - 18} more` : ''}

- Read one: \`fs read ${list[0].name}\``
                : `Workspace \`${ws.name}\` holds no allowlisted files (${FS_EXTENSIONS.join(' ')}).`,
              steps: [lex, sandbox(`allowlist filter: ${FS_EXTENSIONS.join(' ')}`), { label: 'Directory scan', detail: `${list.length} entries`, ms: 2 }],
              tool: 'fs.list',
              toolLabel: 'Filesystem hands',
              confidence: 0.95,
            };
          }
          case 'read': {
            if (!ws) {
              return { answer: `### No workspace attached\n\nRun \`fs attach\` first — then \`fs read ${intent.name}\` will work.`, steps: [lex, sandbox('blocked — no grant held')], tool: 'fs.read', toolLabel: 'Filesystem hands', confidence: 0.95, error: true };
            }
            const t1 = performance.now();
            try {
              const content = await readFileText(ws, intent.name);
              const lines = content.split('\n');
              const words = content.split(/\s+/).filter(Boolean).length;
              return {
                answer: `### Read \`${intent.name}\` — ${(content.length / 1024).toFixed(1)} KB

- **${words.toLocaleString('en-US')}** words · **${lines.length}** lines
- Digest: \`${digestScreen(content).topTerms.slice(0, 5).join(', ') || '—'}\`

**Preview (first ${Math.min(12, lines.length)} lines)**
${lines.slice(0, 12).map((l) => `- ${l.length > 90 ? `${l.slice(0, 90)}…` : l || '(empty)'}`).join('\n')}

- Next: \`summarize: <paste>\` or \`fs save\` the answer back`,
                steps: [lex, sandbox(`\`${intent.name}\` passes the allowlist`), { label: 'File read', detail: `${content.length} chars`, ms: Math.round(performance.now() - t1) }],
                tool: 'fs.read',
                toolLabel: 'Filesystem hands',
                confidence: 0.95,
              };
            } catch (err) {
              return {
                answer: `### Filesystem refusal\n\n**${err instanceof Error ? err.message : 'Read failed'}**`,
                steps: [lex, sandbox('allowlist / existence check failed')],
                tool: 'fs.read',
                toolLabel: 'Filesystem hands',
                confidence: 0.95,
                error: true,
              };
            }
          }
          case 'save':
          case 'write': {
            if (!ws) {
              return { answer: `### No workspace attached\n\nAttach a directory (\`fs attach\`) — writes are refused without an explicit grant.`, steps: [lex, sandbox('blocked — no grant held')], tool: `fs.${intent.kind}`, toolLabel: 'Filesystem hands', confidence: 0.95, error: true };
            }
            let content = intent.kind === 'write' ? intent.content : '';
            if (intent.kind === 'save') {
              const sess = sessionsRef.current.find((s) => s.id === sid);
              const last = sess ? [...sess.messages].reverse().find((m) => m.role === 'assistant' && m.content && !m.thinking) : undefined;
              if (!last) {
                return { answer: `### Nothing to save\n\nNo completed answer exists in this session yet — run a directive first, then \`fs save ${intent.name}\`.`, steps: [lex, sandbox('session buffer inspected')], tool: 'fs.save', toolLabel: 'Filesystem hands', confidence: 0.95, error: true };
              }
              content = last.content;
            }
            try {
              const exists = await fileExists(ws, intent.name);
              const ok = await confirmWrite({ name: intent.name, content, exists, workspace: ws.name });
              if (!ok) {
                return {
                  answer: `### Write denied by operator\n\n\`${intent.name}\` was **not touched**. Consent is mandatory — that's the contract.`,
                  steps: [lex, sandbox(`\`${intent.name}\` passes the allowlist`), { label: 'Consent gate', detail: 'operator denied', ms: 0 }],
                  tool: `fs.${intent.kind}`,
                  toolLabel: 'Filesystem hands',
                  confidence: 0.95,
                  error: true,
                };
              }
              const t1 = performance.now();
              await writeFileText(ws, intent.name, content);
              await refreshFiles(ws);
              return {
                answer: `### ${exists ? 'Overwrote' : 'Created'} \`${intent.name}\`

- Workspace: \`${ws.name}\` · ${content.length.toLocaleString('en-US')} chars · ${content.split('\n').length} lines
- Written only after your explicit consent · verified against the allowlist`,
                steps: [lex, sandbox(`\`${intent.name}\` passes the allowlist`), { label: 'Consent gate', detail: 'operator approved', ms: 0 }, { label: 'File write', detail: `${content.length} chars`, ms: Math.round(performance.now() - t1) }],
                tool: `fs.${intent.kind}`,
                toolLabel: 'Filesystem hands',
                confidence: 0.95,
              };
            } catch (err) {
              return { answer: `### Filesystem refusal\n\n**${err instanceof Error ? err.message : 'Write failed'}**`, steps: [lex, sandbox('allowlist check failed')], tool: `fs.${intent.kind}`, toolLabel: 'Filesystem hands', confidence: 0.95, error: true };
            }
          }
        }
      });
    },
    [attachWorkspaceFlow, confirmWrite, refreshFiles, runExchange],
  );

  /* ---------- vision exchange ---------- */
  const runVisionExchange = useCallback(
    (sid: string) => {
      void runExchange(sid, '/screen — read my screen', async (api): Promise<ExchangeResult> => {
        if (!visionSupported()) {
          return {
            answer: `### Screen Capture unavailable\n\nThis browser doesn't expose \`getDisplayMedia\`. Try Chrome or Edge — the capture asks for your explicit grant and tears down after one frame.`,
            steps: [{ label: 'Capability probe', detail: 'getDisplayMedia absent', ms: 1 }],
            tool: 'vision.capture',
            toolLabel: 'Screen vision',
            confidence: 0.9,
            error: true,
          };
        }
        const steps: ReasoningStep[] = [{ label: 'Capture grant', detail: 'operator approved one frame', ms: 0 }];
        await api.reveal(steps, { tool: 'vision.capture', toolLabel: 'Screen vision', confidence: 0.9 });
        let frame;
        try {
          frame = await captureScreen();
        } catch (err) {
          return {
            answer: `### Capture aborted\n\n**${err instanceof Error ? err.message : 'The capture grant was denied or revoked.'}** No frame was retained.`,
            steps: [...steps, { label: 'Frame grab', detail: 'denied', ms: 0 }],
            tool: 'vision.capture',
            toolLabel: 'Screen vision',
            confidence: 0.9,
            error: true,
          };
        }
        steps.push({ label: 'Frame grab', detail: `${frame.width}×${frame.height} · stream torn down`, ms: 1 });
        await api.reveal(steps, { tool: 'vision.ocr', toolLabel: 'OCR engine', confidence: 0.9 });
        let text = '';
        try {
          text = await ocrFrame(frame);
        } catch (err) {
          return {
            answer: `### OCR engine fault\n\nFrame captured (${frame.width}×${frame.height}), but text extraction failed: **${err instanceof Error ? err.message : String(err)}**`,
            steps: [...steps, { label: 'OCR pass', detail: 'engine unavailable', ms: 0 }],
            tool: 'vision.ocr',
            toolLabel: 'OCR engine',
            confidence: 0.9,
            error: true,
          };
        }
        if (!text) {
          return {
            answer: `### Frame captured — no legible text\n\nThe OCR pass returned an empty transcript. The frame was discarded immediately.`,
            steps: [...steps, { label: 'OCR pass', detail: '0 glyphs', ms: 0 }],
            tool: 'vision.ocr',
            toolLabel: 'OCR engine',
            confidence: 0.9,
          };
        }
        const d = digestScreen(text);
        ops.addNote(`screen capture: ${d.excerpt}`);
        steps.push({ label: 'OCR pass', detail: `${d.words} words extracted`, ms: 0 }, { label: 'Lattice commit', detail: 'excerpt stored as fact', ms: 0 });
        return {
          answer: `### Screen read complete

- **${d.words.toLocaleString('en-US')}** words · **${d.lines}** lines · ${d.chars.toLocaleString('en-US')} characters
- Dominant terms: ${d.topTerms.map((t) => `\`${t}\``).join(' ') || '—'}

**Excerpt**
${d.excerpt.split(' ').slice(0, 36).join(' ')}…

- Excerpt committed to the memory lattice (\`show notes\` to recall)
- The capture stream was destroyed after one frame — I don't keep watching`,
          steps,
          tool: 'vision.ocr',
          toolLabel: 'Screen vision · Tesseract',
          confidence: 0.9,
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runExchange],
  );

  /* ---------- neural status exchange ---------- */
  const runNeuralStatus = useCallback(
    (sid: string) => {
      const s = neuroRef.current;
      const d = detectNeuro();
      void runExchange(sid, '/neural status', async (): Promise<ExchangeResult> => ({
        answer: `### Neural layer diagnostics

- Status: **${s.status}** ${s.provider ? `· provider: \`${s.provider}\`` : ''}
- Substrates: window.ai ${d.promptApi ? '**present**' : 'absent'} · WebGPU ${d.webgpu ? '**present**' : 'absent'}
- Routing: ${neuroEnabledRef.current ? '**enabled** — conceptual fallbacks stream from the local model' : 'disabled — deterministic-only mode (\`/neural on\` to arm)'}
- Model: ${s.model ?? 'not loaded'} ${s.status === 'downloading' || s.status === 'loading' ? `· ${Math.round(s.progress * 100)}%` : ''}

${s.error ? `**Fault:** ${s.error}` : 'When no tool clears the 45% bar and the input is language-shaped, questions route here with a [Neural Fallback] badge.'}`,
        steps: [
          { label: 'Capability probe', detail: `window.ai=${d.promptApi} webgpu=${d.webgpu}`, ms: 1 },
          { label: 'Router state', detail: `fallback ${neuroEnabledRef.current ? 'armed' : 'disarmed'}`, ms: 1 },
        ],
        tool: 'neural.status',
        toolLabel: 'Neuro router',
        confidence: 0.9,
      }));
    },
    [runExchange],
  );

  /* ---------- send dispatcher ---------- */
  const send = (text: string) => {
    if (!activeId || streamCtrl.current) return;
    const t = text.trim();
    const lower = t.toLowerCase();
    if (lower === '/graph') {
      setGraphOpen(true);
      return;
    }
    if (lower === '/neural on') {
      setNeuroEnabled(true);
      toast('ok', 'Neural fallback armed — conceptual questions may route to the local model');
      return;
    }
    if (lower === '/neural off') {
      setNeuroEnabled(false);
      toast('info', 'Deterministic-only mode — the core will refuse instead of guess');
      return;
    }
    if (lower === '/neural status') {
      runNeuralStatus(activeId);
      return;
    }
    if (lower === '/screen') {
      runVisionExchange(activeId);
      return;
    }
    const fsIntent = matchFsIntent(t);
    if (fsIntent) {
      runFsExchange(activeId, t, fsIntent);
      return;
    }
    runBrainExchange(activeId, t);
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
    void runExchange(activeSession.id, userMsg.content, async (api) => {
      const result = await runBrain(userMsg.content, { memory: memoryRef.current, ops });
      void api;
      return result;
    }, { pushUser: false });
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

  /* ---------- command palette (fuzzy system search) ---------- */
  const paletteItems = useMemo<PaletteItem[]>(() => {
    const base: PaletteItem[] = [
      { id: 'new', label: 'New session', group: 'Session' },
      { id: 'clear-session', label: 'Clear current session', group: 'Session' },
      { id: 'panel', label: 'Toggle system panel', group: 'Session' },
      { id: 'graph', label: 'Open 3D knowledge graph', group: 'Session' },
      { id: 'd-math', label: 'Run — (128 * 46) - 17^2', hint: 'math.evaluate', group: 'Directives' },
      { id: 'd-convert', label: 'Run — convert 100 km to mi', hint: 'unit.convert', group: 'Directives' },
      { id: 'd-time', label: 'Run — days until christmas', hint: 'time.until', group: 'Directives' },
      { id: 'd-remember', label: 'Insert — remember: …', hint: 'mem.note.add', group: 'Directives' },
      { id: 'd-task', label: 'Insert — add task: …', hint: 'mem.task.add', group: 'Directives' },
      { id: 'd-screen', label: 'Run — /screen vision capture', hint: 'vision.ocr', group: 'Directives' },
      { id: 'd-neural', label: 'Run — /neural status', hint: 'neural.status', group: 'Directives' },
      { id: 'd-help', label: 'Run — /help registry', hint: 'core.help', group: 'Directives' },
      { id: 'wipe', label: 'Wipe memory lattice', group: 'Danger zone' },
    ];
    const nodeItems: PaletteItem[] = graph.nodes
      .filter((n) => n.kind !== 'session')
      .slice(0, 10)
      .map((n) => ({ id: `node:${n.id}`, label: n.label, hint: n.kind, group: 'Memory nodes' }));
    const fileItems: PaletteItem[] = files.map((f) => ({ id: `file:${f.name}`, label: f.name, hint: `${(f.size / 1024).toFixed(1)} KB`, group: 'Workspace files' }));
    return [...base, ...nodeItems, ...fileItems];
  }, [graph, files]);

  const runPalette = (id: string) => {
    setPaletteOpen(false);
    if (id.startsWith('node:')) {
      const node = graph.nodes.find((n) => `node:${n.id}` === id);
      if (node) {
        setInject({ text: node.body, n: Date.now() });
        toast('info', 'Node context injected into the composer');
      }
      return;
    }
    if (id.startsWith('file:')) {
      send(`fs read ${id.slice(5)}`);
      return;
    }
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
      case 'graph':
        setGraphOpen(true);
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
      case 'd-screen':
        send('/screen');
        break;
      case 'd-neural':
        send('/neural status');
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

  const onPickNode = (node: GraphNode) => {
    setGraphOpen(false);
    setInject({ text: node.body, n: Date.now() });
    toast('info', `Injected ${node.kind} node into the composer`);
  };

  /* ---------- render ---------- */
  return (
    <div className="relative flex h-screen overflow-hidden bg-ink-950 font-body text-ink-100">
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
              {activeSession ? `${activeSession.messages.length} messages · neuro-symbolic core` : 'no session'}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {typeof lastLatency === 'number' && (
              <span className="hidden rounded-md border border-ink-600 bg-ink-850 px-2 py-1 font-mono text-[10px] text-ink-300 md:inline">
                last run {lastLatency}ms
              </span>
            )}
            <span
              className={`hidden items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider sm:flex ${
                neuro.status === 'ready' ? 'border-aqua-400/50 bg-aqua-400/10 text-aqua-300' : 'border-ink-600 bg-ink-850 text-ink-400'
              }`}
              title="Neural layer status"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${neuro.status === 'ready' ? 'bg-aqua-400' : 'bg-ink-500'} ${neuro.status === 'downloading' || neuro.status === 'loading' ? 'anim-dot' : ''}`} />
              neural {neuro.status === 'ready' ? 'hot' : neuro.status}
            </span>
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
              aria-label="Toggle system panel"
              onClick={() => setPanelOpen((v) => !v)}
              className={`rounded-md p-1.5 transition-colors xl:hidden ${panelOpen ? 'bg-ink-800 text-aqua-300' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-50'}`}
            >
              <IconPanel size={16} />
            </button>
          </div>
        </header>

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

        <Composer
          onSend={send}
          onStop={stop}
          streaming={streaming}
          inject={inject}
          workspaceName={workspace?.name ?? null}
          onAttachWorkspace={() => void attachWorkspaceFlow()}
          onReadScreen={() => {
            if (activeId) runVisionExchange(activeId);
          }}
          kernelLabel={kernelLabel}
        />
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
        graph={graph}
        onOpenGraph={() => setGraphOpen(true)}
        neuro={neuro}
        neuroEnabled={neuroEnabled}
        onToggleNeural={() => setNeuroEnabled((v) => !v)}
        onInitNeural={() => {
          void initNeuro(setNeuro).then((ok) => {
            if (ok) toast('ok', `Neural layer ready — ${describeProvider()}`);
            else toast('err', 'Neural layer could not initialize — see the Neural tab');
          });
        }}
        onUnloadNeural={() => {
          void unloadNeuro(setNeuro).then(() => toast('info', 'Neural engine unloaded'));
        }}
        metrics={metrics}
        kernelLabel={kernelLabel}
      />

      {graphOpen && (
        <Suspense fallback={null}>
          <MemoryLattice3D open graph={graph} onClose={() => setGraphOpen(false)} onPick={onPickNode} />
        </Suspense>
      )}

      <WriteConfirmModal
        pending={pendingWrite}
        onConfirm={() => {
          pendingWriteResolver.current?.(true);
          pendingWriteResolver.current = null;
          setPendingWrite(null);
        }}
        onReject={() => {
          pendingWriteResolver.current?.(false);
          pendingWriteResolver.current = null;
          setPendingWrite(null);
        }}
      />

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} onRun={runPalette} />
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
