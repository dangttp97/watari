import { describe, expect, jest, test } from '@jest/globals';

import { fakeResponse } from '../../__fixtures__/fake-response';
import { AbortedError } from '../../errors/AbortedError';
import type { Transport } from '../../transport/types';
import { compose } from '../compose-middlewares';
import { retry } from '../retry';

// No backoff wait, so tests run instantly.
const noDelay = () => 0;

describe('retry', () => {
  test('retries 503 twice, then returns the 200 response', async () => {
    const transport = jest
      .fn<Transport>()
      .mockResolvedValueOnce(fakeResponse(503))
      .mockResolvedValueOnce(fakeResponse(503))
      .mockResolvedValueOnce(fakeResponse(200));

    const res = await compose(
      [retry({ delay: noDelay })],
      transport
    )({
      method: 'GET',
      url: '/x',
    });

    expect(transport).toHaveBeenCalledTimes(3);
    expect(res.status).toBe(200);
  });

  test('does not retry a 404', async () => {
    const transport = jest.fn<Transport>(async () => fakeResponse(404));

    const res = await compose(
      [retry({ delay: noDelay })],
      transport
    )({
      method: 'GET',
      url: '/x',
    });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
  });

  test('does not retry a POST', async () => {
    const transport = jest.fn<Transport>(async () => fakeResponse(503));

    await compose(
      [retry({ delay: noDelay })],
      transport
    )({
      method: 'POST',
      url: '/x',
    });

    expect(transport).toHaveBeenCalledTimes(1);
  });

  test('throws AbortedError when aborted during the backoff wait', async () => {
    const controller = new AbortController();
    const transport = jest.fn<Transport>(async () => fakeResponse(503));
    // Long backoff; abort shortly after the wait starts.
    const delay = () => {
      setTimeout(() => controller.abort(), 10);
      return 60_000;
    };

    await expect(
      compose(
        [retry({ delay })],
        transport
      )({
        method: 'GET',
        url: '/x',
        signal: controller.signal,
      })
    ).rejects.toBeInstanceOf(AbortedError);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
