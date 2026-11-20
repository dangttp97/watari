import type { TransportResponse } from '../transport/types';

export const fakeResponse = (
  status: number,
  body: unknown = null
): TransportResponse => {
  const text = JSON.stringify(body);
  return {
    status,
    statusText: '',
    url: '/x',
    headers: { 'content-type': 'application/json' },
    text: async () => text,
    json: async <T>() => JSON.parse(text) as T,
    arrayBuffer: async () =>
      new TextEncoder().encode(text).buffer as ArrayBuffer,
  };
};
