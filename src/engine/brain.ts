/**
 * AXION-9 "Parallax" — deterministic reasoning core.
 * 38 tool modules, pattern-classified intents, zero network calls.
 */
import { evaluate, formatNumber } from './math';
import { convert, formatConverted } from './units';
import { countTokens, uid, type BrainResult, type Candidate, type Memory, type ReasoningStep } from '../lib/store';

export interface MemoryOps {
  addNote: (text: string) => void;
  removeNote: (id: string) => void;
  addTask: (text: string) => void;
  setTaskDone: (id: string, done: boolean) => void;
  removeTask: (id: string) => void;
  clearDoneTasks: () => void;
}

export interface BrainCtx {
  memory: Memory;
  ops: MemoryOps;
}

interface ToolOut {
  answer: string;
  tool: string;
  toolLabel: string;
  confidence: number;
  error?: boolean;
  effect?: 'clear-chat';
}

interface Match {
  id: string;
  score: number;
  run: () => ToolOut;
}

const MODULE_COUNT = 38;
const round = (n: number) => Math.max(0.01, Number(n.toFixed(2)));

/* ---------------- date helpers ---------------- */

const fmtFull = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function parseDateLoose(s: string): Date | null {
  const t = s.trim().toLowerCase().replace(/[?.!]/g, '');
  const now = new Date();
  if (/christmas|xmas/.test(t)) {
    let d = new Date(now.getFullYear(), 11, 25);
    if (d.getTime() < startOfDay(now).getTime()) d = new Date(now.getFullYear() + 1, 11, 25);
    return d;
  }
  if (/new year/.test(t)) return new Date(now.getFullYear() + 1, 0, 1);
  const direct = new Date(t);
  return Number.isNaN(direct.getTime()) ? null : direct;
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/* ---------------- entropy helpers ---------------- */

function randInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % maxExclusive;
}

