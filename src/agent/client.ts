import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createAlibaba } from '@ai-sdk/alibaba';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, type LanguageModel } from 'ai';
import {
  DEFAULT_LLM_PROVIDER,
  DEFAULT_OPENAI_API_MODE,
  defaultModelForProvider,
  normalizeLlmProvider,
  normalizeOpenAiApiMode,
  protocolForProvider,
  providerApiPath,
  type LlmProtocol,
  type LlmProvider,
  type OpenAiApiMode,
} from '../../shared/llm-providers';
import { normalizeLlmMessages } from './messages';

export {
  DEFAULT_LLM_PROVIDER,
  DEFAULT_OPENAI_API_MODE,
  defaultModelForProvider,
  normalizeLlmProvider,
  normalizeOpenAiApiMode,
  protocolForProvider,
  providerApiPath,
};
export type { LlmProvider, OpenAiApiMode };
export type ConfiguredLanguageModel = Exclude<LanguageModel, string>;

export let PROVIDER: LlmProvider = DEFAULT_LLM_PROVIDER;
export let MODEL = defaultModelForProvider(PROVIDER);
export let OPENAI_API_MODE: OpenAiApiMode = DEFAULT_OPENAI_API_MODE;
export let PROTOCOL: LlmProtocol = protocolForProvider(PROVIDER);

export function setLlmConfig(
  provider: unknown,
  model: unknown,
  openAiApiMode: unknown = OPENAI_API_MODE,
  protocol: LlmProtocol = protocolForProvider(provider),
): void {
  PROVIDER = normalizeLlmProvider(provider);
  MODEL = typeof model === 'string' && model.trim()
    ? model.trim()
    : defaultModelForProvider(PROVIDER);
  OPENAI_API_MODE = normalizeOpenAiApiMode(openAiApiMode);
  PROTOCOL = protocol;
}

export function setLlmModel(model: string): void {
  setLlmConfig(PROVIDER, model);
}

export function setLlmProvider(provider: unknown): void {
  setLlmConfig(provider, '');
}

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
// The server proxy target owns the provider/version prefix. AI SDK appends the
// native operation path, which also supports compatible APIs such as
// `/v1beta/openai/chat/completions`.
const PROXY_API_BASE = `${ORIGIN}/llm`;
const PROXY_KEY = 'proxy-injects-the-real-key';

const proxyHeaders = (provider: LlmProvider): Record<string, string> => ({
  'x-openchatcut-provider': provider,
});

const anthropicProviders = new Map<LlmProvider, ReturnType<typeof createAnthropic>>();
const openaiProviders = new Map<LlmProvider, ReturnType<typeof createOpenAI>>();

function anthropicProvider(connection: LlmProvider): ReturnType<typeof createAnthropic> {
  const existing = anthropicProviders.get(connection);
  if (existing) return existing;
  const created = createAnthropic({ baseURL: PROXY_API_BASE, apiKey: PROXY_KEY, headers: proxyHeaders(connection) });
  anthropicProviders.set(connection, created);
  return created;
}

function openaiProvider(connection: LlmProvider): ReturnType<typeof createOpenAI> {
  const existing = openaiProviders.get(connection);
  if (existing) return existing;
  const created = createOpenAI({ baseURL: PROXY_API_BASE, apiKey: PROXY_KEY, headers: proxyHeaders(connection) });
  openaiProviders.set(connection, created);
  return created;
}
// providers with official exclusive packages must use official packages (provider-specific semantics — such as Gemini thought_signature —
// Handled by the official provider); the rest go to openai-compatible. The real key is injected via the /llm agent.
const proxied = <T>(provider: LlmProvider, create: (o: { baseURL: string; apiKey: string; headers: Record<string, string> }) => T): T =>
  create({ baseURL: PROXY_API_BASE, apiKey: PROXY_KEY, headers: proxyHeaders(provider) });
const DEDICATED_PROVIDERS: Partial<Record<LlmProvider, (model: string) => ConfiguredLanguageModel>> = {
  gemini: proxied('gemini', createGoogleGenerativeAI),
  kimi: proxied('kimi', createMoonshotAI),
  qwen: proxied('qwen', createAlibaba),
  deepseek: proxied('deepseek', createDeepSeek),
  mistral: proxied('mistral', createMistral),
};

const compatibleProviders = new Map<LlmProvider, ReturnType<typeof createOpenAICompatible>>();

function compatibleProvider(provider: LlmProvider): ReturnType<typeof createOpenAICompatible> {
  const existing = compatibleProviders.get(provider);
  if (existing) return existing;
  const created = createOpenAICompatible({
    name: provider,
    baseURL: PROXY_API_BASE,
    apiKey: PROXY_KEY,
    headers: proxyHeaders(provider),
  });
  compatibleProviders.set(provider, created);
  return created;
}

export function getLanguageModel(
  provider?: LlmProvider,
  model?: string,
  openAiApiMode: OpenAiApiMode = OPENAI_API_MODE,
  protocol?: LlmProtocol,
): ConfiguredLanguageModel {
  const connection = provider ?? PROVIDER;
  const modelId = model ?? MODEL;
  const selectedProtocol = protocol ?? (provider === undefined ? PROTOCOL : protocolForProvider(connection));
  if (selectedProtocol === 'anthropic') return anthropicProvider(connection)(modelId);
  if (selectedProtocol === 'openai') {
    return openAiApiMode === 'chat'
      ? openaiProvider(connection).chat(modelId)
      : openaiProvider(connection).responses(modelId);
  }
  const dedicated = DEDICATED_PROVIDERS[connection];
  if (dedicated) return dedicated(modelId);
  return compatibleProvider(connection)(modelId);
}

export function getLanguageModelProviderOptions(
  provider?: LlmProvider,
  openAiApiMode: OpenAiApiMode = OPENAI_API_MODE,
  protocol?: LlmProtocol,
): Record<string, Record<string, boolean>> | undefined {
  const connection = provider ?? PROVIDER;
  const selectedProtocol = protocol ?? (provider === undefined ? PROTOCOL : protocolForProvider(connection));
  if (connection === 'minimax') {
    return { minimax: { reasoning_split: true } };
  }
  return selectedProtocol === 'openai' && openAiApiMode === 'responses'
    ? { openai: { store: false } }
    : undefined;
}

export async function generateAgentText(options: {
  system?: string;
  prompt?: string;
  messages?: readonly unknown[];
  maxOutputTokens: number;
}): Promise<string> {
  const providerOptions = getLanguageModelProviderOptions();
  const base = {
    model: getLanguageModel(),
    system: options.system,
    maxOutputTokens: options.maxOutputTokens,
    ...(providerOptions ? { providerOptions } : {}),
  };
  const result = options.messages
    ? await generateText({
        ...base,
        messages: normalizeLlmMessages(options.messages),
      })
    : await generateText({
        ...base,
        prompt: options.prompt ?? '',
      });
  return result.text;
}
