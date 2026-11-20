import { WatariError } from './Error';

export class HttpError<TBody = unknown> extends WatariError {
  constructor(
    readonly status: number,
    readonly body: TBody,
    readonly headers: Record<string, string>
  ) {
    super('HTTP', `Request failed with status ${status}`);
    this.name = 'HttpError';
  }
}
