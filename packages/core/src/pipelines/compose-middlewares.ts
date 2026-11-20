import type { Transport } from '../transport/types';
import type { Middleware } from './types';

export const compose = (
  middlewares: readonly Middleware[],
  transport: Transport
): Transport => {
  return middlewares.reduceRight<Transport>(
    (nextFn, middleware) => (request) => middleware(request, nextFn),
    transport
  );
};
