/**
 * Quiet hours are stored as local clock hours on the client, so they have
 * to be evaluated in that client's timezone, not the server's.
 */
export function localHour(timezone: string, at: Date): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(at);
  return Number(formatted) % 24;
}

/** Window wraps midnight when start > end (e.g. 21 → 8). */
export function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function inQuietHours(
  timezone: string,
  start: number,
  end: number,
  at: Date = new Date(),
): boolean {
  return isQuietHour(localHour(timezone, at), start, end);
}

/**
 * First instant at or after `at` that falls outside quiet hours.
 *
 * Steps forward in 30-minute increments rather than doing calendar math,
 * which keeps it correct across DST transitions without special-casing
 * them. Capped at 48 hours so a misconfigured window cannot loop.
 */
export function nextAllowedSendTime(
  timezone: string,
  start: number,
  end: number,
  at: Date = new Date(),
): Date {
  if (!inQuietHours(timezone, start, end, at)) return at;
  const step = 30 * 60 * 1000;
  for (let i = 1; i <= 96; i++) {
    const candidate = new Date(at.getTime() + i * step);
    if (!inQuietHours(timezone, start, end, candidate)) return candidate;
  }
  // Unreachable for any valid window; fail forward rather than never send.
  return new Date(at.getTime() + 48 * 60 * 60 * 1000);
}
