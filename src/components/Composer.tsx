import { useEffect, useRef, useState } from 'react';
import { countTokens } from '../lib/store';
import { IconSend, IconStop } from './icons';

interface Command {
  cmd: string;
  desc: string;
  insert: string;
  send?: boolean;
}

const COMMANDS: Command[] = [
  { cmd: '/help', desc: 'Full directive registry', insert: '/help', send: true },
  { cmd: '/clear', desc: 'Wipe this session buffer', insert: '/clear', send: true },
  { cmd: '/math', desc: 'Arithmetic kernel', insert: '(128 * 46) - 17^2' },
  { cmd: '/convert', desc: 'Unit algebra', insert: 'convert 100 km to mi' },
  { cmd: '/time', desc: 'Temporal query', insert: 'days until 2026-12-25' },
  { cmd: '/remember', desc: 'Write to long-term memory', insert: 'remember: ' },
  { cmd: '/task', desc: 'Commit a task to the lattice', insert: 'add task: ' },
  { cmd: '/tasks', desc: 'List the task lattice', insert: 'list tasks', send: true },
  { cmd: '/summarize', desc: 'Extractive summary of a passage', insert: 'summarize: ' },
  { cmd: '/password', desc: 'Crypto-seeded key material', insert: 'password 24', send: true },
  { cmd: '/base64', desc: 'Codec bank', insert: 'base64 encode ' },
];

interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  inject: { text: string; n: number };
}

export function Composer({ onSend, onStop, streaming, inject }: ComposerProps) {
  const [value, setValue] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const matches = menuOpen ? COMMANDS.filter((c) => c.cmd.startsWith(value.trim().toLowerCase())) : [];

  useEffect(() => {
    if (inject.n > 0) {
      setValue(inject.text);
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (ta) {
          ta.style.height = 'auto';
          ta.style.height = `${Math.min(168, ta.scrollHeight)}px`;
          ta.focus();
          ta.setSelectionRange(inject.text.length, inject.text.length);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inject.n]);

  useEffect(() => {
    setSel(0);
  }, [value]);

  const resize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(168, ta.scrollHeight)}px`;
  };

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || streaming) return;
    setValue('');
    requestAnimationFrame(resize);
    onSend(t);
    taRef.current?.focus();
  };

  const pick = (c: Command) => {
    setMenuOpen(false);
    if (c.send) {
      submit(c.insert);
    } else {
      setValue(c.insert);
      requestAnimationFrame(() => {
        resize();
        const ta = taRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(c.insert.length, c.insert.length);
        }
      });
    }
  };

  const onChange = (v: string) => {
    setValue(v);
    setMenuOpen(v.trimStart().startsWith('/') && !v.includes('\n'));
    requestAnimationFrame(resize);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSel((s) => (s + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSel((s) => (s - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        pick(matches[sel]);
        return;
      }
      if (e.key === 'Escape') {
        setMenuOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(value);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-3xl px-4 pb-4 pt-2 sm:px-6">
      {menuOpen && matches.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 z-30 mb-2 overflow-hidden rounded-lg border border-ink-600 bg-ink-900/98 shadow-[0_-8px_40px_rgb(0_0_0/0.5)] backdrop-blur sm:left-6 sm:right-6 anim-fade-up">
          <div className="border-b border-ink-700 px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-500">
            directives
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {matches.map((c, i) => (
              <li key={c.cmd}>
                <button
                  type="button"
                  onMouseEnter={() => setSel(i)}
                  onClick={() => pick(c)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${i === sel ? 'bg-ink-700/70' : ''}`}
                >
                  <span className={`font-mono text-[12px] ${i === sel ? 'text-ember-300' : 'text-aqua-300'}`}>{c.cmd}</span>
                  <span className="truncate text-[12px] text-ink-300">{c.desc}</span>
                  {i === sel && <span className="ml-auto shrink-0 font-mono text-[9.5px] uppercase tracking-widest text-ink-500">↵</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className={`flex items-end gap-2 rounded-xl border bg-ink-850/95 px-3 py-2.5 shadow-[0_6px_30px_rgb(0_0_0/0.4)] transition-colors ${
          streaming ? 'border-warn/50' : 'border-ink-600 focus-within:border-ember-400/70'
        }`}
      >
        <textarea
          ref={taRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={streaming ? 'core is reasoning — hold…' : 'Direct the core — try `(2^10) * (3 + 4.5)` or type / for directives'}
          className="max-h-[168px] min-h-[26px] flex-1 resize-none bg-transparent font-body text-[14.5px] leading-relaxed text-ink-50 outline-none placeholder:text-ink-500"
        />
        {value.trim().length > 0 && (
          <span className="mb-1 shrink-0 font-mono text-[9.5px] text-ink-500">~{countTokens(value)} tk</span>
        )}
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-danger/60 bg-danger/15 px-3.5 font-mono text-[11px] uppercase tracking-wider text-danger transition-all hover:bg-danger/25 active:scale-95"
          >
            <IconStop size={13} /> halt
          </button>
        ) : (
          <button
            type="button"
            onClick={() => submit(value)}
            disabled={value.trim().length === 0}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-ember-400 px-4 font-display text-[12.5px] font-semibold tracking-wide text-ink-950 transition-all hover:bg-ember-300 active:scale-95 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400"
          >
            <IconSend size={14} /> Send
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">
        <span>enter ⏎ send · shift+enter newline · / directives</span>
        <span className="hidden sm:inline">⌘K command palette</span>
      </div>
    </div>
  );
}
