/**
 * Timezone helpers for turning a client's local business hours into real
 * UTC instants. Everything the agent offers a caller is spoken in local
 * wall-clock time; everything we store is UTC.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday */
  weekday: number;
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WeekdayKey = (typeof WEEKDAYS)[number];

export function weekdayKey(weekday: number): WeekdayKey {
  return WEEKDAYS[weekday % 7] ?? "sun";
}

/** What the wall clock reads in `timezone` at a given instant. */
export function utcToZonedParts(timezone: string, at: Date): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(at)) parts[p.type] = p.value;

  const shortDay = (parts["weekday"] ?? "Sun").toLowerCase().slice(0, 3);
  return {
    year: Number(parts["year"]),
    month: Number(parts["month"]),
    day: Number(parts["day"]),
    hour: Number(parts["hour"]) % 24,
    minute: Number(parts["minute"]),
    weekday: Math.max(0, WEEKDAYS.indexOf(shortDay as WeekdayKey)),
  };
}

/** Offset of `timezone` from UTC, in minutes, at a given instant. */
function offsetMinutes(timezone: string, at: Date): number {
  const p = utcToZonedParts(timezone, at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  // Second-level precision is irrelevant for slot boundaries.
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * The inverse: a local wall clock reading in `timezone` back to a UTC
 * instant.
 *
 * Naively subtracting a fixed offset is wrong across DST, so this guesses,
 * measures the offset that actually applies at the guessed instant, and
 * corrects. A second pass settles the case where the first guess landed on
 * the far side of a transition. Ambiguous local times inside a fall-back
 * hour resolve to the first occurrence, which is the conventional choice
 * and harmless for appointment slots.
 */
export function zonedPartsToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(target - offsetMinutes(timezone, new Date(target)) * 60000);
  for (let i = 0; i < 2; i++) {
    const corrected = target - offsetMinutes(timezone, guess) * 60000;
    if (corrected === guess.getTime()) break;
    guess = new Date(corrected);
  }
  return guess;
}

/** "14:30" → 870. Returns null for anything malformed. */
export function parseHhMm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Spoken form, for what the agent reads back to a caller. */
export function speakSlot(timezone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
}
