export const joinUrl = (baseUrl: string | undefined, path: string) => {
  if (!baseUrl || /^https?:\/\//i.test(path)) return path;

  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
};

export const appendQuery = (url: string, query?: Record<string, unknown>) => {
  if (!query) return url;

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;

    for (const v of Array.isArray(value) ? value : [value])
      searchParams.append(key, String(v));
  }

  const queryString = searchParams.toString();
  var queryUrl = `${url}`;

  if (url.includes('?')) {
    queryUrl += '&';
  } else {
    queryUrl += '?';
  }

  queryUrl += queryString;

  return queryString ? queryUrl : url;
};
