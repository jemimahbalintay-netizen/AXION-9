import { useEffect, useRef, useState } from 'react';
import { countTokens } from '../lib/store';
import { IconFolder, IconScreen, IconSend, IconStop } from './icons';

interface SlashItem {
  cmd: string;
  hint: string;
}

const SLASH_ITEMS: SlashItem[] = [
  { cmd: '/help', hint: 'directive registry' },
  { cmd: '/clear', hint: 'wipe session buffer' },
  { cmd: '/graph', hint: 'open 3D knowledge graph' },
  { cmd: '/screen', hint: 'capture + OCR the screen' },
  { cmd: '/fs list', hint: 'list workspace files' },
  { cmd: '/fs read ', hint: 'read a sandboxed file' },
  { cmd: '/fs save ', hint: 'save last answer to file' },
  { cmd: '/fs attach', hint: 'grant a directory' },
  { cmd: '/fs detach', hint: 'release the directory' },
  { cmd: '/neural on', hint: 'enable neural fallback' },
  { cmd: '/neural off', hint: 'deterministic-only mode' },
  { cmd: '/neural status', hint: 'neural layer diagnostics' },
];

interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  inject: { text: string; n: number };
  workspaceName: string | null;
  onAttachWorkspace: () => void;
  onReadScreen: () => void;
  kernelLabel: string;
}

export function Composer({ onSend, onStop, streaming, inject, workspaceName, onAttachWorkspace, onReadScreen, kernelLabel }: ComposerProps) {
  const [value, setValue] = useState('');
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashSel, setSlashSel] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (inject.n > 0) {
      setValue(inject.text);
      setSlashOpen(false);
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(inject.text.length, inject.text.length);
        }
      });
    }
  }, [inject]);

  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(180, Math.max(46, ta.scrollHeight))}px`;
    }
  }, [value]);

  const slashMatches = slashOpen
    ? SLASH_ITEMS.filter((i) => i.cmd.startsWith(value.trim().toLowerCase()) || value.trim() === '/')
    : [];

  const submit = () => {
    const text = value.trim();
    if (!text || streaming) return;
    setValue('');
    setSlashOpen(false);
    onSend(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen && slashMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSel((s) => (s + 1) % slashMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSel((s) => (s - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        setValue(slashMatches[slashSel].cmd.endsWith(' ') ? slashMatches[slashSel].cmd : `${slashMatches[slashSel].cmd} `);
        setSlashOpen(false);
        return;
      }
      if (e.key === 'Escape') {
        setSlashOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="shrink-0 border-t border-ink-700/70 bg-ink-900/70 px-4 pb-4 pt-2.5 backdrop-blur sm:px-6">
      <div className="relative mx-auto w-full max-w-3xl">
        {slashOpen && slashMatches.length > 0 && (
          <div className="anim-fade-up absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-lg border border-ink-600 bg-ink-900 shadow-[0_-12px_48px_rgb(0_0_0/0.5)]">
            <div className="border-b border-ink-700 px-3.5 py-2 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-500">
              directive registry · {slashMatches.length} matches
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {slashMatches.map((item, i) => (
                <button
                  key={item.cmd}
                  type="button"
                  onMouseEnter={() => setSlashSel(i)}
                  onClick={() => {
                    setValue(item.cmd.endsWith(' ') ? item.cmd : `${item.cmd} `);
                    setSlashOpen(false);
                    taRef.current?.focus();
                  }}
                  className={`flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors ${i === slashSel ? 'bg-ink-700/70' : ''}`}
                >
                  <span className={`font-mono text-[12.5px] ${i === slashSel ? 'text-ember-300' : 'text-ink-100'}`}>{item.cmd}</span>
                  <span className="ml-auto font-mono text-[10px] text-ink-500">{item.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={`rounded-xl border bg-ink-850/95 shadow-[0_8px_36px_rgb(0_0_0/0.35)] transition-colors ${streaming ? 'border-aqua-400/50' : 'border-ink-600 focus-within:border-ember-400/60'}`}>
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSlashOpen(e.target.value.startsWith('/'));
              setSlashSel(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={streaming ? 'core is reasoning — wait or halt…' : 'Direct the core · arithmetic, units, time, memory, files, screen…'}
            rows={1}
            disabled={streaming}
            className="block w-full resize-none bg-transparent px-4 pt-3.5 text-[14.5px] leading-relaxed text-ink-50 outline-none placeholder:text-ink-500 disabled:opacity-60"
          />
          <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
            <button
              type="button"
              onClick={onAttachWorkspace}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95 ${
                workspaceName
                  ? 'border-ok/50 bg-ok/10 text-ok'
                  : 'border-ink-600 bg-ink-900 text-ink-400 hover:border-ember-400/50 hover:text-ember-300'
              }`}
              title="File System Access — sandboxed to .txt .md .csv .json"
            >
              <IconFolder size={12} />
              {workspaceName ?? 'workspace'}
            </button>
            <button
              type="button"
              onClick={onReadScreen}
              disabled={streaming}
              className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-400 transition-all hover:border-aqua-400/50 hover:text-aqua-300 active:scale-95 disabled:opacity-50"
              title="Capture one frame + OCR → memory lattice"
            >
              <IconScreen size={12} />
              read screen
            </button>
            <span className="ml-1 hidden truncate font-mono text-[9px] uppercase tracking-[0.14em] text-ink-500 sm:inline">{kernelLabel}</span>
            <div className="ml-auto flex items-center gap-2">
              {value.length > 0 && (
                <span className="font-mono text-[9.5px] text-ink-500">
                  {value.length} ch · ~{countTokens(value)} tk
                </span>
              )}
              {streaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex items-center gap-1.5 rounded-md border border-danger/60 bg-danger/15 px-3 py-1.5 font-display text-[12px] font-semibold text-danger transition-all hover:bg-danger/25 active:scale-95"
                >
                  <IconStop size={13} /> Halt
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!value.trim()}
                  className="flex items-center gap-1.5 rounded-md border border-ember-400/60 bg-ember-400/15 px-3.5 py-1.5 font-display text-[12px] font-semibold text-ember-300 transition-all hover:border-ember-400 hover:bg-ember-400/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <IconSend size={13} /> Execute
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-600">
          <span>enter execute · shift+enter newline · / registry</span>
          <span>⌘K system search</span>
        </div>
      </div>
    </div>
  );
}
