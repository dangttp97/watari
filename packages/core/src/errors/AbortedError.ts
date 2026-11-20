import { WatariError } from './Error';

export class AbortedError extends WatariError {
  constructor(options?: { cause?: unknown }) {
    super('ABORTED', 'Request was aborted', options);
    this.name = 'AbortedError';
  }
}
