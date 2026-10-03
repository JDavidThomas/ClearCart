type FetchFunction = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== 'undefined' && input instanceof Request;
}

function isRestRequest(input: RequestInfo | URL) {
  try {
    return new URL(requestUrl(input)).pathname.includes('/rest/v1/');
  } catch {
    return false;
  }
}

async function isFutureIssuedJwtResponse(response: Response) {
  if (response.status < 400) return false;
  try {
    const payload: unknown = await response.clone().json();
    if (!payload || typeof payload !== 'object') return false;
    const details = payload as { code?: unknown; message?: unknown };
    return (
      details.code === 'PGRST303' &&
      typeof details.message === 'string' &&
      details.message.toLowerCase().includes('jwt issued at future')
    );
  } catch {
    return false;
  }
}

function mergeRetryHeaders(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const headers = new Headers(isRequest(input) ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

export function createSupabaseJwtRecoveryFetch(
  refreshAccessToken: () => Promise<string | null>,
  fetchImpl: FetchFunction = globalThis.fetch.bind(globalThis),
): FetchFunction {
  return async (input, init) => {
    const replayableInput = isRequest(input) ? input.clone() : input;
    const response = await fetchImpl(input, init);

    if (
      !isRestRequest(input) ||
      !(
        await isFutureIssuedJwtResponse(response)
      )
    ) {
      return response;
    }

    console.warn(
      '[Supabase] JWT issued at future; refreshing the session and retrying the request once.',
    );

    let accessToken: string | null;
    try {
      accessToken = await refreshAccessToken();
    } catch (error) {
      console.warn('[Supabase] JWT recovery refresh failed.', error);
      return response;
    }
    if (!accessToken) return response;

    const headers = mergeRetryHeaders(replayableInput, init);
    headers.set('authorization', `Bearer ${accessToken}`);

    if (isRequest(replayableInput)) {
      return fetchImpl(
        new Request(replayableInput, { ...init, headers }),
      );
    }
    return fetchImpl(replayableInput, { ...init, headers });
  };
}