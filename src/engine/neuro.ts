/**
 * Neuro-Symbolic fallback router.
 *
 * Layer 1 (always): the deterministic kernel — zero hallucination.
 * Layer 2 (this file): a local neural layer for conceptual questions the
 * parser intentionally refuses. Providers, in priority order:
 *   1. `window.ai` — the browser-native Prompt API (zero download)
 *   2. WebLLM over WebGPU — Qwen2.5-1.5B-Instruct (q4f16_1), cached by the
 *      browser after first download; inference runs 100% on-device.
 * If neither exists, AXION keeps its honest refusal — the neural layer is an
 * optional augmentation, never a requirement.
 */

export type NeuroProvider = 'prompt-api' | 'webllm';
export type NeuroStatus = 'absent' | 'detecting' | 'downloading' | 'loading' | 'ready' | 'error';

export interface NeuroState {
  status: NeuroStatus;
  provider: NeuroProvider | null;
  progress: number;
  model: string | null;
  error: string | null;
  webgpu: boolean;
}

export const NEUTRAL_NEURO: NeuroState = {
  status: 'absent',
  provider: null,
  progress: 0,
  model: null,
  error: null,
  webgpu: false,
};

const SYSTEM_PROMPT =
  'You are the neural fallback layer inside AXION-9, a deterministic reasoning console. ' +
  'Answer conceptual questions concisely and honestly. Format with markdown-lite only: ' +
  '"### " headings, "- " bullets, **bold**, `code`. Never invent computations, dates, or ' +
  'measurements — say when something belongs to the deterministic core instead. Max ~180 words.';

const WEBLLM_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm';

/* ---- minimal ambient typings (no `any`) ---- */

interface PromptSession {
  prompt(input: string): Promise<string>;
  destroy?(): void;
}
interface PromptModel {
  create(opts?: { systemPrompt?: string; temperature?: number; topK?: number }): Promise<PromptSession>;
}
interface WindowAI {
  languageModel?: PromptModel;
}
declare global {
  interface Window {
    ai?: WindowAI;
  }
}

interface ChatChunk {
  choices?: { delta?: { content?: string } }[];
}
interface ChatRequest {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  stream: boolean;
  max_tokens: number;
  temperature: number;
}
interface MLCEngine {
  chat: { completions: { create(req: ChatRequest): Promise<AsyncIterable<ChatChunk>> } };
  unload?(): Promise<void>;
}
interface MLCEngineInitOpts {
  initProgressCallback?: (report: { progress: number; text: string }) => void;
}
interface WebLLMModule {
  CreateMLCEngine(model: string, opts: MLCEngineInitOpts): Promise<MLCEngine>;
}

/* ---- runtime state ---- */

let session: PromptSession | null = null;
let engine: MLCEngine | null = null;
let initState: Promise<boolean> | null = null;

export function detectNeuro(): { promptApi: boolean; webgpu: boolean } {
  const promptApi = typeof window !== 'undefined' && !!window.ai?.languageModel;
  const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  return { promptApi, webgpu };
}

function hasWebGPU(): boolean {
  return detectNeuro().webgpu;
}

/**
 * Boot the neural layer. Resolves true when a provider is ready.
 * Safe to call repeatedly — initialization is memoized.
 */
export function initNeuro(onState: (s: NeuroState) => void): Promise<boolean> {
  if (initState) return initState;
  initState = (async () => {
    const caps = detectNeuro();
    onState({ ...NEUTRAL_NEURO, status: 'detecting', webgpu: caps.webgpu });

    // Provider 1: native Prompt API
    if (caps.promptApi && window.ai?.languageModel) {
      try {
        onState({ ...NEUTRAL_NEURO, status: 'loading', provider: 'prompt-api', model: 'window.ai · on-device', webgpu: caps.webgpu, progress: 0.5 });
        session = await window.ai.languageModel.create({ systemPrompt: SYSTEM_PROMPT, temperature: 0.6, topK: 40 });
        onState({ ...NEUTRAL_NEURO, status: 'ready', provider: 'prompt-api', model: 'window.ai · on-device', progress: 1, webgpu: caps.webgpu });
        return true;
      } catch (err) {
        session = null;
        onState({ ...NEUTRAL_NEURO, status: 'detecting', webgpu: caps.webgpu, error: `prompt-api refused: ${err instanceof Error ? err.message : String(err)}` });
      }
    }

    // Provider 2: WebLLM over WebGPU
    if (caps.webgpu) {
      try {
        onState({ ...NEUTRAL_NEURO, status: 'downloading', provider: 'webllm', model: WEBLLM_MODEL, webgpu: true, progress: 0.02 });
        const url: string = WEBLLM_CDN;
        const mod = (await import(/* @vite-ignore */ url)) as WebLLMModule;
        engine = await mod.CreateMLCEngine(WEBLLM_MODEL, {
          initProgressCallback: (report) => {
            const downloading = /download|fetch|cache/i.test(report.text);
            onState({
              ...NEUTRAL_NEURO,
              status: downloading ? 'downloading' : 'loading',
              provider: 'webllm',
              model: WEBLLM_MODEL,
              webgpu: true,
              progress: Math.max(0.02, Math.min(1, report.progress)),
            });
          },
        });
        onState({ ...NEUTRAL_NEURO, status: 'ready', provider: 'webllm', model: WEBLLM_MODEL, webgpu: true, progress: 1 });
        return true;
      } catch (err) {
        engine = null;
        onState({
          ...NEUTRAL_NEURO,
          status: 'error',
          provider: null,
          webgpu: caps.webgpu,
          error: `WebLLM failed to initialize: ${err instanceof Error ? err.message : String(err)}`,
        });
        return false;
      }
    }

    onState({ ...NEUTRAL_NEURO, status: 'absent', error: 'No neural substrate detected (needs window.ai or WebGPU)' });
    return false;
  })();
  return initState;
}

export function neuroReady(): boolean {
  return !!session || !!engine;
}

export function describeProvider(): string {
  if (session) return 'prompt-api · native on-device model';
  if (engine) return `webllm · ${WEBLLM_MODEL} (WebGPU)`;
  return 'none';
}

/**
 * Stream a neural completion. Throws if no provider is ready — the caller
 * decides how to surface the failure.
 */
export async function streamNeural(
  question: string,
  onToken: (chunk: string) => void,
  isCancelled: () => boolean,
): Promise<void> {
  if (session) {
    const answer = await session.prompt(`${question}\n\nRespond in markdown-lite.`);
    // Prompt API `prompt()` is non-streaming in most builds — chunk it out
    const words = answer.split(/(\s+)/);
    for (let i = 0; i < words.length; i += 4) {
      if (isCancelled()) return;
      onToken(words.slice(i, i + 4).join(''));
      await new Promise((r) => setTimeout(r, 12));
    }
    return;
  }
  if (engine) {
    const stream = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: question },
      ],
      stream: true,
      max_tokens: 420,
      temperature: 0.6,
    });
    for await (const chunk of stream) {
      if (isCancelled()) return;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) onToken(delta);
    }
    return;
  }
  throw new Error('Neural layer is not initialized');
}

/** Tear down the engine (used by the panel's "unload" action). */
export async function unloadNeuro(onState: (s: NeuroState) => void): Promise<void> {
  if (session?.destroy) session.destroy();
  session = null;
  if (engine?.unload) await engine.unload();
  engine = null;
  initState = null;
  onState({ ...NEUTRAL_NEURO, webgpu: hasWebGPU() });
}
