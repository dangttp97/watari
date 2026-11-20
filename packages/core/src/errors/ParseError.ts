import { WatariError } from './Error';

export class ParseError extends WatariError {
  constructor(options?: { cause?: unknown }) {
    super('PARSE', 'Failed to parse response body', options);
    this.name = 'ParseError';
  }
}
