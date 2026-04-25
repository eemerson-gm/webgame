import { AxiosError } from "axios";

type RetryOptions = {
  maxRetries: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
};

const defaultOptions: RetryOptions = {
  maxRetries: 2,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10_000,
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isRetryable = (err: unknown): boolean => {
  if (!(err instanceof AxiosError)) {
    return err instanceof TypeError;
  }
  const status = err.response?.status;
  if (status === undefined) {
    return true;
  }
  if (status === 429) {
    return true;
  }
  if (status >= 500) {
    return true;
  }
  return false;
};

export const withRetry = async <T>(fn: () => Promise<T>, options: Partial<RetryOptions> = {}): Promise<T> => {
  const merged: RetryOptions = { ...defaultOptions, ...options };
  let attempt = 0;
  let delay = merged.initialDelayMs;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= merged.maxRetries || !isRetryable(err)) {
        throw err;
      }
      await sleep(Math.min(delay, merged.maxDelayMs));
      attempt += 1;
      delay *= merged.backoffMultiplier;
    }
  }
};
