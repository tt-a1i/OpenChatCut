import assert from 'node:assert/strict';
import { seedanceRequestTarget } from './seedance-provider.ts';

const arkCreate = seedanceRequestTarget({
  provider: 'ark',
  baseUrl: 'https://ark.example/api/v3/',
  apiKey: 'ark-secret',
  operation: 'create',
});
assert.equal(arkCreate.url, 'https://ark.example/api/v3/contents/generations/tasks');
assert.deepEqual(arkCreate.headers, {
  Authorization: 'Bearer ark-secret',
  'Content-Type': 'application/json',
});

const arkPoll = seedanceRequestTarget({
  provider: 'ark',
  baseUrl: 'https://ark.example/api/v3',
  apiKey: 'ark-secret',
  operation: 'poll',
  taskId: 'task/with spaces',
});
assert.equal(arkPoll.url, 'https://ark.example/api/v3/contents/generations/tasks/task%2Fwith%20spaces');

const customCreate = seedanceRequestTarget({
  provider: 'custom',
  baseUrl: 'https://gateway.example/api/',
  apiKey: 'custom-secret',
  operation: 'create',
  authType: 'api-key',
  createPath: '/v2/video/tasks',
  pollPath: '/v2/tasks/{taskId}',
});
assert.equal(customCreate.url, 'https://gateway.example/api/v2/video/tasks');
assert.deepEqual(customCreate.headers, {
  'api-key': 'custom-secret',
  'Content-Type': 'application/json',
});
assert.equal('Authorization' in customCreate.headers, false);

const customPoll = seedanceRequestTarget({
  provider: 'custom',
  baseUrl: 'https://gateway.example/api',
  apiKey: 'custom-secret',
  operation: 'poll',
  taskId: 'cgt-123',
  authType: 'api-key',
  createPath: '/v2/video/tasks',
  pollPath: '/v2/tasks/{taskId}',
});
assert.equal(customPoll.url, 'https://gateway.example/api/v2/tasks/cgt-123');

assert.throws(
  () => seedanceRequestTarget({
    provider: 'custom',
    baseUrl: 'https://gateway.example/api',
    apiKey: 'secret',
    operation: 'poll',
    pollPath: '/v2/tasks/{taskId}',
  }),
  /taskId is required/,
);

assert.throws(
  () => seedanceRequestTarget({
    provider: 'custom',
    baseUrl: 'https://gateway.example/api',
    apiKey: 'secret',
    operation: 'poll',
    taskId: 'task-1',
    pollPath: '/v2/tasks/task-1',
  }),
  /must include \{taskId\}/,
);

console.log('seedance provider request targets verified');
