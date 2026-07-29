export type SeedanceProvider = 'ark' | 'custom';
export type SeedanceAuthType = 'bearer' | 'api-key';

interface SeedanceRequestTargetInput {
  provider: SeedanceProvider;
  baseUrl: string;
  apiKey: string;
  operation: 'create' | 'poll';
  taskId?: string;
  createPath?: string;
  pollPath?: string;
  authType?: SeedanceAuthType;
}

interface SeedanceRequestTarget {
  url: string;
  headers: Record<string, string>;
}

export function seedanceRequestTarget(input: SeedanceRequestTargetInput): SeedanceRequestTarget {
  const baseUrl = input.baseUrl.replace(/\/$/, '');
  const taskId = input.taskId ? encodeURIComponent(input.taskId) : undefined;
  if (input.operation === 'poll' && !taskId) throw new Error('taskId is required for Seedance polling');

  if (input.provider === 'custom') {
    const createPath = input.createPath || '/contents/generations/tasks';
    const pollPath = input.pollPath || '/contents/generations/tasks/{taskId}';
    const path = input.operation === 'create'
      ? createPath
      : pollPath.replace('{taskId}', taskId!);
    if (!path.startsWith('/')) throw new Error('custom Seedance paths must start with /');
    if (input.operation === 'poll' && !pollPath.includes('{taskId}')) {
      throw new Error('custom Seedance poll path must include {taskId}');
    }
    const authHeader: Record<string, string> = input.authType === 'api-key'
      ? { 'api-key': input.apiKey }
      : { Authorization: `Bearer ${input.apiKey}` };
    return {
      url: `${baseUrl}${path}`,
      headers: { ...authHeader, 'Content-Type': 'application/json' },
    };
  }

  return {
    url: input.operation === 'create'
      ? `${baseUrl}/contents/generations/tasks`
      : `${baseUrl}/contents/generations/tasks/${taskId}`,
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
  };
}
