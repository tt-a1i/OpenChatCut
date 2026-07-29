import {
  LLM_PROVIDER_PRESETS,
  defaultModelForProvider,
  llmProviderConfigNames,
  normalizeLlmProvider,
  protocolForProvider,
  type LlmProtocol,
  type LlmProvider,
} from '../../shared/llm-providers';
import { setLlmConfig } from './client';

interface KeyStateLike {
  readonly configured: boolean;
}

export interface AgentModelChoice {
  readonly id: string;
  readonly provider: LlmProvider;
  readonly providerLabel: string;
  readonly model: string;
  readonly displayModel: string;
  readonly protocol: LlmProtocol;
}

export interface AgentModelSnapshot {
  readonly activeId: string;
  readonly choices: readonly AgentModelChoice[];
  readonly loaded: boolean;
}

const EMPTY: AgentModelSnapshot = { activeId: '', choices: [], loaded: false };
let snapshot = EMPTY;
let sessionSelectedId = '';
const listeners = new Set<() => void>();

function catalogModelProtocol(provider: LlmProvider, model: string): LlmProtocol {
  const normalized = model.toLowerCase();
  if (normalized.includes('claude')) return 'anthropic';
  if (normalized.includes('/gpt-') || normalized.startsWith('gpt-')) return 'openai';
  return protocolForProvider(provider);
}

function catalogModelName(model: string): string {
  return model.split('/').filter(Boolean).at(-1) ?? model;
}

function catalogProtocolLabel(protocol: LlmProtocol): string {
  if (protocol === 'openai') return 'OpenAI API';
  if (protocol === 'anthropic') return 'Anthropic API';
  if (protocol === 'google') return 'Gemini API';
  return 'OpenAI-compatible API';
}

function emit(next: AgentModelSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function subscribeAgentModels(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAgentModelSnapshot(): AgentModelSnapshot {
  return snapshot;
}

export function applyAgentModelStatus(
  keys: Record<string, KeyStateLike>,
  models: Record<string, string>,
  catalogs: Partial<Record<LlmProvider, readonly string[]>> = {},
): void {
  const choices = LLM_PROVIDER_PRESETS.flatMap((preset): AgentModelChoice[] => {
    const names = llmProviderConfigNames(preset.id);
    if (!keys[names.apiKey]?.configured) return [];
    const savedModel = models[names.model]?.trim() || defaultModelForProvider(preset.id);
    const discovered = catalogs[preset.id]?.filter((model) =>
      model.trim() && !/(?:seedance|gpt-image|image-generation)/i.test(model));
    const candidates = discovered?.length
      ? [savedModel, ...discovered.filter((model) => model !== savedModel)]
      : [savedModel];
    const seenModels = new Set<string>();
    const providerModels = candidates.filter((model) => {
      const name = catalogModelName(model);
      if (seenModels.has(name)) return false;
      seenModels.add(name);
      return true;
    });
    return providerModels.map((model) => {
      const protocol = catalogModelProtocol(preset.id, model);
      const nativeProtocol = protocolForProvider(preset.id);
      return {
        id: `${preset.id}:${model}`,
        provider: preset.id,
        providerLabel: protocol === nativeProtocol
          ? preset.label
          : `${catalogProtocolLabel(protocol)} · via ${preset.label}`,
        model,
        displayModel: catalogModelName(model),
        protocol,
      };
    });
  });
  const savedProvider = normalizeLlmProvider(models.LLM_PROVIDER);
  const savedNames = llmProviderConfigNames(savedProvider);
  const savedModel = models[savedNames.model]?.trim() || defaultModelForProvider(savedProvider);
  const sessionActive = choices.find((choice) => choice.id === sessionSelectedId);
  if (sessionSelectedId && !sessionActive) sessionSelectedId = '';
  const active = sessionActive
    ?? choices.find((choice) => choice.provider === savedProvider && choice.model === savedModel)
    ?? choices.find((choice) => choice.provider === savedProvider)
    ?? choices[0];
  if (active) setLlmConfig(active.provider, active.model, models.LLM_OPENAI_API_MODE, active.protocol);
  emit({ activeId: active?.id ?? '', choices, loaded: true });
}

export async function refreshAgentModelCatalogs(
  keys: Record<string, KeyStateLike>,
  models: Record<string, string>,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const catalogs: Partial<Record<LlmProvider, readonly string[]>> = {};
  await Promise.all(LLM_PROVIDER_PRESETS.map(async (preset) => {
    const names = llmProviderConfigNames(preset.id);
    if (!keys[names.apiKey]?.configured) return;
    try {
      const response = await fetcher('/api/keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: `llm/${preset.id}`, overrides: {} }),
      });
      const result = await response.json() as { ok?: boolean; models?: unknown };
      if (result.ok && Array.isArray(result.models)) {
        catalogs[preset.id] = result.models.filter((model): model is string => typeof model === 'string');
      }
    } catch {
      // Keep the saved model when discovery is unavailable.
    }
  }));
  applyAgentModelStatus(keys, models, catalogs);
}

export function selectAgentModel(id: string): void {
  const active = snapshot.choices.find((choice) => choice.id === id);
  if (!active || active.id === snapshot.activeId) return;
  sessionSelectedId = active.id;
  setLlmConfig(active.provider, active.model, undefined, active.protocol);
  emit({ ...snapshot, activeId: active.id });
}
