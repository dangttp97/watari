import { jest } from '@jest/globals';

import type { Transport } from '../transport/types';
import { fakeResponse } from './fake-response';

export const createBackend = () => {
  let todos = ['a'];
  let status = 200;
  const transport = jest.fn<Transport>(async () =>
    fakeResponse(status, status === 200 ? todos : { message: 'boom' })
  );
  return {
    transport,
    setTodos: (next: string[]) => (todos = next),
    failWith: (next: number) => (status = next),
  };
};
