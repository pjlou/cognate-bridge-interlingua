/** Human-readable delay until a future review time (e.g. "2 hours from now"). */
export function formatDelayUntil(at: Date | string, now: Date = new Date()): string {
  const target = typeof at === 'string' ? new Date(at) : at;
  const ms = Math.max(0, target.getTime() - now.getTime());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (ms < hour) {
    const minutes = Math.max(1, Math.round(ms / minute));
    return minutes === 1 ? '1 minute from now' : `${minutes} minutes from now`;
  }
  if (ms < day) {
    const hours = Math.max(1, Math.round(ms / hour));
    return hours === 1 ? '1 hour from now' : `${hours} hours from now`;
  }
  const days = Math.max(1, Math.round(ms / day));
  return days === 1 ? '1 day from now' : `${days} days from now`;
}
