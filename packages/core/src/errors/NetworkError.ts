import { WatariError } from './Error';

export class NetworkError extends WatariError {
  constructor(options?: { cause?: unknown }) {
    super('NETWORK', 'Network request failed', options);
    this.name = 'NetworkError';
  }
}
