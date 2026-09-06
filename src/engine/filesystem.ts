/**
 * Agentic hands — File System Access API integration.
 *
 * Sandboxing rules (non-negotiable):
 *   · AXION may only touch `.txt`, `.md`, `.csv`, `.json` files
 *   · every write requires explicit operator confirmation in a UI modal
 *   · the directory handle is held in memory only — never serialized
 */

export const FS_EXTENSIONS = ['.txt', '.md', '.csv', '.json'] as const;
export type FsExtension = (typeof FS_EXTENSIONS)[number];

export interface FileEntry {
  name: string;
  ext: FsExtension;
  size: number;
  lastModified: number;
}

interface FsWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
interface FsFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FsWritable>;
}
interface FsAnyHandle {
  kind: 'file' | 'directory';
  name: string;
}
interface FsDirHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterableIterator<FsAnyHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>;
}
interface WindowWithFSA extends Window {
  showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FsDirHandle>;
}

export interface Workspace {
  name: string;
  handle: FsDirHandle;
}

export function fsSupported(): boolean {
  return typeof (window as WindowWithFSA).showDirectoryPicker === 'function';
}

export function isAllowedFile(name: string): FsExtension | null {
  const lower = name.toLowerCase();
  return FS_EXTENSIONS.find((ext) => lower.endsWith(ext)) ?? null;
}

function assertAllowed(name: string): FsExtension {
  const ext = isAllowedFile(name);
  if (!ext) {
    throw new Error(`Sandbox refusal — \`${name}\` is not on the allowlist. AXION reads/writes only ${FS_EXTENSIONS.join(', ')}`);
  }
  return ext;
}

/** Ask the OS for a directory grant. Returns null if the operator cancels. */
export async function requestWorkspace(): Promise<Workspace | null> {
  const w = window as WindowWithFSA;
  if (!w.showDirectoryPicker) throw new Error('This browser has no File System Access API — try Chrome or Edge');
  try {
    const handle = await w.showDirectoryPicker({ mode: 'readwrite', id: 'axion-workspace' });
    return { name: handle.name, handle };
  } catch {
    return null; // operator dismissed the picker — not an error
  }
}

export async function listWorkspace(ws: Workspace): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  for await (const entry of ws.handle.values()) {
    if (entry.kind !== 'file') continue;
    const ext = isAllowedFile(entry.name);
    if (!ext) continue;
    try {
      const fileHandle = await ws.handle.getFileHandle(entry.name);
      const file = await fileHandle.getFile();
      out.push({ name: entry.name, ext, size: file.size, lastModified: file.lastModified });
    } catch {
      out.push({ name: entry.name, ext, size: -1, lastModified: 0 });
    }
    if (out.length >= 200) break;
  }
  return out.sort((a, b) => b.lastModified - a.lastModified);
}

export async function fileExists(ws: Workspace, name: string): Promise<boolean> {
  try {
    await ws.handle.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

export async function readFileText(ws: Workspace, name: string): Promise<string> {
  assertAllowed(name);
  let fileHandle: FsFileHandle;
  try {
    fileHandle = await ws.handle.getFileHandle(name);
  } catch {
    throw new Error(`\`${name}\` does not exist in workspace \`${ws.name}\`. Run \`fs list\` to see what I can reach.`);
  }
  const file = await fileHandle.getFile();
  if (file.size > 2_000_000) {
    throw new Error(`\`${name}\` is ${(file.size / 1e6).toFixed(1)} MB — above the 2 MB read ceiling`);
  }
  return file.text();
}

export async function writeFileText(ws: Workspace, name: string, content: string): Promise<void> {
  assertAllowed(name);
  const fileHandle = await ws.handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/* ---------------- intent router ---------------- */

export type FsIntent =
  | { kind: 'attach' }
  | { kind: 'detach' }
  | { kind: 'list' }
  | { kind: 'read'; name: string }
  | { kind: 'save'; name: string }
  | { kind: 'write'; name: string; content: string };

export function matchFsIntent(input: string): FsIntent | null {
  const t = input.trim();
  const lower = t.toLowerCase();

  if (/^(fs[:\s]+)?(attach|open)( (a )?(folder|workspace|directory))?$/.test(lower) || lower === 'fs attach' || lower === '/fs attach') {
    return { kind: 'attach' };
  }
  if (/^(fs[:\s]+)?(detach|close workspace)$/.test(lower)) return { kind: 'detach' };
  if (/^(fs[:\s]+)?(list|ls)( files)?$/.test(lower) || /^(fs[:\s]+)?show (me )?(the )?files$/.test(lower)) return { kind: 'list' };

  const read = t.match(/^(?:fs[:\s]+)?read(?:\s+file)?\s+([\w.\- ]+\.\w{2,4})$/i);
  if (read) return { kind: 'read', name: read[1].trim() };

  const save = t.match(/^(?:fs[:\s]+)?save(?:\s+(?:the\s+)?(?:last\s+)?(?:answer|response|output))?\s+(?:as|to)\s+([\w.\- ]+\.\w{2,4})$/i) ??
    t.match(/^(?:fs[:\s]+)?save\s+([\w.\-]+\.\w{2,4})$/i);
  if (save) return { kind: 'save', name: save[1].trim() };

  const write = t.match(/^(?:fs[:\s]+)?write\s+([\w.\-]+\.\w{2,4})\s+([\s\S]+)$/i);
  if (write) return { kind: 'write', name: write[1].trim(), content: write[2].trim() };

  return null;
}
