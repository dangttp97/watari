declare const __DEV__: boolean | undefined;

type ProcessLike = { process?: { env?: Record<string, string | undefined> } };

/** True in development builds: React Native's __DEV__, otherwise NODE_ENV !== 'production'. */
export const isDev = (): boolean => {
  if (typeof __DEV__ !== 'undefined') return __DEV__;
  const nodeEnv = (globalThis as ProcessLike).process?.env?.NODE_ENV;
  return nodeEnv !== undefined && nodeEnv !== 'production';
};
