export const FDA_DNS_RETRY_DELAY_MS = 2_000;

interface OpenFdaFetchOptions {
  fetchImpl?: typeof fetch;
  delay?: (milliseconds: number) => Promise<void>;
  onDnsRetry?: (error: unknown) => void;
  timeoutMs?: number;
}

export class FdaDnsResolutionError extends Error {
  constructor(cause?: unknown) {
    super('FDA API DNS lookup failed after one retry. Check your connection and tap Try again.', {
      cause,
    });
    this.name = 'FdaDnsResolutionError';
  }
}

export class FdaNetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'FdaNetworkError';
  }
}

export function isDnsResolutionError(error: unknown) {
  const messages: string[] = [];
  const pending: unknown[] = [error];
  const visited = new Set<object>();

  while (pending.length > 0 && visited.size < 8) {
    const current = pending.pop();
    if (typeof current === 'string') {
      messages.push(current);
      continue;
    }
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);

    const record = current as {
      message?: unknown;
      cause?: unknown;
      nativeError?: unknown;
      error?: unknown;
    };
    if (typeof record.message === 'string') messages.push(record.message);
    pending.push(record.cause, record.nativeError, record.error);
  }

  return /unknownhostexception|unable to resolve host|enotfound|eai_again|name or service not known|temporary failure in name resolution/i.test(
    messages.join(' '),
  );
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeNetworkError(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') {
    return new FdaNetworkError('FDA API request timed out. Check your connection and tap Try again.', error);
  }
  return new FdaNetworkError(
    'FDA API is unreachable right now. Check your connection and tap Try again.',
    error,
  );
}

export async function fetchOpenFdaWithDnsRetry(
  url: string,
  options: OpenFdaFetchOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const delay = options.delay ?? wait;
  const timeoutMs = options.timeoutMs ?? 15_000;

  const fetchOnce = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    return await fetchOnce();
  } catch (firstError) {
    if (!isDnsResolutionError(firstError)) {
      throw normalizeNetworkError(firstError);
    }

    options.onDnsRetry?.(firstError);
    await delay(FDA_DNS_RETRY_DELAY_MS);

    try {
      return await fetchOnce();
    } catch (retryError) {
      if (isDnsResolutionError(retryError)) {
        throw new FdaDnsResolutionError(retryError);
      }
      throw normalizeNetworkError(retryError);
    }
  }
}