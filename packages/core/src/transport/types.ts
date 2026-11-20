// ====== Primitive type ======
type QueryValue = string | number | boolean | null | undefined;

export type HttpMethod =
  'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type RequestHeaders = Record<string, string>;
export type QueryParams = Record<string, QueryValue | readonly QueryValue[]>;
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type RequestBody =
  JsonValue | FormData | Blob | ArrayBuffer | URLSearchParams;

// ====== Transport involve section ======
export type TransportRequest = {
  method: HttpMethod;
  url: string;
  baseUrl?: string;
  query?: QueryParams;
  headers?: RequestHeaders;
  body?: RequestBody;
  signal?: AbortSignal;
  timeoutMs?: number;
};
export type TransportResponse = {
  status: number;
  statusText: string;
  url: string;
  headers: RequestHeaders;
  text: () => Promise<string>;
  json: <T = unknown>() => Promise<T>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

// ====== Abort signal section ======
export type AbortReason = 'timeout' | 'user-aborted' | undefined;
export type RequestSignal = {
  signal: AbortSignal;
  reason: (() => AbortReason) | AbortReason;
  cleanupFn: () => void;
};
