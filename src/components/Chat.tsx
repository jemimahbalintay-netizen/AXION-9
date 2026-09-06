import { useState, type ReactNode } from 'react';
import { clockTime, type Candidate, type Message, type ReasoningStep } from '../lib/store';
import { IconAlert, IconCalc, IconCheck, IconChevron, IconClock, IconCopy, IconDice, IconLattice, IconRefresh, IconSwap, IconText } from './icons';

/* ---------------- core mark ---------------- */

export function CoreMark({ size = 28 }: { size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="anim-core absolute rounded-full"
        style={{
          inset: size * 0.28,
          background: 'radial-gradient(circle at 35% 30%, #ffdca8, #ffb454 45%, #d97f10)',
        }}
      />
      <div
        className="anim-ring absolute rounded-full border border-dashed border-aqua-400/50"
        style={{ inset: size * 0.08 }}
      />
      <div
        className="anim-ring-rev absolute rounded-full border border-ink-500/60"
        style={{ inset: 0, borderTopColor: 'rgb(79 224 194 / 0.8)' }}
      />
    </div>
  );
}

/* ---------------- markdown-lite ---------------- */

function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|~~[^~]+~~)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return (
        <strong key={`${keyBase}-${i}`} className="font-semibold text-ink-50">
          {p.slice(2, -2)}
        </strong>
      );
    }
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return (
        <code
          key={`${keyBase}-${i}`}
          className="rounded border border-ink-600/70 bg-ink-800 px-1.5 py-0.5 font-mono text-[0.85em] text-aqua-300"
        >
          {p.slice(1, -1)}
        </code>
      );
    }
    if (p.startsWith('~~') && p.endsWith('~~')) {
      return (
        <span key={`${keyBase}-${i}`} className="text-ink-400 line-through">
          {p.slice(2, -2)}
        </span>
      );
    }
    return <span key={`${keyBase}-${i}`}>{p}</span>;
  });
}

