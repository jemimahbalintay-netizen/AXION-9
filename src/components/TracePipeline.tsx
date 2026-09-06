import type { ComponentType, SVGProps } from 'react';
import type { Message } from '../lib/store';
import {
  IconBrain,
  IconCalc,
  IconCheck,
  IconCircuit,
  IconClock,
  IconDice,
  IconFolder,
  IconLattice,
  IconPulse,
  IconRefresh,
  IconSearch,
  IconSend,
  IconSwap,
  IconText,
  IconX,
} from './icons';

type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

interface Stage {
  key: string;
  label: string;
  icon: IconType;
  detail: string;
  status: 'done' | 'active' | 'error' | 'pending';
}

function engineMeta(tool: string | undefined, backend: string | undefined, neural: boolean | undefined): { label: string; icon: IconType } {
  if (neural || tool?.startsWith('neural')) return { label: 'NEURAL LLM', icon: IconBrain };
  const t = tool ?? '';
  if (t.startsWith('math')) return { label: backend?.includes('wasm') ? 'WASM MATH' : 'MATH KERNEL', icon: IconCalc };
  if (t.startsWith('unit')) return { label: backend?.includes('wasm') ? 'WASM UNITS' : 'UNIT ALGEBRA', icon: IconSwap };
  if (t.startsWith('time')) return { label: 'TEMPORAL', icon: IconClock };
  if (t.startsWith('mem')) return { label: 'MEMORY LATTICE', icon: IconLattice };
  if (t.startsWith('text')) return { label: 'TEXT SYNTH', icon: IconText };
  if (t.startsWith('gen')) return { label: 'ENTROPY POOL', icon: IconDice };
  if (t.startsWith('fs')) return { label: 'FILESYSTEM', icon: IconFolder };
  if (t.startsWith('session')) return { label: 'SESSION CTRL', icon: IconRefresh };
  return { label: 'CORE ROUTER', icon: IconCircuit };
}

/**
 * Horizontal reasoning pipeline — replaces flat logs with the actual
 * execution topology: Lex → Classify → Engine → Critic → Output.
 */
export function TracePipeline({ msg }: { msg: Message }) {
  const stepsCount = msg.steps?.length ?? 0;
  const thinking = !!msg.thinking;
  const engineFailed = !!msg.error && !msg.neural;
  const eng = engineMeta(msg.tool, msg.backend, msg.neural);

  const stages: Stage[] = [
    {
      key: 'lex',
      label: 'LEX',
      icon: IconText,
      detail: msg.steps?.[0]?.detail ?? 'tokenize',
      status: stepsCount > 0 || !thinking ? 'done' : 'active',
    },
    {
      key: 'classify',
      label: 'CLASSIFY',
      icon: IconSearch,
      detail: msg.steps?.[1]?.detail ?? 'route intent',
      status: stepsCount > 1 ? 'done' : thinking && stepsCount === 1 ? 'active' : stepsCount > 1 || !thinking ? (stepsCount > 1 ? 'done' : 'pending') : 'pending',
    },
    {
      key: 'engine',
      label: eng.label,
      icon: eng.icon,
      detail: msg.steps?.[2]?.detail ?? eng.label.toLowerCase(),
      status: engineFailed ? 'error' : stepsCount > 2 ? 'done' : thinking && stepsCount === 2 ? 'active' : 'pending',
    },
  ];

  if (msg.critic || msg.backend) {
    const criticOk = (msg.critic ?? []).every((c) => c.ok);
    stages.push({
      key: 'critic',
      label: msg.neural ? 'GUARDRAIL' : 'CRITIC AGENT',
      icon: IconPulse,
      detail: msg.critic ? `${msg.critic.filter((c) => c.ok).length}/${msg.critic.length} checks` : 'verification pass',
      status: msg.critic ? (criticOk ? 'done' : 'error') : thinking ? 'pending' : 'done',
    });
  }

  stages.push({
    key: 'output',
    label: msg.neural ? 'NEURAL OUT' : 'OUTPUT',
    icon: IconSend,
    detail: msg.tokens ? `${msg.tokens} tokens · ${msg.latency ?? '—'}ms` : 'compose',
    status: thinking ? 'pending' : 'done',
  });

  const statusStyle: Record<Stage['status'], string> = {
    done: 'border-ember-400/70 bg-ember-400/10 text-ember-300',
    active: 'border-aqua-400/80 bg-aqua-400/10 text-aqua-300',
    error: 'border-danger/70 bg-danger/10 text-danger',
    pending: 'border-ink-600 bg-ink-850 text-ink-500',
  };

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max items-start gap-0">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-start">
            {i > 0 && (
              <div className="mt-[15px] h-px w-5 shrink-0 sm:w-7">
                <div
                  className={`h-px w-full ${
                    s.status === 'done' || s.status === 'error'
                      ? 'bg-ember-400/60'
                      : s.status === 'active'
                        ? 'bar-live bg-aqua-400/60'
                        : 'bg-ink-600'
                  }`}
                />
              </div>
            )}
            <div className="flex w-[86px] flex-col items-center text-center sm:w-[96px]">
              <div
                className={`relative flex h-[30px] w-[30px] items-center justify-center rounded-md border transition-colors duration-300 ${statusStyle[s.status]}`}
              >
                <s.icon size={14} />
                {s.status === 'active' && <span className="anim-dot absolute -right-1 -top-1 h-2 w-2 rounded-full bg-aqua-400" />}
              </div>
              <div className={`mt-1 font-mono text-[8.5px] font-medium uppercase tracking-[0.12em] ${s.status === 'pending' ? 'text-ink-500' : s.status === 'error' ? 'text-danger' : 'text-ink-200'}`}>
                {s.label}
              </div>
              <div className="mt-0.5 line-clamp-1 max-w-[92px] font-mono text-[8px] text-ink-500">{s.detail}</div>
              <div className="mt-0.5">
                {s.status === 'done' && <IconCheck size={9} className="text-ok" />}
                {s.status === 'error' && <IconX size={9} className="text-danger" />}
              </div>
            </div>
          </div>
        ))}
      </div>

      {msg.critic && msg.critic.length > 0 && (
        <div className="mt-2 grid gap-1 border-t border-ink-700/60 pt-2 sm:grid-cols-2">
          {msg.critic.map((c) => (
            <div key={c.name} className="flex items-baseline gap-2 font-mono text-[10px]">
              {c.ok ? <IconCheck size={10} className="mt-[1px] shrink-0 text-ok" /> : <IconX size={10} className="mt-[1px] shrink-0 text-danger" />}
              <span className={`shrink-0 ${c.ok ? 'text-ink-200' : 'text-danger'}`}>{c.name}</span>
              <span className="truncate text-ink-500">{c.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
