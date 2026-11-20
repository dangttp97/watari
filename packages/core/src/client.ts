import { compose } from './pipelines/compose-middlewares';
import type { Middleware } from './pipelines/types';
import { handleResponse } from './response/handle-response';
import type { ResponseFormat } from './response/types';
import { fetchTransport } from './transport/fetch';
import type {
  RequestHeaders,
  Transport,
  TransportRequest,
} from './transport/types';

const DEFAULT_TIMEOUT = 60_000;

type ClientConfig = {
  baseUrl?: string;
  headers?: RequestHeaders;
  timeoutMs?: number;
  middlewares?: Middleware[];
  transport?: Transport;
};
export type RequestOptions = Omit<TransportRequest, 'baseUrl'> & {
  responseType?: ResponseFormat;
};
export type Client = {
  request: <T = unknown>(options: RequestOptions) => Promise<T>;
};

export const createClient = (config: ClientConfig = {}): Client => {
  const run = compose(
    config.middlewares ?? [],
    config.transport ?? fetchTransport()
  );

  return {
    request: async <T>({ responseType, ...req }: RequestOptions) => {
      const res = await run({
        ...req,
        baseUrl: config.baseUrl,
        headers: { ...config.headers, ...req.headers },
        timeoutMs: req.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT,
      });
      return handleResponse<T>(res, responseType);
    },
  };
};