export function Rich({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1 text-[14.5px] leading-relaxed text-ink-100">
      {lines.map((ln, i) => {
        if (ln.trim() === '') return <div key={i} className="h-2" />;
        if (ln.startsWith('### ')) {
          return (
            <div key={i} className="pt-1 font-display text-[17px] font-semibold tracking-tight text-ember-300">
              {inline(ln.slice(4), `h${i}`)}
            </div>
          );
        }
        if (ln.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2.5 pl-1">
              <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rotate-45 border border-ember-400/90 bg-ember-400/20" />
              <span className="min-w-0 break-words">{inline(ln.slice(2), `b${i}`)}</span>
            </div>
          );
        }
        return (
          <div key={i} className="break-words">
            {inline(ln, `p${i}`)}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- reasoning trace ---------------- */

function TraceBlock({ steps, candidates, thinking }: { steps: ReasoningStep[]; candidates?: Candidate[]; thinking?: boolean }) {
  const [open, setOpen] = useState(true);
  const expanded = thinking ? true : open;
  if (steps.length === 0) return null;
  return (
    <div className="mb-2.5 overflow-hidden rounded-md border border-ink-700/80 bg-ink-900/70">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-300 transition-colors hover:bg-ink-800/70 hover:text-aqua-300"
      >
        <IconChevron size={11} className={`shrink-0 transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`} />
        Reasoning trace
        <span className="text-ink-500">· {steps.length} steps</span>
        {thinking && (
          <span className="ml-auto flex items-center gap-1 normal-case tracking-normal text-aqua-300">
            <span className="anim-dot inline-block h-1.5 w-1.5 rounded-full bg-aqua-400" />
            live
          </span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-ink-700/70 px-3 py-2 anim-fade-in">
          {candidates && candidates.length > 0 && (
            <div className="mb-2 space-y-1">
              {candidates.map((c) => (
                <div key={c.name} className="flex items-center gap-2 font-mono text-[10.5px]">
                  <span className="w-32 shrink-0 truncate text-ink-400">{c.name}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                    <span
                      className={`block h-full rounded-full transition-all duration-700 ease-out ${
                        thinking ? 'bar-live bg-aqua-500/80' : c.score >= 0.45 ? 'bg-ember-400' : 'bg-ink-500'
                      }`}
                      style={{ width: `${Math.max(3, Math.round(c.score * 100))}%` }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right text-ink-400">{Math.round(c.score * 100)}%</span>
                </div>
              ))}
              <div className="pb-1 pt-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">
                intent candidates · 45% dispatch bar
              </div>
            </div>
          )}
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-baseline gap-2.5 font-mono text-[11px] anim-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                <span className="shrink-0 text-ember-500">{String(i + 1).padStart(2, '0')}</span>
                <span className="shrink-0 text-ink-100">{s.label}</span>
                <span className="min-w-0 flex-1 truncate text-ink-400">{s.detail}</span>
                <span className="shrink-0 text-ink-500">{s.ms}ms</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ---------------- message bubble ---------------- */

interface BubbleProps {
  msg: Message;
  onCopy: (text: string) => void;
  onRegenerate: (id: string) => void;
}

export function MessageBubble({ msg, onCopy, onRegenerate }: BubbleProps) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end anim-fade-up">
        <div className="max-w-[86%]">
          <div className="mb-1 flex items-baseline justify-end gap-2 pr-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">
            <span>{clockTime(msg.ts)}</span>
            <span className="text-ember-400">operator</span>
          </div>
          <div className="whitespace-pre-wrap break-words rounded-lg rounded-br-sm border border-ink-600/70 bg-ink-800/90 px-3.5 py-2.5 text-[14.5px] leading-relaxed text-ink-50 shadow-[0_2px_14px_rgb(0_0_0/0.25)]">
            {msg.content}
          </div>
        </div>
      </div>
    );
  }

  const streaming = !!msg.thinking;
  return (
    <div className="group flex gap-3 anim-fade-up">
      <div className="mt-5">
        <CoreMark size={30} />
      </div>
      <div className={`min-w-0 flex-1 rounded-lg border px-3.5 py-3 transition-colors ${msg.error ? 'border-danger/40 bg-[rgb(255_115_115/0.05)]' : 'border-ink-700/70 bg-ink-850/80'} shadow-[0_2px_18px_rgb(0_0_0/0.22)]`}>
        <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[10px] uppercase tracking-[0.14em]">
          <span className="text-ember-400">axion-9</span>
          {msg.tool && <span className="rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-aqua-300">{msg.tool}</span>}
          {typeof msg.confidence === 'number' && (
            <span className={msg.confidence >= 0.45 ? 'text-ok' : 'text-warn'}>conf {Math.round(msg.confidence * 100)}%</span>
          )}
          {typeof msg.latency === 'number' && <span className="text-ink-400">{msg.latency}ms</span>}
          {typeof msg.tokens === 'number' && <span className="text-ink-400">{msg.tokens} tk</span>}
          {msg.error && (
            <span className="flex items-center gap-1 rounded border border-danger/50 bg-danger/10 px-1.5 py-0.5 text-danger">
              <IconAlert size={10} /> fault
            </span>
          )}
          {msg.stopped && (
            <span className="rounded border border-warn/50 bg-warn/10 px-1.5 py-0.5 text-warn">halted</span>
          )}
          <span className="ml-auto text-ink-500">{clockTime(msg.ts)}</span>
        </div>

        <TraceBlock steps={msg.steps ?? []} candidates={msg.candidates} thinking={streaming} />

        {streaming && msg.content === '' ? (
          <div className="flex items-center gap-2.5 py-1 font-mono text-[11.5px] text-aqua-300">
            <span className="flex h-4 items-end gap-[3px]">
              <span className="wave-bar h-full w-[3px] rounded-sm bg-aqua-400" />
              <span className="wave-bar h-full w-[3px] rounded-sm bg-aqua-400" style={{ animationDelay: '0.15s' }} />
              <span className="wave-bar h-full w-[3px] rounded-sm bg-aqua-400" style={{ animationDelay: '0.3s' }} />
            </span>
            reasoning through the kernel…
          </div>
        ) : (
          <div>
            <Rich text={msg.content} />
            {streaming && <span className="caret-blink ml-0.5 inline-block h-[15px] w-[7px] translate-y-[2px] bg-ember-400" />}
          </div>
        )}

        {!streaming && msg.content && (
          <div className="mt-2.5 flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={() => onCopy(msg.content)}
              className="flex items-center gap-1.5 rounded border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-300 transition-all hover:border-ember-400/60 hover:text-ember-300 active:scale-95"
            >
              <IconCopy size={11} /> copy
            </button>
            <button
              type="button"
              onClick={() => onRegenerate(msg.id)}
              className="flex items-center gap-1.5 rounded border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-300 transition-all hover:border-aqua-400/60 hover:text-aqua-300 active:scale-95"
            >
              <IconRefresh size={11} /> re-run
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- welcome / empty state ---------------- */

const TILES = [
  {
    icon: IconCalc,
    title: 'Math kernel',
    mod: 'math.evaluate',
    desc: 'Recursive-descent arithmetic — powers, factorials, functions, constants. No eval, ever.',
    sample: '(128 * 46) - 17^2 + sqrt(144)',
    span: 'md:col-span-7',
    accent: 'text-ember-400',
  },
  {
    icon: IconSwap,
    title: 'Unit algebra',
    mod: 'unit.convert',
    desc: '9 dimensions: metric, imperial, bytes, kelvin, currencies.',
    sample: 'convert 100 km to mi',
    span: 'md:col-span-5',
    accent: 'text-aqua-400',
  },
  {
    icon: IconClock,
    title: 'Temporal parser',
    mod: 'time.*',
    desc: 'Countdowns, offsets, weekdays, leap years, epoch.',
    sample: 'days until christmas',
    span: 'md:col-span-5',
    accent: 'text-aqua-400',
  },
  {
    icon: IconLattice,
    title: 'Memory lattice',
    mod: 'mem.*',
    desc: 'Notes and tasks written to local persistence — I recall them across reloads.',
    sample: 'remember: the launch codename is Halcyon',
    span: 'md:col-span-7',
    accent: 'text-ember-400',
  },
  {
    icon: IconText,
    title: 'Text synthesizer',
    mod: 'text.summarize',
    desc: 'Extractive summaries and passage telemetry — nothing invented.',
    sample: 'stats: The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump!',
    span: 'md:col-span-6',
    accent: 'text-ember-400',
  },
  {
    icon: IconDice,
    title: 'Entropy pool',
    mod: 'gen.*',
    desc: 'Crypto-seeded dice, keys, UUIDs, colors.',
    sample: 'roll 2d20',
    span: 'md:col-span-6',
    accent: 'text-aqua-400',
  },
];

const CHIPS = ['what time is it', '18% of 240', 'in 45 days', 'add task: review pull requests', 'password 24', 'what can you do'];

interface WelcomeProps {
  onSend: (text: string) => void;
  noteCount: number;
  taskCount: number;
}

export function Welcome({ onSend, noteCount, taskCount }: WelcomeProps) {
  const boot = [
    `AXION ENGINE v9.4.1 "parallax" — kernel online`,
    `38/38 tool modules loaded · 0 faults`,
    `memory lattice: ${noteCount} note${noteCount === 1 ? '' : 's'} · ${taskCount} task${taskCount === 1 ? '' : 's'} hydrated from local store`,
    `network calls: 0 · deterministic mode: locked`,
  ];
  return (
    <div className="mx-auto w-full max-w-3xl px-1 pb-6 pt-8">
      <div className="mb-7 space-y-1.5">
        {boot.map((line, i) => (
          <div key={i} className="anim-boot flex items-baseline gap-2.5 font-mono text-[12px] text-ink-300" style={{ animationDelay: `${i * 130}ms` }}>
            <span className="text-ember-500">▸</span>
            <span>{line}</span>
          </div>
        ))}
        <div className="anim-boot flex items-baseline gap-2.5 font-mono text-[12px] text-aqua-300" style={{ animationDelay: '520ms' }}>
          <span className="text-ember-500">▸</span>
          <span>
            awaiting directive<span className="caret-blink">_</span>
          </span>
        </div>
      </div>

      <h1 className="font-display text-[34px] font-bold leading-[1.05] tracking-tight text-ink-50 sm:text-[42px]">
        Direct the core.
        <br />
        <span className="text-ember-400">It computes — it never guesses.</span>
      </h1>
      <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-300">
        Every reply runs through a visible reasoning trace: lex → classify → dispatch → compose. When nothing clears the
        confidence bar, AXION declines and shows you what almost matched.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-2.5 md:grid-cols-12">
        {TILES.map((t, i) => (
          <button
            key={t.title}
            type="button"
            onClick={() => onSend(t.sample)}
            className={`anim-fade-up group relative overflow-hidden rounded-lg border border-ink-700 bg-ink-850/80 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-ember-400/50 hover:bg-ink-800 active:translate-y-0 ${t.span}`}
            style={{ animationDelay: `${180 + i * 70}ms` }}
          >
            <div className="flex items-center gap-2.5">
              <t.icon size={17} className={t.accent} />
              <span className="font-display text-[15px] font-semibold tracking-tight text-ink-50">{t.title}</span>
              <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-500">{t.mod}</span>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-300">{t.desc}</p>
            <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-aqua-300/90">
              <span className="truncate">{t.sample}</span>
              <span className="shrink-0 text-ember-400 transition-transform duration-200 group-hover:translate-x-1">run →</span>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onSend(c)}
            className="rounded-full border border-ink-600 bg-ink-850 px-3.5 py-1.5 font-mono text-[11.5px] text-ink-200 transition-all duration-150 hover:border-aqua-400/60 hover:text-aqua-300 active:scale-95"
          >
            {c}
          </button>
        ))}
      </div>

      <p className="mt-8 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-500">
        <IconCheck size={11} className="text-ok" />
        sessions, memory & telemetry persist in this browser
      </p>
    </div>
  );
}
