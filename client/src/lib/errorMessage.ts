/**
 * The API reports failures as `{ error: string }`. Axios buries that two levels down and
 * replaces it with a generic "Request failed with status code 401" on `error.message`,
 * which is not something to show a user.
 *
 * The shape is checked structurally rather than with `instanceof AxiosError`. That check
 * depends on the rejected error carrying the same class identity the caller imported, and
 * it silently stops holding whenever a bundler or a test runner resolves two copies of
 * axios -- at which point every API error message degrades to the fallback and nothing
 * fails loudly enough to notice.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function errorMessage(caught: unknown, fallback: string): string {
  const error = asRecord(caught);
  if (!error) return fallback;

  const response = asRecord(error.response);
  if (response) {
    const apiError = asRecord(response.data)?.error;
    if (typeof apiError === 'string' && apiError) return apiError;
    return fallback;
  }

  // A request that was sent but got no response: the server is down or unreachable. An
  // error with neither a response nor a request never left the client, and its message
  // would be a programming detail.
  if ('request' in error) return 'Could not reach the server. Is the API running?';

  return fallback;
}
