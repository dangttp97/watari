import { WatariError } from './Error';

export class TimeoutError extends WatariError {
  constructor(
    readonly timeoutMs: number,
    options?: { cause?: unknown }
  ) {
    super('TIMEOUT', `Request timed out after ${timeoutMs}ms`, options);
    this.name = 'TimeoutError';
  }
}