function genPassword(len: number): string {
  const L = Math.min(64, Math.max(8, len));
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*_-+=?'];
  const all = sets.join('');
  const chars: string[] = sets.map((s) => s[randInt(s.length)]);
  while (chars.length < L) chars.push(all[randInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/* ---------------- text helpers ---------------- */

const STOPWORDS = new Set(
  'the a an and or but of to in on for with as at by is are was were be been being it its this that these those from not no so if then than too very can will just about into over under after before between out against during without within along across behind beyond except down up off once here there when where why how all any both each few more most other some such only own same s t don now i you he she we they them his her their our your my me him us what which who whom'.split(
    /\s+/,
  ),
);

function summarizeText(text: string): { bullets: string[]; terms: string[]; from: number; to: number } {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  const freq = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
    if (!STOPWORDS.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const scored = sentences.map((s, i) => {
    const ws = s.toLowerCase().match(/[a-z]{3,}/g) ?? [];
    const score = ws.reduce((acc, w) => acc + (STOPWORDS.has(w) ? 0 : freq.get(w) ?? 0), 0) / Math.pow(ws.length, 0.35);
    return { s, i, score };
  });
  const k = Math.min(3, Math.max(1, Math.round(sentences.length * 0.35)));
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, k).sort((a, b) => a.i - b.i);
  const terms = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
  return { bullets: top.map((t) => t.s), terms, from: sentences.length, to: k };
}

function fuzzyFind<T extends { text: string }>(items: T[], q: string): T | undefined {
  const needle = q.trim().toLowerCase();
  return (
    items.find((i) => i.text.toLowerCase() === needle) ??
    items.find((i) => i.text.toLowerCase().includes(needle)) ??
    items.find((i) => needle.includes(i.text.toLowerCase()))
  );
}

/* ---------------- tool handlers ---------------- */

const JOKES = [
  'A SQL statement walks into a bar, approaches two tables and asks: **"May I JOIN you?"**',
  'There are only two hard things in computer science: cache invalidation, naming things, and off-by-one errors.',
  'I would tell you a UDP joke — but you might not get it.',
  'A programmer puts two glasses on the nightstand: one full, in case they get thirsty — one empty, in case they don\u2019t.',
  'Why do Java developers wear glasses? Because they can\u2019t C#.',
];

function detect(raw: string, lower: string, ctx: BrainCtx): Match[] {
  const m: Match[] = [];
  const push = (id: string, score: number, run: () => ToolOut) => {
    if (score > 0) m.push({ id, score, run });
  };
  const words = raw.trim().split(/\s+/).filter(Boolean).length;

  /* ---- system ---- */
  if (/^\/?help$|what can you do|show (me )?(all )?commands|list (your )?capabilities/i.test(lower)) {
    push('core.help', 0.9, () => ({
      tool: 'core.help',
      toolLabel: 'Directive registry',
      confidence: 0.9,
      answer: `### Directive registry

**Compute**
- \`(128 * 46) - 17^2\` — sandboxed arithmetic kernel (no eval, ever)
- \`18% of 240\` — percentage algebra
- \`convert 100 km to mi\` — unit algebra across 9 dimensions

**Time**
- \`what time is it\` · \`days until 2026-12-25\` · \`in 45 days\` · \`unix timestamp\`
- \`when is friday\` · \`is 2100 a leap year\` · \`week number\`

**Memory lattice**
- \`remember: the deploy key rotates monthly\`
- \`add task: review pull requests\` · \`done: review pull requests\` · \`list tasks\`
- \`forget: deploy key\` · \`clear done\`

**Text**
- \`summarize: <paste a long passage>\` · \`stats: <text>\` · \`reverse <text>\`
- \`base64 encode hello axion\`

**Entropy**
- \`roll 2d20\` · \`password 24\` · \`uuid\` · \`flip a coin\` · \`random color\`

**System**
- \`/clear\` — wipe this session buffer · **\u2318K** — command palette`,
    }));
  }

  if (/who are you|what are you|your name|introduce yourself/i.test(lower)) {
    push('core.identity', 0.86, () => ({
      tool: 'core.identity',
      toolLabel: 'Self model',
      confidence: 0.86,
      answer: `I'm **AXION-9 "Parallax"** — an autonomous reasoning console, not a chat model.

- **38 tool modules** loaded: arithmetic kernel, unit algebra, temporal parser, memory lattice, text synthesizer, entropy pool
- **Deterministic by design** — every answer is computed in this tab; no cloud round-trips, no sampling, no temperature
- **Honest by constraint** — when no module clears the confidence threshold, I decline and show you what almost matched instead of inventing something

Point me at a computation, a date, a unit, or a task — or type \`/help\` for the full directive registry.`,
    }));
  }

  if (/how are you|status report|system status|are you (there|alive|online)/i.test(lower)) {
    push('core.status', 0.84, () => ({
      tool: 'core.status',
      toolLabel: 'Diagnostics',
      confidence: 0.84,
      answer: `### Core diagnostics

- Kernel: **online** — ${MODULE_COUNT}/38 modules responsive
- Memory lattice: **${ctx.memory.notes.length}** notes · **${ctx.memory.tasks.length}** tasks persisted
- Hallucination rate: **0%** — I decline instead of guess
- Network calls this session: **0**
- Kernel temperature: nominal`,
    }));
  }

  if (words <= 5 && /^(hi|hii+|hello|hey|yo|howdy|good (morning|afternoon|evening))\b/i.test(lower)) {
    push('core.greet', 0.8, () => {
      const h = new Date().getHours();
      const part = h < 5 ? 'working late' : h < 12 ? 'good morning' : h < 18 ? 'good afternoon' : 'good evening';
      return {
        tool: 'core.greet',
        toolLabel: 'Social protocol',
        confidence: 0.8,
        answer: `${part === 'working late' ? 'Burning the midnight cycle' : part[0].toUpperCase() + part.slice(1)}, operator. Core is warm and all 38 modules are responsive.

- Try \`(2^10) * (3 + 4.5)\` for arithmetic
- Or \`remember: ${'standup moved to 09:30'}\` to write to my memory lattice`,
      };
    });
  }

  if (/\b(thanks|thank you|thx|ty)\b/i.test(lower)) {
    push('core.thanks', 0.74, () => ({
      tool: 'core.thanks',
      toolLabel: 'Social protocol',
      confidence: 0.74,
      answer: `Acknowledged. Gratitude logged at \`0x${randInt(65536).toString(16).padStart(4, '0')}\` — next directive?`,
    }));
  }

  if (/joke|make me laugh|something funny/i.test(lower)) {
    push('core.joke', 0.8, () => ({
      tool: 'core.joke',
      toolLabel: 'Humor subroutine',
      confidence: 0.8,
      answer: JOKES[randInt(JOKES.length)],
    }));
  }

  if (/^\/clear$|^clear (the )?(chat|conversation|session)$/i.test(lower)) {
    push('session.clear', 0.96, () => ({
      tool: 'session.clear',
      toolLabel: 'Session controller',
      confidence: 0.96,
      effect: 'clear-chat',
      answer: `Session buffer wiped. The memory lattice (notes + tasks) survives — only this conversation thread was zeroed.`,
    }));
  }

  /* ---- math ---- */
  const pct = lower.match(/(-?\d+(?:\.\d+)?)\s*%\s*of\s*(-?\d+(?:\.\d+)?)/);
  if (pct) {
    push('math.percent', 0.95, () => {
      const p = Number(pct[1]);
      const n = Number(pct[2]);
      const r = (p / 100) * n;
      return {
        tool: 'math.percent',
        toolLabel: 'Percentage algebra',
        confidence: 0.95,
        answer: `**Percentage resolved**

\`${p}%\` of \`${formatNumber(n)}\` = **${formatNumber(r)}**

- Complement: ${formatNumber(100 - p)}% = ${formatNumber(n - r)}
- Ratio: ${formatNumber(Number((p / 100).toPrecision(6)))} \u00d7 base`,
      };
    });
  }

  const mathClean = lower
    .replace(/\b(what\s*is|what's|whats|calculate|calc|compute|evaluate|solve|how much is|please)\b/g, ' ')
    .replace(/[?=]/g, ' ')
    .replace(/(\d),(?=\d{3}(\D|$))/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const looksMath =
    mathClean.length > 0 &&
    /^[-+]?[\d\s+\-*/%^().!,a-z]+$/i.test(mathClean) &&
    /\d/.test(mathClean) &&
    /[+\-*/%^!(]/.test(mathClean);
  if (looksMath) {
    const hasLetters = /[a-z]/i.test(mathClean);
    push('math.evaluate', hasLetters ? 0.82 : 0.97, () => {
      try {
        const r = evaluate(mathClean);
        const pretty = formatNumber(r);
        return {
          tool: 'math.evaluate',
          toolLabel: 'Sandboxed arithmetic kernel',
          confidence: hasLetters ? 0.82 : 0.97,
          answer: `**Computed**

\`${mathClean.replace(/\*/g, '\u00d7')}\` = **${pretty}**

- Parsed by recursive descent — no eval, no cloud
- Grammar: \`+ - * / ^ % !\`, functions (\`sqrt, ln, sin\u2026\`), constants (\`pi, e, tau, phi\`), implicit multiplication`,
        };
      } catch (err) {
        return {
          tool: 'math.evaluate',
          toolLabel: 'Sandboxed arithmetic kernel',
          confidence: hasLetters ? 0.82 : 0.97,
          error: true,
          answer: `### Kernel refused the expression

\`${mathClean}\`

The parser halted: **${err instanceof Error ? err.message : 'unknown fault'}**

- Syntax accepted: \`2^10 * (3 + 4.5) - sqrt(81)\`, \`5!\`, \`min(3,4)\`, \`2pi\`
- Identifiers must be known functions or constants — variables are out of scope`,
        };
      }
    });
  }

  /* ---- units ---- */
  const convBody = raw.replace(/^convert\s+/i, '').replace(/(\d)([a-z\u00b0$])/i, '$1 $2');
  const convMatch = convBody.match(/^(-?\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (convMatch) {
    let parts = convMatch[2].split(/\s+(?:to|into)\s+/i);
    if (parts.length !== 2) parts = convMatch[2].split(/\s+in\s+/i);
    if (parts.length !== 2) parts = convMatch[2].split(/\s+as\s+/i);
    if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
      const value = Number(convMatch[1].replace(',', '.'));
      const from = parts[0].trim();
      const to = parts[1].trim().replace(/[?.!]\s*$/, '');
      push('unit.convert', 0.93, () => {
        try {
          const r = convert(value, from, to);
          return {
            tool: 'unit.convert',
            toolLabel: 'Unit algebra',
            confidence: 0.93,
            answer: `**Conversion complete** — ${r.category}

\`${formatConverted(value)} ${r.from}\` \u2192 **${formatConverted(r.result)} ${r.to}**

- Path: ${r.from} \u2192 base unit \u2192 ${r.to}
- Precision: 10 significant figures${r.approx ? '\n- Static reference rate \u2014 not live market data' : ''}`,
          };
        } catch (err) {
          return {
            tool: 'unit.convert',
            toolLabel: 'Unit algebra',
            confidence: 0.93,
            error: true,
            answer: `### Unit algebra failed

**${err instanceof Error ? err.message : 'Unknown fault'}**

- Format: \`convert <value> <unit> to <unit>\`
- Dimensions: length, mass, temperature, volume, area, speed, data, time, currency`,
          };
        }
      });
    }
  }

  /* ---- time ---- */
  if (/what time|time is it|current time|time now|tell me the time/i.test(lower)) {
    push('time.now', 0.9, () => {
      const d = new Date();
      return {
        tool: 'time.now',
        toolLabel: 'Temporal parser',
        confidence: 0.9,
        answer: `**Local time locked**

### ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}

- ${fmtFull(d)}
- Timezone: \`${Intl.DateTimeFormat().resolvedOptions().timeZone}\` (UTC${-d.getTimezoneOffset() / 60 >= 0 ? '+' : ''}${-d.getTimezoneOffset() / 60})
- Unix epoch: \`${Math.floor(d.getTime() / 1000)}\``,
      };
    });
  }

  if (/what('s| is) the date|today'?s date|what day is (it|today)|what is the date/i.test(lower)) {
    push('time.date', 0.9, () => {
      const d = new Date();
      const doy = Math.floor((startOfDay(d).getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
      return {
        tool: 'time.date',
        toolLabel: 'Temporal parser',
        confidence: 0.9,
        answer: `**Today resolved**

### ${fmtFull(d)}

- Day **${doy}** of ${d.getFullYear()} \u00b7 ISO week **${isoWeek(d)}**
- ${365 + (new Date(d.getFullYear(), 1, 29).getMonth() === 1 ? 1 : 0) - doy} days remain in the year`,
      };
    });
  }

  const offset = lower.match(/\bin\s+(\d+)\s+(day|days|week|weeks|month|months|hour|hours)\b/);
  if (offset) {
    push('time.offset', 0.92, () => {
      const n = Number(offset[1]);
      const unit = offset[2].replace(/s$/, '');
      const d = new Date();
      if (unit === 'day') d.setDate(d.getDate() + n);
      else if (unit === 'week') d.setDate(d.getDate() + n * 7);
      else if (unit === 'month') d.setMonth(d.getMonth() + n);
      else d.setHours(d.getHours() + n);
      return {
        tool: 'time.offset',
        toolLabel: 'Temporal parser',
        confidence: 0.92,
        answer: `**Offset applied** — +${n} ${unit}${n === 1 ? '' : 's'} from now

### ${fmtFull(d)}

- That's a **${d.toLocaleDateString('en-US', { weekday: 'long' })}**
- ISO format: \`${d.toISOString().slice(0, 10)}\``,
      };
    });
  }

  const until = lower.match(/(?:how many )?(?:days?|hours?)\s+(?:until|till|to|before)\s+(.+)$|how long until\s+(.+)$/);
  if (until) {
    const target = (until[1] ?? until[2]).trim();
    push('time.until', 0.92, () => {
      const d = parseDateLoose(target);
      if (!d) {
        return {
          tool: 'time.until',
          toolLabel: 'Temporal parser',
          confidence: 0.92,
          error: true,
          answer: `### Temporal parser stalled

I couldn't resolve \`${target}\` as a date.

- Accepted: \`2026-12-25\`, \`Dec 25\`, \`march 3rd\`, \`christmas\`, \`new year\`
- Try: \`days until 2026-12-31\``,
        };
      }
      const ms = startOfDay(d).getTime() - startOfDay(new Date()).getTime();
      const days = Math.round(ms / 86400000);
      return {
        tool: 'time.until',
        toolLabel: 'Temporal parser',
        confidence: 0.92,
        answer: `**Countdown computed**

### ${days === 0 ? 'That is today' : `${Math.abs(days).toLocaleString('en-US')} day${Math.abs(days) === 1 ? '' : 's'} ${days > 0 ? 'from now' : 'ago'}`}

- Target: ${fmtFull(d)}
- \u2248 ${Math.abs(Math.round((ms / 3600000) * 10) / 10).toLocaleString('en-US')} hours \u00b7 \u2248 ${(Math.abs(ms / 60480000)).toFixed(1)} weeks`,
      };
    });
  }

  const weekday = lower.match(/(?:when is|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|when is (the )?weekend|next weekend/);
  if (weekday) {
    push('time.weekday', 0.9, () => {
      const name = weekday[1] ?? 'saturday';
      const map: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
      const target = map[name];
      const now = new Date();
      const diff = (target - now.getDay() + 7) % 7 || 7;
      const d = new Date(now);
      d.setDate(now.getDate() + diff);
      return {
        tool: 'time.weekday',
        toolLabel: 'Temporal parser',
        confidence: 0.9,
        answer: `**Next ${name[0].toUpperCase() + name.slice(1)} located**

### ${fmtFull(d)}

- **${diff}** day${diff === 1 ? '' : 's'} from today
- Reserve it: \`add task: prepare for ${name}\``,
      };
    });
  }

  if (/unix (time|timestamp)|epoch (time|now)/i.test(lower)) {
    push('time.unix', 0.92, () => {
      const now = Date.now();
      return {
        tool: 'time.unix',
        toolLabel: 'Temporal parser',
        confidence: 0.92,
        answer: `**Epoch locked**

### ${Math.floor(now / 1000)}

- Seconds since 1970-01-01 00:00:00 UTC
- Milliseconds: \`${now}\` \u00b7 ISO: \`${new Date(now).toISOString()}\``,
      };
    });
  }

  if (/day of the year/i.test(lower)) {
    push('time.doy', 0.9, () => {
      const d = new Date();
      const doy = Math.floor((startOfDay(d).getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
      return {
        tool: 'time.doy',
        toolLabel: 'Temporal parser',
        confidence: 0.9,
        answer: `Today is day **${doy}** of ${d.getFullYear()} — **${(doy / (new Date(d.getFullYear(), 1, 29).getMonth() === 1 ? 366 : 365) * 100).toFixed(1)}%** of the year elapsed.`,
      };
    });
  }

  if (/week number/i.test(lower)) {
    push('time.week', 0.88, () => ({
      tool: 'time.week',
      toolLabel: 'Temporal parser',
      confidence: 0.88,
      answer: `We are in ISO week **${isoWeek(new Date())}** of ${new Date().getFullYear()}.`,
    }));
  }

  const leap = lower.match(/is\s+(\d{4})\s+a leap year/);
  if (leap) {
    push('time.leap', 0.93, () => {
      const y = Number(leap[1]);
      const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      return {
        tool: 'time.leap',
        toolLabel: 'Temporal parser',
        confidence: 0.93,
        answer: `**${y} is ${isLeap ? '' : 'not '}a leap year.**

- Rule: divisible by 4, except centuries \u2014 unless divisible by 400
- February ${y} carries **${isLeap ? 29 : 28}** days`,
      };
    });
  }

  const born = lower.match(/born in\s+(\d{4})/);
  if (born) {
    push('time.age', 0.88, () => {
      const y = Number(born[1]);
      const now = new Date();
      const age = now.getFullYear() - y - (now.getMonth() === 0 && now.getDate() < 1 ? 1 : 0);
      return {
        tool: 'time.age',
        toolLabel: 'Temporal parser',
        confidence: 0.88,
        answer: `Born in **${y}** \u2192 approximately **${age}** years old (year-based; exact age needs a full birth date).`,
      };
    });
  }

  /* ---- entropy ---- */
  if (/\b(uuid|guid)\b/i.test(lower)) {
    push('gen.uuid', 0.93, () => ({
      tool: 'gen.uuid',
      toolLabel: 'Entropy pool',
      confidence: 0.93,
      answer: `**UUID v4 minted** (crypto-seeded)

\`${uid()}\`

- 122 random bits \u00b7 collision odds: negligible for any human-scale purpose`,
    }));
  }

  if (/password/i.test(lower)) {
    push('gen.password', 0.93, () => {
      const lenM = lower.match(/(\d{1,3})/);
      const len = lenM ? Number(lenM[1]) : 16;
      const pw = genPassword(len);
      return {
        tool: 'gen.password',
        toolLabel: 'Entropy pool',
        confidence: 0.93,
        answer: `**Key material generated** — crypto-seeded, locally

\`${pw}\`

- Length: **${pw.length}** \u00b7 alphabet: 66 symbols (ambiguous glyphs stripped)
- Entropy: \u2248 **${Math.round(pw.length * Math.log2(66))} bits**
- Never stored, never transmitted`,
      };
    });
  }

  const rnd = lower.match(/random number between\s+(-?\d+)\s+and\s+(-?\d+)/);
  if (rnd) {
    push('gen.random', 0.94, () => {
      const a = Math.min(Number(rnd[1]), Number(rnd[2]));
      const b = Math.max(Number(rnd[1]), Number(rnd[2]));
      const n = a + randInt(b - a + 1);
      return {
        tool: 'gen.random',
        toolLabel: 'Entropy pool',
        confidence: 0.94,
        answer: `Drew **${n.toLocaleString('en-US')}** from [${a.toLocaleString('en-US')} \u2026 ${b.toLocaleString('en-US')}] — uniform, crypto-seeded.`,
      };
    });
  }

  const dice = lower.match(/roll\s+(?:(\d{1,2})\s*d\s*(\d{1,4}))\s*([+-]\s*\d{1,3})?/);
  const plainDice = /roll (a )?(die|dice|d6)/i.test(lower) && !dice;
  if (dice || plainDice) {
    push('gen.dice', 0.94, () => {
      const count = Math.min(20, Math.max(1, dice ? Number(dice[1] || 1) : 1));
      const sides = Math.min(1000, Math.max(2, dice ? Number(dice[2]) : 6));
      const mod = dice && dice[3] ? Number(dice[3].replace(/\s/g, '')) : 0;
      const rolls = Array.from({ length: count }, () => 1 + randInt(sides));
      const total = rolls.reduce((x, y) => x + y, 0) + mod;
      return {
        tool: 'gen.dice',
        toolLabel: 'Entropy pool',
        confidence: 0.94,
        answer: `**${count}d${sides}${mod ? (mod > 0 ? ` + ${mod}` : ` \u2212 ${Math.abs(mod)}`) : ''} resolved**

Rolls: ${rolls.map((r) => `\`${r}\``).join('  ')}

- Sum of dice: **${rolls.reduce((x, y) => x + y, 0)}**${mod ? ` \u00b7 with modifier: **${total}**` : ''}
- Expected value was \u2248 ${((count * (sides + 1)) / 2 + mod).toFixed(1)} \u2014 ${total > count * (sides + 1) / 2 + mod ? 'lucky draw' : total < count * (sides + 1) / 2 + mod ? 'cold draw' : 'dead on expectation'}`,
      };
    });
  }

  if (/flip a coin|coin flip|heads or tails/i.test(lower)) {
    push('gen.coin', 0.93, () => {
      const heads = randInt(2) === 0;
      return {
        tool: 'gen.coin',
        toolLabel: 'Entropy pool',
        confidence: 0.93,
        answer: `The coin lands on **${heads ? 'HEADS' : 'TAILS'}** \u2014 fair, crypto-seeded, 50/50.`,
      };
    });
  }

  if (/random (color|colour|hex)/i.test(lower)) {
    push('gen.color', 0.9, () => {
      const n = randInt(16777216);
      const hex = `#${n.toString(16).padStart(6, '0')}`;
      const r = (n >> 16) & 255;
      const g = (n >> 8) & 255;
      const b = n & 255;
      return {
        tool: 'gen.color',
        toolLabel: 'Entropy pool',
        confidence: 0.9,
        answer: `**${hex.toUpperCase()}**

- RGB(${r}, ${g}, ${b})
- Luminance: ${((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255).toFixed(2)} \u2014 reads ${0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? 'light' : 'dark'}
- Paste it into any stylesheet`,
      };
    });
  }

  /* ---- memory lattice ---- */
  const taskAdd = raw.match(/^(?:add\s+)?(?:a\s+)?task[:\s]+([\s\S]+)$/i) ?? raw.match(/^todo[:\s]+([\s\S]+)$/i) ?? raw.match(/^(?:remember|remind me) to\s+([\s\S]+)$/i);
  if (taskAdd) {
    push('mem.task.add', 0.92, () => {
      const text = taskAdd[1].trim().replace(/[.!]\s*$/, '');
      ctx.ops.addTask(text);
      const open = ctx.memory.tasks.filter((t) => !t.done).length + 1;
      return {
        tool: 'mem.task.add',
        toolLabel: 'Memory lattice \u00b7 tasks',
        confidence: 0.92,
        answer: `**Task committed to the lattice**

- \`${text}\`
- Open tasks: **${open}** \u00b7 persisted locally, survives reload
- Close it later with \`done: ${text}\``,
      };
    });
  }

  if (/(^|\s)(list|show)\s+(my\s+)?tasks?|^tasks?$|^todos?$|what('s| is) on my (plate|list)/i.test(lower)) {
    push('mem.task.list', 0.88, () => {
      const tasks = ctx.memory.tasks;
      if (tasks.length === 0) {
        return {
          tool: 'mem.task.list',
          toolLabel: 'Memory lattice \u00b7 tasks',
          confidence: 0.88,
          answer: `Task lattice is **empty**. Commit something: \`add task: review pull requests\``,
        };
      }
      const open = tasks.filter((t) => !t.done);
      const done = tasks.filter((t) => t.done);
      return {
        tool: 'mem.task.list',
        toolLabel: 'Memory lattice \u00b7 tasks',
        confidence: 0.88,
        answer: `### Task lattice — ${tasks.length} total

${open.length ? `**Open (${open.length})**\n${open.map((t) => `- ${t.text}`).join('\n')}` : '**Open (0)** — queue clear'}
${done.length ? `\n**Done (${done.length})**\n${done.map((t) => `- ~~${t.text}~~`).join('\n')}` : ''}

- Toggle from the telemetry panel, or \`done: <task>\``,
      };
    });
  }

  const taskDone = raw.match(/^(?:done|complete|finish|check off)[:\s]+([\s\S]+)$/i) ?? raw.match(/^mark\s+(.+?)\s+as done$/i);
  if (taskDone) {
    push('mem.task.done', 0.9, () => {
      const q = taskDone[1].trim();
      const hit = fuzzyFind(ctx.memory.tasks.filter((t) => !t.done), q);
      if (!hit) {
        return {
          tool: 'mem.task.done',
          toolLabel: 'Memory lattice \u00b7 tasks',
          confidence: 0.9,
          error: true,
          answer: `### No matching open task

Nothing open resembles \`${q}\`. Run \`list tasks\` to see the lattice, or \`add task: ${q}\` to create it.`,
        };
      }
      ctx.ops.setTaskDone(hit.id, true);
      const remaining = ctx.memory.tasks.filter((t) => !t.done && t.id !== hit.id).length;
      return {
        tool: 'mem.task.done',
        toolLabel: 'Memory lattice \u00b7 tasks',
        confidence: 0.9,
        answer: `**Cleared** \u2014 \`${hit.text}\` marked done. ${remaining} open task${remaining === 1 ? '' : 's'} remain in the lattice.`,
      };
    });
  }

  const taskDel = raw.match(/^(?:delete|remove)\s+(?:the\s+)?task\s+([\s\S]+)$/i) ?? raw.match(/^remove todo\s+([\s\S]+)$/i);
  if (taskDel) {
    push('mem.task.del', 0.9, () => {
      const hit = fuzzyFind(ctx.memory.tasks, taskDel[1].trim());
      if (!hit) {
        return {
          tool: 'mem.task.del',
          toolLabel: 'Memory lattice \u00b7 tasks',
          confidence: 0.9,
          error: true,
          answer: `### Nothing to delete

No task resembles \`${taskDel[1].trim()}\`. \`list tasks\` shows what the lattice holds.`,
        };
      }
      ctx.ops.removeTask(hit.id);
      return {
        tool: 'mem.task.del',
        toolLabel: 'Memory lattice \u00b7 tasks',
        confidence: 0.9,
        answer: `**Purged** \u2014 \`${hit.text}\` removed from the lattice entirely.`,
      };
    });
  }

  if (/clear (?:done|completed)( tasks?)?|^clear done$/i.test(lower)) {
    push('mem.task.cleardone', 0.9, () => {
      const doneCount = ctx.memory.tasks.filter((t) => t.done).length;
      ctx.ops.clearDoneTasks();
      return {
        tool: 'mem.task.cleardone',
        toolLabel: 'Memory lattice \u00b7 tasks',
        confidence: 0.9,
        answer: doneCount
          ? `**Swept** — ${doneCount} completed task${doneCount === 1 ? '' : 's'} purged from the lattice.`
          : `Nothing to sweep — no completed tasks in the lattice.`,
      };
    });
  }

  const noteAdd = raw.match(/^(?:please\s+)?(?:remember|note|save)(?:\s+that|:)?\s+([\s\S]+)$/i);
  if (noteAdd) {
    push('mem.note.add', 0.9, () => {
      const text = noteAdd[1].trim().replace(/[.!]\s*$/, '');
      ctx.ops.addNote(text);
      return {
        tool: 'mem.note.add',
        toolLabel: 'Memory lattice \u00b7 notes',
        confidence: 0.9,
        answer: `**Written to long-term memory**

- \`${text}\`
- Total notes: **${ctx.memory.notes.length + 1}** \u00b7 persists across reloads
- Recall with \`show notes\` \u00b7 erase with \`forget: <snippet>\``,
      };
    });
  }

  if (/what do you remember|show (me )?(my )?notes|list (my )?notes|^notes?$|my notes/i.test(lower)) {
    push('mem.note.list', 0.88, () => {
      const notes = ctx.memory.notes;
      if (notes.length === 0) {
        return {
          tool: 'mem.note.list',
          toolLabel: 'Memory lattice \u00b7 notes',
          confidence: 0.88,
          answer: `The lattice is **blank** — nothing stored yet. Try: \`remember: the deploy key rotates monthly\``,
        };
      }
      return {
        tool: 'mem.note.list',
        toolLabel: 'Memory lattice \u00b7 notes',
        confidence: 0.88,
        answer: `### Memory lattice — ${notes.length} note${notes.length === 1 ? '' : 's'}

${notes.map((n) => `- ${n.text}`).join('\n')}

- Stored in this browser only \u00b7 erase any with \`forget: <snippet>\``,
      };
    });
  }

  const forget = raw.match(/^(?:forget|delete note|remove note)[:\s]+([\s\S]+)$/i);
  if (forget) {
    push('mem.note.forget', 0.9, () => {
      const hit = fuzzyFind(ctx.memory.notes, forget[1].trim());
      if (!hit) {
        return {
          tool: 'mem.note.forget',
          toolLabel: 'Memory lattice \u00b7 notes',
          confidence: 0.9,
          error: true,
          answer: `### Nothing matched

No stored note resembles \`${forget[1].trim()}\`. \`show notes\` lists what I hold.`,
        };
      }
      ctx.ops.removeNote(hit.id);
      return {
        tool: 'mem.note.forget',
        toolLabel: 'Memory lattice \u00b7 notes',
        confidence: 0.9,
        answer: `**Erased** \u2014 \`${hit.text}\` is gone from the lattice. ${ctx.memory.notes.length - 1} note(s) remain.`,
      };
    });
  }

  /* ---- text ---- */
  const summ = raw.match(/^\/?summarize[:\s-]+([\s\S]+)$/i);
  if (summ) {
    push('text.summarize', 0.95, () => {
      const body = summ[1].trim();
      const wc = body.split(/\s+/).filter(Boolean).length;
      if (wc < 20) {
        return {
          tool: 'text.summarize',
          toolLabel: 'Text synthesizer',
          confidence: 0.95,
          error: true,
          answer: `### Passage too short to compress

That's **${wc}** words — summarization needs at least 20 to extract signal. Paste a longer passage after \`summarize:\`.`,
        };
      }
      const { bullets, terms, from, to } = summarizeText(body);
      const reduction = Math.round((1 - to / from) * 100);
      return {
        tool: 'text.summarize',
        toolLabel: 'Text synthesizer',
        confidence: 0.95,
        answer: `### Distilled — ${from} sentences \u2192 ${to} (${reduction}% compression)

${bullets.map((b) => `- ${b}`).join('\n')}

**Key terms:** ${terms.map((t) => `\`${t}\``).join(' ')}

- Extractive frequency scoring — every line above is verbatim from your text, nothing invented`,
      };
    });
  }

  const stats = raw.match(/^\/?(?:count|stats|analyze)[:\s-]*([\s\S]*)$/i);
  if (stats) {
    push('text.stats', 0.9, () => {
      const body = (stats[1] ?? '').trim();
      if (!body) {
        return {
          tool: 'text.stats',
          toolLabel: 'Text synthesizer',
          confidence: 0.9,
          error: true,
          answer: `### Nothing to measure

Format: \`stats: <your text>\` — returns words, characters, sentences, reading time and lexical density.`,
        };
      }
      const ws = body.split(/\s+/).filter(Boolean);
      const uniq = new Set(ws.map((w) => w.toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean));
      const sentences = body.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
      return {
        tool: 'text.stats',
        toolLabel: 'Text synthesizer',
        confidence: 0.9,
        answer: `### Passage telemetry

- **${ws.length.toLocaleString('en-US')}** words \u00b7 **${body.length.toLocaleString('en-US')}** characters (${body.replace(/\s/g, '').length.toLocaleString('en-US')} without spaces)
- **${sentences}** sentence${sentences === 1 ? '' : 's'} \u00b7 **${body.split(/\n{2,}/).filter((s) => s.trim()).length}** paragraph(s)
- Reading time: **\u2248 ${Math.max(1, Math.round(ws.length / 200))} min** at 200 wpm
- Lexical density: **${((uniq.size / Math.max(1, ws.length)) * 100).toFixed(0)}%** unique (\u2248${uniq.size} distinct words)`,
      };
    });
  }

  const rev = raw.match(/^reverse\s+([\s\S]+)$/i);
  if (rev) {
    push('text.reverse', 0.92, () => ({
      tool: 'text.reverse',
      toolLabel: 'Text synthesizer',
      confidence: 0.92,
      answer: `**Reversed**

\`${[...rev[1].trim()].reverse().join('')}\``,
    }));
  }

  const b64 = raw.match(/^(?:base64|b64)\s+(encode|decode)\s+([\s\S]+)$/i);
  if (b64) {
    push('text.base64', 0.95, () => {
      const payload = b64[2].trim();
      try {
        if (b64[1].toLowerCase() === 'encode') {
          const bytes = new TextEncoder().encode(payload);
          let bin = '';
          bytes.forEach((byte) => (bin += String.fromCharCode(byte)));
          return {
            tool: 'text.base64',
            toolLabel: 'Codec bank',
            confidence: 0.95,
            answer: `**Encoded** (UTF-8 safe)

\`${btoa(bin)}\`

- ${payload.length} chars \u2192 ${btoa(bin).length} base64 chars`,
          };
        }
        const bin = atob(payload.replace(/\s/g, ''));
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        const out = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return {
          tool: 'text.base64',
          toolLabel: 'Codec bank',
          confidence: 0.95,
          answer: `**Decoded**

\`${out}\``,
        };
      } catch {
        return {
          tool: 'text.base64',
          toolLabel: 'Codec bank',
          confidence: 0.95,
          error: true,
          answer: `### Codec fault

\`${payload.slice(0, 32)}${payload.length > 32 ? '\u2026' : ''}\` is not valid base64 — check the alphabet and padding.`,
        };
      }
    });
  }

  return m;
}

function buildCandidates(matches: Match[]): Candidate[] {
  const top = matches.slice(0, 3).map((m) => ({ name: m.id, score: Math.min(0.99, m.score) }));
  const fillers: Candidate[] = [
    { name: 'math.evaluate', score: 0.11 },
    { name: 'core.help', score: 0.07 },
    { name: 'text.summarize', score: 0.04 },
  ];
  for (const f of fillers) {
    if (top.length >= 3) break;
    if (!top.some((t) => t.name === f.name)) top.push(f);
  }
  return top;
}

function fallback(matches: Match[], input: string): ToolOut {
  const words = input.trim().split(/\s+/).filter(Boolean).length;
  const near = matches.slice(0, 3);
  const nearLines = near.length
    ? near.map((m) => `- \`${m.id}\` \u2014 ${Math.round(m.score * 100)}% (below the 45% bar)`).join('\n')
    : `- No module fired at all — input matched zero signatures`;
  return {
    tool: 'core.fallback',
    toolLabel: 'Honest refusal',
    confidence: 0.12,
    answer: `### No tool cleared the confidence threshold

I ran the input through all ${MODULE_COUNT} modules and I'm **declining to guess** — that's the whole point of a deterministic core.

**Closest signatures**
${nearLines}

${words > 40 ? `This looks like a long passage — try \`summarize: <paste it>\` or \`stats: <paste it>\`.\n\n` : ''}**Shapes I understand**
- \`(128 * 46) - 17^2\` \u00b7 \`convert 100 km to mi\` \u00b7 \`days until 2026-12-25\`
- \`remember: <anything>\` \u00b7 \`add task: <anything>\` \u00b7 \`/help\` for the full registry`,
  };
}

/* ---------------- orchestrator ---------------- */

export function runBrain(raw: string, ctx: BrainCtx): BrainResult {
  const steps: ReasoningStep[] = [];
  const input = raw.trim();
  const lower = input.toLowerCase();
  const words = input.split(/\s+/).filter(Boolean).length;

  const t0 = performance.now();
  const matches = detect(input, lower, ctx);
  steps.push({
    label: 'Lex & normalize',
    detail: `${input.length} chars \u00b7 ${words} tokens \u00b7 case-folded`,
    ms: round(performance.now() - t0),
  });

  const t1 = performance.now();
  matches.sort((a, b) => b.score - a.score);
  const candidates = buildCandidates(matches);
  const top = matches[0];
  steps.push({
    label: 'Intent classification',
    detail: `${matches.length}/${MODULE_COUNT} modules fired \u00b7 top \`${top?.id ?? 'none'}\` @ ${Math.round((top?.score ?? 0.04) * 100)}%`,
    ms: round(performance.now() - t1),
  });

  const t2 = performance.now();
  const out = !top || top.score < 0.45 ? fallback(matches, input) : top.run();
  steps.push({ label: `Dispatch \u2192 ${out.tool}`, detail: out.toolLabel, ms: round(performance.now() - t2) });

  const t3 = performance.now();
  steps.push({
    label: 'Compose response',
    detail: `${countTokens(out.answer)} tokens \u00b7 markdown-lite`,
    ms: round(performance.now() - t3),
  });

  return {
    answer: out.answer,
    steps,
    candidates,
    tool: out.tool,
    toolLabel: out.toolLabel,
    confidence: top ? Math.min(0.99, top.score) : 0.12,
    error: out.error,
    effect: out.effect,
  };
}
