import assert from 'node:assert/strict';
import * as modelSelection from './model-selection.ts';
import {
  applyAgentModelStatus,
  getAgentModelSnapshot,
  selectAgentModel,
} from './model-selection.ts';
import { getLanguageModel } from './client.ts';

const keys = {
  LLM_ANTHROPIC_API_KEY: { configured: true },
};
const models = {
  LLM_PROVIDER: 'anthropic',
  LLM_ANTHROPIC_MODEL: 'bedrock-claude-sonnet-5/claude-sonnet-5',
};

applyAgentModelStatus(keys, models, {
  anthropic: [
    'bedrock-claude-sonnet-5/claude-sonnet-5',
    'bedrock-claude-opus-4-8/claude-opus-4-8',
    'vertex-claude-opus-4-8/claude-opus-4-8',
    'azure-gpt-56-terra-1-eus2/gpt-5.6-terra',
    'bodun-doubao-seedance2-0/doubao-seedance2.0',
  ],
});

assert.deepEqual(
  getAgentModelSnapshot().choices.map(({ model }) => model),
  [
    'bedrock-claude-sonnet-5/claude-sonnet-5',
    'bedrock-claude-opus-4-8/claude-opus-4-8',
    'azure-gpt-56-terra-1-eus2/gpt-5.6-terra',
  ],
  'one configured connection exposes every chat-capable model in its catalog',
);

assert.deepEqual(
  getAgentModelSnapshot().choices.map((choice) => ({ model: choice.model, protocol: choice.protocol })),
  [
    { model: 'bedrock-claude-sonnet-5/claude-sonnet-5', protocol: 'anthropic' },
    { model: 'bedrock-claude-opus-4-8/claude-opus-4-8', protocol: 'anthropic' },
    { model: 'azure-gpt-56-terra-1-eus2/gpt-5.6-terra', protocol: 'openai' },
  ],
  'catalog models retain the connection but select their own wire protocol',
);

assert.deepEqual(
  getAgentModelSnapshot().choices.map((choice) => choice.displayModel),
  ['claude-sonnet-5', 'claude-opus-4-8', 'gpt-5.6-terra'],
  'duplicate deployment routes collapse to one friendly model entry',
);
assert.equal(
  getAgentModelSnapshot().choices.find((choice) => choice.protocol === 'openai')?.providerLabel,
  'OpenAI API · via Anthropic · Claude',
  'cross-protocol catalog models identify both protocol and connection',
);

const gpt = getAgentModelSnapshot().choices.find((choice) => choice.protocol === 'openai');
assert.ok(gpt, 'GPT catalog model is selectable');
selectAgentModel(gpt.id);
assert.equal(getLanguageModel().provider, 'openai.responses', 'selected catalog model controls the AI SDK wire protocol');

assert.equal(typeof (modelSelection as Record<string, unknown>).refreshAgentModelCatalogs, 'function', 'catalog refresh API exists');
const requestedPages: string[] = [];
await (modelSelection as unknown as {
  refreshAgentModelCatalogs: (
    keyState: typeof keys,
    modelState: typeof models,
    fetcher: typeof fetch,
  ) => Promise<void>;
}).refreshAgentModelCatalogs(keys, models, async (_input, init) => {
  const body = JSON.parse(String(init?.body)) as { page: string };
  requestedPages.push(body.page);
  return new Response(JSON.stringify({
    ok: true,
    models: [
      'bedrock-claude-sonnet-5/claude-sonnet-5',
      'bedrock-claude-opus-4-8/claude-opus-4-8',
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
});
assert.deepEqual(requestedPages, ['llm/anthropic'], 'only configured connections are discovered');
assert.equal(getAgentModelSnapshot().choices.length, 2, 'discovered catalog is applied to the composer snapshot');

applyAgentModelStatus(keys, models, {
  anthropic: [
    'azure-gpt-55-1-sc/gpt-5.5',
    'bedrock-claude-sonnet-5/claude-sonnet-5',
  ],
});
assert.equal(
  getAgentModelSnapshot().choices.find((choice) => choice.id === getAgentModelSnapshot().activeId)?.model,
  'bedrock-claude-sonnet-5/claude-sonnet-5',
  'the saved model remains active when the discovered catalog has a different sort order',
);

const refreshedGpt = getAgentModelSnapshot().choices.find((choice) => choice.protocol === 'openai');
assert.ok(refreshedGpt);
selectAgentModel(refreshedGpt.id);
applyAgentModelStatus(keys, models, {
  anthropic: [
    'azure-gpt-55-1-sc/gpt-5.5',
    'bedrock-claude-sonnet-5/claude-sonnet-5',
  ],
});
assert.equal(
  getAgentModelSnapshot().activeId,
  refreshedGpt.id,
  'a background catalog refresh preserves the current session model',
);
applyAgentModelStatus(keys, {
  ...models,
  LLM_ANTHROPIC_MODEL: 'bedrock-claude-opus-4-8/claude-opus-4-8',
}, {
  anthropic: [
    'azure-gpt-55-1-sc/gpt-5.5',
    'bedrock-claude-opus-4-8/claude-opus-4-8',
  ],
});
assert.equal(
  getAgentModelSnapshot().activeId,
  refreshedGpt.id,
  'the current conversation model wins over later saved-setting refreshes',
);

const originalFetch = globalThis.fetch;
let selectionWrites = 0;
globalThis.fetch = async () => {
  selectionWrites += 1;
  return new Response('{}', { status: 200 });
};
const opusChoice = getAgentModelSnapshot().choices.find((choice) => choice.displayModel === 'claude-opus-4-8');
assert.ok(opusChoice);
selectAgentModel(opusChoice.id);
await Promise.resolve();
globalThis.fetch = originalFetch;
assert.equal(selectionWrites, 0, 'conversation model selection does not rewrite persistent provider settings');

console.log('model-selection.verify: ok');
