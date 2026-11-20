import { describe, expect, test } from '@jest/globals';

import { fakeResponse } from '../../__fixtures__/fake-response';
import { HttpError } from '../../errors/HttpError';
import { ParseError } from '../../errors/ParseError';
import { handleResponse } from '../handle-response';

describe('handleResponse', () => {
  test('returns the parsed JSON body on a 200 response', async () => {
    const response = fakeResponse(200, {
      status: 'Ran smoothly',
    });

    await expect(handleResponse(response)).resolves.toEqual({
      status: 'Ran smoothly',
    });
  });

  test('returns undefined on a 204 response', async () => {
    await expect(handleResponse(fakeResponse(204))).resolves.toBeUndefined();
  });

  test('returns undefined when the body is empty', async () => {
    const response = { ...fakeResponse(200), text: async () => '' };
    await expect(handleResponse(response)).resolves.toBeUndefined();
  });

  test('throws ParseError when the body is malformed JSON', async () => {
    const response = { ...fakeResponse(200), text: async () => '{broken' };
    await expect(handleResponse(response)).rejects.toBeInstanceOf(ParseError);
  });

  test('throws HttpError with status and body on a 404 response', async () => {
    const response = fakeResponse(404, { message: 'Not found' });
    const error = await handleResponse(response).catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      status: 404,
      body: { message: 'Not found' },
    });
  });

  test('still throws HttpError on a 500 response when the body cannot be read', async () => {
    const response = {
      ...fakeResponse(500),
      text: async () => {
        throw new Error('stream failed');
      },
    };
    const error = await handleResponse(response).catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 500, body: undefined });
  });
});
