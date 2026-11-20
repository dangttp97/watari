import { HttpError } from '../errors/HttpError';
import { ParseError } from '../errors/ParseError';
import type { TransportResponse } from '../transport/types';
import type { ResponseFormat } from './types';

const readBodySafely = async (res: TransportResponse) => {
  try {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : undefined;
    } catch {
      return text;
    }
  } catch {
    return undefined;
  }
};

export const handleResponse = async <T>(
  res: TransportResponse,
  responseType: ResponseFormat | 'raw' = 'json'
) => {
  if (res.status < 200 || res.status >= 300) {
    throw new HttpError(res.status, await readBodySafely(res), res.headers);
  }
  if (responseType === 'raw') return res as T;
  if (res.status === 204 || res.status === 205) return undefined as T;

  const text = await res.text();
  if (responseType === 'text') return text as T;
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new ParseError({ cause: e });
  }
};
