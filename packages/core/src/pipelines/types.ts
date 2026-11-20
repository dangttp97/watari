import type {
  Transport,
  TransportRequest,
  TransportResponse,
} from '../transport/types';

export type NextFn = Transport;

export type Middleware = (
  request: TransportRequest,
  nextFn: NextFn
) => Promise<TransportResponse>;
