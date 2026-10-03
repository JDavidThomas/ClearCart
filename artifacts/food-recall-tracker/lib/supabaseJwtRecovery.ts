type FetchFunction = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type RefreshReason = 'before-request' | 'jwt-future';

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestPath(input: RequestInfo | URL) {
  try {
    return new URL(requestUrl(input)).pathname;
  } catch {
    return null;
  }
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== 'undefined' && input instanceof Request;
}

function isRestRequest(input: RequestInfo | URL) {
  return requestPath(input)?.includes('/rest/v1/') ?? false;
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

function mergeRequestHeaders(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const headers = new Headers(isRequest(input) ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

function withRequestHeaders(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  headers: Headers,
) {
  if (isRequest(input)) {
    return {
      input: new Request(input, { ...init, headers }),
      init: undefined,
    };
  }
  return {
    input,
    init: { ...init, headers },
  };
}

export function createSupabaseJwtRecoveryFetch(
  refreshAccessToken: (reason: RefreshReason) => Promise<string | null>,
  fetchImpl: FetchFunction = globalThis.fetch.bind(globalThis),
): FetchFunction {
  return async (input, init) => {
    const replayableInput = isRequest(input) ? input.clone() : input;
    let requestInput = input;
    let requestInit = init;
    let preRequestRefreshStatus = 'not-a-rest-request';

    if (isRestRequest(input)) {
      const headers = mergeRequestHeaders(input, init);
      const authorizationHeaderPresent = headers.has('authorization');
      preRequestRefreshStatus = authorizationHeaderPresent
        ? 'pending'
        : 'skipped-no-authorization-header';

      if (authorizationHeaderPresent) {
        try {
          const accessToken = await refreshAccessToken('before-request');
          if (accessToken) {
            headers.set('authorization', `Bearer ${accessToken}`);
            preRequestRefreshStatus = 'refreshed';
            const request = withRequestHeaders(input, init, headers);
            requestInput = request.input;
            requestInit = request.init;
          } else {
            preRequestRefreshStatus = 'no-fresh-session-token';
            console.warn(
              '[Supabase] Pre-request refresh returned no session token; sending with the existing authorization header.',
            );
          }
        } catch (error) {
          preRequestRefreshStatus = 'failed';
          console.warn(
            '[Supabase] Pre-request session refresh failed; sending with the existing authorization header.',
            error instanceof Error ? error.name : typeof error,
          );
        }
      }

      console.info('[Supabase] REST request authentication before fetch', {
        path: requestPath(input),
        authorizationHeaderPresent,
        authorizationHeader: authorizationHeaderPresent
          ? 'Bearer [REDACTED]'
          : null,
        preRequestRefreshStatus,
      });
    }

    const response = await fetchImpl(requestInput, requestInit);

    if (
      !isRestRequest(input) ||
      !(
        await isFutureIssuedJwtResponse(response)
      )
    ) {
      return response;
    }

    console.warn(
      '[Supabase] REST request was rejected because the JWT was issued in the future; attempting one recovery refresh.',
      {
        path: requestPath(input),
        preRequestRefreshStatus,
      },
    );

    let accessToken: string | null;
    try {
      accessToken = await refreshAccessToken('jwt-future');
    } catch (error) {
      console.warn(
        '[Supabase] JWT recovery refresh failed; returning the original response.',
        error instanceof Error ? error.name : typeof error,
      );
      return response;
    }
    if (!accessToken) {
      console.warn(
        '[Supabase] JWT recovery refresh returned no token; returning the original response.',
        { path: requestPath(input) },
      );
      return response;
    }

    const headers = mergeRequestHeaders(replayableInput, init);
    headers.set('authorization', `Bearer ${accessToken}`);
    const retry = withRequestHeaders(replayableInput, init, headers);
    const retryResponse = await fetchImpl(retry.input, retry.init);
    if (await isFutureIssuedJwtResponse(retryResponse)) {
      console.warn(
        '[Supabase] JWT was still rejected after a refreshed retry; returning the retry response.',
        { path: requestPath(input) },
      );
    }
    return retryResponse;
  };
}