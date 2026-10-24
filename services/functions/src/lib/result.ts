import { AppError, type CommandResult } from '@taijian/domain';

export function toFailure(error: unknown, commandId: string): CommandResult {
  const serverTime = new Date().toISOString();
  if (error instanceof AppError) {
    return {
      // Details go first so they can never override the envelope contract.
      ...(error.details ?? {}),
      ok: false,
      commandId,
      code: error.code,
      message: error.message,
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
