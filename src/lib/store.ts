export type Role = 'user' | 'assistant';

export interface ReasoningStep {
  label: string;
  detail: string;
  ms: number;
}

export interface Candidate {
  name: string;
  score: number;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  ts: number;
  thinking?: boolean;
  stopped?: boolean;
  steps?: ReasoningStep[];
  candidates?: Candidate[];
  tool?: string;
  toolLabel?: string;
  confidence?: number;
  latency?: number;
  tokens?: number;
  error?: boolean;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface NoteItem {
  id: string;
  text: string;
  ts: number;
}

export interface TaskItem {
  id: string;
  text: string;
  done: boolean;
  ts: number;
}

export interface Memory {
  notes: NoteItem[];
  tasks: TaskItem[];
}

export interface Stats {
  queries: number;
  tools: Record<string, number>;
}

export interface BrainResult {
  answer: string;
  steps: ReasoningStep[];
  candidates: Candidate[];
  tool: string;
  toolLabel: string;
  confidence: number;
  error?: boolean;
  effect?: 'clear-chat';
}

/* ---------------- helpers ---------------- */

export const uid = (): string => {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
};

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const countTokens = (s: string): number => Math.max(1, Math.round(s.length / 4));

export function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return 'now';
  const m = Math.floor(d / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export const clockTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

export function bytesUsed(keys: string[]): number {
  try {
    return keys.reduce((acc, k) => acc + (localStorage.getItem(k)?.length ?? 0), 0);
  } catch {
    return 0;
  }
}
