import type { RequestHeaders } from './types';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  (typeof v === 'object' &&
    v !== null &&
    Object.getPrototypeOf(v) === Object.prototype) ||
  Array.isArray(v);

export const encodeBody = (body: unknown, headers?: RequestHeaders) => {
  if (body === undefined) return { body: undefined, headers };

  if (isPlainObject(body)) {
    return {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...headers },
    };
  }

  return { body: body as BodyInit, headers };
};
