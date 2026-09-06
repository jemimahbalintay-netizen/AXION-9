/**
 * Memory lattice v2 — IndexedDB-backed knowledge graph.
 * Nodes = facts / tasks / sessions, Edges = keyword-derived relationships.
 * localStorage remains the hot cache; IndexedDB is the durable graph the
 * 3D constellation and fuzzy search read from.
 */
import type { Memory, Session } from '../lib/store';

export type NodeKind = 'fact' | 'task' | 'session';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  body: string;
  ts: number;
  importance: number; // 0..1
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  rel: 'related' | 'references';
  ts: number;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const DB_NAME = 'axion-graph';
const DB_VERSION = 1;

const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'are', 'was', 'not', 'you', 'your', 'have', 'will', 'can']);

export function keywordsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) {
    if (!STOP.has(w)) out.add(w);
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const k of a) if (b.has(k)) n++;
  return n;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('nodes')) db.createObjectStore('nodes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('edges')) db.createObjectStore('edges', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('IndexedDB refused to open'));
  });
}

function importanceOf(text: string, boost = 0): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(1, 0.25 + Math.min(0.35, words / 40) + boost);
}

function recency(ts: number, now: number): number {
  const ageDays = (now - ts) / 86_400_000;
  return Math.max(0, 1 - ageDays / 30);
}

/** Rebuild the graph from the canonical localStorage state. Idempotent. */
export async function syncGraph(memory: Memory, sessions: Session[]): Promise<KnowledgeGraph> {
  const now = Date.now();
  const nodes: GraphNode[] = [];
  const kw = new Map<string, Set<string>>();

  for (const note of memory.notes) {
    const id = `n-${note.id}`;
    nodes.push({
      id,
      kind: 'fact',
      label: note.text.length > 44 ? `${note.text.slice(0, 44)}…` : note.text,
      body: note.text,
      ts: note.ts,
      importance: importanceOf(note.text, 0.1 * recency(note.ts, now)),
    });
    kw.set(id, keywordsOf(note.text));
  }
  for (const task of memory.tasks) {
    const id = `t-${task.id}`;
    nodes.push({
      id,
      kind: 'task',
      label: task.text.length > 44 ? `${task.text.slice(0, 44)}…` : task.text,
      body: task.done ? `[done] ${task.text}` : task.text,
      ts: task.ts,
      importance: importanceOf(task.text, task.done ? 0 : 0.2),
    });
    kw.set(id, keywordsOf(task.text));
  }
  for (const s of sessions.slice(0, 12)) {
    const id = `s-${s.id}`;
    nodes.push({
      id,
      kind: 'session',
      label: s.title.length > 40 ? `${s.title.slice(0, 40)}…` : s.title,
      body: `Session · ${s.messages.length} messages · ${s.title}`,
      ts: s.updatedAt,
      importance: 0.2 + 0.1 * recency(s.updatedAt, now),
    });
  }

  const edges: GraphEdge[] = [];
  let edgeSeq = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const ka = kw.get(a.id);
      const kb = kw.get(b.id);
      if (!ka || !kb) continue;
      const shared = overlap(ka, kb);
      if (shared === 0) continue;
      const rel: 'related' | 'references' = a.kind === b.kind ? 'related' : 'references';
      edges.push({ id: `e-${edgeSeq++}-${a.id}-${b.id}`, from: a.id, to: b.id, rel, ts: now });
    }
  }

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['nodes', 'edges'], 'readwrite');
      tx.objectStore('nodes').clear();
      tx.objectStore('edges').clear();
      for (const n of nodes) tx.objectStore('nodes').put(n);
      for (const e of edges) tx.objectStore('edges').put(e);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Graph transaction failed'));
      tx.onabort = () => reject(new Error('Graph transaction aborted'));
    });
    db.close();
  } catch {
    /* IndexedDB unavailable (private mode) — the graph still lives in memory */
  }

  return { nodes, edges };
}

/** Read the persisted graph (falls back to a fresh sync if the store is empty). */
export async function getGraph(memory: Memory, sessions: Session[]): Promise<KnowledgeGraph> {
  try {
    const db = await openDb();
    const graph = await new Promise<KnowledgeGraph>((resolve, reject) => {
      const tx = db.transaction(['nodes', 'edges'], 'readonly');
      const nodesReq = tx.objectStore('nodes').getAll();
      const edgesReq = tx.objectStore('edges').getAll();
      tx.oncomplete = () =>
        resolve({ nodes: (nodesReq.result ?? []) as GraphNode[], edges: (edgesReq.result ?? []) as GraphEdge[] });
      tx.onerror = () => reject(new Error('Graph read failed'));
    });
    db.close();
    if (graph.nodes.length > 0) return graph;
  } catch {
    /* fall through to live rebuild */
  }
  return syncGraph(memory, sessions);
}
