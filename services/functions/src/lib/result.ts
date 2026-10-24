import { AppError, type CommandResult } from '@taijian/domain';

export function toFailure(error: unknown, commandId: string): CommandResult {
  const serverTime = new Date().toISOString();
  if (error instanceof AppError) {
    return {
      ok: false,
      commandId,
      code: error.code,
      message: error.message,
      ...(error.details ?? {}),
      serverTime,
    };
  }
  return {
    ok: false,
    commandId,
    code: 'INTERNAL',
    message: 'Unexpected error',
    serverTime,
  };
}
