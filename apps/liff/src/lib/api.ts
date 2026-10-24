import { httpsCallable } from 'firebase/functions';
import { newCommandId, type CommandEnvelope, type CommandResult } from '@taijian/domain';
import { functions } from './firebase';

const execute = httpsCallable<CommandEnvelope, CommandResult>(functions, 'executeCommand');

export async function callCommand<T = unknown>(
  type: string,
  payload: unknown,
  options: { householdId?: string; baseRevision?: number } = {},
): Promise<CommandResult<T>> {
  const envelope: CommandEnvelope = {
    commandId: newCommandId(),
    type,
    ...(options.householdId ? { householdId: options.householdId } : {}),
    ...(options.baseRevision !== undefined ? { baseRevision: options.baseRevision } : {}),
    payload,
    client: { platform: 'liff', appVersion: '1.0.0' },
  };
  const response = await execute(envelope);
  return response.data as CommandResult<T>;
}

export async function callLogin(idToken: string): Promise<{ token: string; uid: string }> {
  const login = httpsCallable<{ idToken: string }, { token: string; uid: string }>(
    functions,
    'lineLogin',
  );
  const response = await login({ idToken });
  return response.data;
}
