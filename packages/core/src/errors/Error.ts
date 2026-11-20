export type WatariErrorCode =
  'HTTP' | 'TIMEOUT' | 'ABORTED' | 'NETWORK' | 'PARSE';

export class WatariError extends Error {
  readonly code: WatariErrorCode;

  constructor(
    code: WatariErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'WatariError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const isWatariError = (e: unknown): e is WatariError =>
  e instanceof WatariError ||
  (e instanceof Error && typeof (e as { code?: unknown }).code === 'string');
