import { useEffect, useState } from 'react';

import { createClient, isWatariError, type Middleware } from '@watari/core';

import type { Collection } from './Collection';

const logger: Middleware = async (req, next) => {
  const t = performance.now();
  const res = await next(req);
  console.log(
    req.method,
    req.url,
    res.status,
    `${Math.round(performance.now() - t)}ms`
  );
  return res;
};

const client = createClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  headers: {
    'x-api-key': import.meta.env.VITE_API_TOKEN,
  },
  middlewares: [logger],
  timeoutMs: 1,
});

export default function App() {
  const [collections, setCollections] = useState<Collection>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    client
      .request<Collection>({
        method: 'GET',
        url: 'collections?project_id=58725',
        signal: controller.signal,
      })
      .then(setCollections)
      .catch((e) => {
        if (isWatariError(e) && e.code !== 'ABORTED')
          setError(`${e.code}: ${e.message}`);
      });
    return () => controller.abort(); // StrictMode mount 2 lần → lần đầu bị huỷ
  }, []);

  return (
    <main>
      <h1>watari · React</h1>
      {error ? (
        <p>{error}</p>
      ) : (
        <pre>{JSON.stringify(collections, null, 2)}</pre>
      )}
    </main>
  );
}
