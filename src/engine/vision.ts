/**
 * Agentic eyes — Screen Capture API + OCR.
 * Captures a single frame the operator explicitly grants, extracts text via
 * Tesseract (loaded on demand, run in its own worker), and distills the
 * result for the memory lattice. The stream is torn down immediately after
 * one frame — AXION does not keep watching.
 */

export interface ScreenFrame {
  dataUrl: string;
  width: number;
  height: number;
}

interface TesseractResult {
  data: { text: string };
}
interface TesseractWorker {
  recognize(image: string): Promise<TesseractResult>;
  terminate(): Promise<unknown>;
}
interface TesseractModule {
  createWorker(lang: string): Promise<TesseractWorker>;
}

const TESSERACT_CDN = 'https://esm.run/tesseract.js@5';

export function visionSupported(): boolean {
  return typeof navigator !== 'undefined' && 'mediaDevices' in navigator && !!navigator.mediaDevices.getDisplayMedia;
}

/** Capture exactly one frame, then kill the capture stream. */
export async function captureScreen(): Promise<ScreenFrame> {
  if (!visionSupported()) throw new Error('Screen Capture API unavailable in this browser');
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('No video track in the capture stream');
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.onloadeddata = () => resolve();
      setTimeout(resolve, 900); // hard fallback
    });
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(video, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL('image/png'), width, height };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/** Run OCR on the frame. Throws with an honest message if the engine can't load. */
export async function ocrFrame(frame: ScreenFrame): Promise<string> {
  try {
    const url: string = TESSERACT_CDN;
    const mod = (await import(/* @vite-ignore */ url)) as TesseractModule;
    const worker = await mod.createWorker('eng');
    try {
      const res = await worker.recognize(frame.dataUrl);
      return res.data.text.trim();
    } finally {
      void worker.terminate();
    }
  } catch (err) {
    throw new Error(`OCR engine unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'are', 'was', 'were', 'not', 'you', 'your', 'http', 'https', 'www']);

export interface ScreenDigest {
  chars: number;
  words: number;
  lines: number;
  topTerms: string[];
  excerpt: string;
}

export function digestScreen(text: string): ScreenDigest {
  const words = text.split(/\s+/).filter(Boolean);
  const freq = new Map<string, number>();
  for (const w of words) {
    const clean = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean.length >= 3 && !STOP.has(clean)) freq.set(clean, (freq.get(clean) ?? 0) + 1);
  }
  const topTerms = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
  const lines = text.split('\n').filter((l) => l.trim().length > 0).length;
  const excerpt = text.replace(/\s+/g, ' ').slice(0, 240);
  return { chars: text.length, words: words.length, lines, topTerms, excerpt };
}
