import type { Tag } from '../cache/types';
import type { RequestOptions } from '../client';

export type MutationOptions = RequestOptions & {
  invalidates?: readonly Tag[];
};
