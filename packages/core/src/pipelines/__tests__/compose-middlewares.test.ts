import { describe, expect, jest, test } from '@jest/globals';

import { fakeResponse } from '../../__fixtures__/fake-response';
import type { Transport, TransportRequest } from '../../transport/types';
import { compose } from '../compose-middlewares';
import type { Middleware } from '../types';

const request: TransportRequest = { method: 'GET', url: '/x' };

describe('compose', () => {
  test('onion-like request running path', async () => {
    const log: string[] = [];
    const mw =
      (name: string): Middleware =>
      async (req, next) => {
        log.push(`${name}:in`);
        const res = await next(req);
        log.push(`${name}:out`);
        return res;
      };
    const transport: Transport = async () => {
      log.push('transport');
      return fakeResponse(200);
    };

    await compose([mw('a'), mw('b')], transport)(request);
    expect(log).toEqual(['a:in', 'b:in', 'transport', 'b:out', 'a:out']);
  });

  test('skips the transport when a middleware responds without calling next', async () => {
    const transport = jest.fn<Transport>();
    const mock: Middleware = async () => fakeResponse(200, { mocked: true });

    const res = await compose([mock], transport)(request);
    await expect(res.json()).resolves.toEqual({ mocked: true });
    expect(transport).not.toHaveBeenCalled();
  });

  test('runs the transport twice when a middleware calls next twice', async () => {
    const transport = jest.fn<Transport>(async () => fakeResponse(200));
    const twice: Middleware = async (req, next) => {
      await next(req);
      return next(req);
    };

    await compose([twice], transport)(request);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  test('propagates a transport error through every middleware', async () => {
    const error = new Error('network down');
    const log: string[] = [];
    const mw =
      (name: string): Middleware =>
      async (req, next) => {
        try {
          return await next(req);
        } catch (e) {
          log.push(name);
          throw e;
        }
      };
    const transport: Transport = async () => {
      throw error;
    };

    await expect(compose([mw('a'), mw('b')], transport)(request)).rejects.toBe(
      error
    );
    expect(log).toEqual(['b', 'a']);
  });
});
