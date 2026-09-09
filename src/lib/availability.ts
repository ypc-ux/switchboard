import { db } from "./supabase";
import { zonedPartsToUtc, utcToZonedParts, parseHhMm, ZonedParts } from "./time";
import type { Hours, BookingRules } from "./knowledge";

export interface Slot {
  start: Date;
  end: Date;
  /** Human-readable e.g. "Tuesday, September 9, 4:00 PM" */
  label: string;
}

/**
 * Generate available appointment slots for a client.
 *
 * Respects business hours, lead time, buffer between appointments,
 * max days out, and max per day. Excludes slots that collide with
 * existing bookings.
 */
export async function availableSlots(
  clientId: string,
  timezone: string,
  hours: Hours,
  rules: BookingRules,
  serviceDurationMinutes: number,
): Promise<Slot[]> {
  // Load existing bookings to exclude
  const { data: bookings, error: bookingError } = await db()
    .from("bookings")
    .select("starts_at, ends_at")
    .eq("client_id", clientId)
    .gte("ends_at", new Date().toISOString());

  if (bookingError) throw new Error(`booking load failed: ${bookingError.message}`);

  const bookedRanges = (bookings as Array<{ starts_at: string; ends_at: string }> | null)?.map(
    (b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) }),
  ) ?? [];

  const leadTimeMinutes = rules.lead_time_minutes ?? 0;
  const bufferMinutes = rules.buffer_minutes ?? 0;
  const maxDaysOut = rules.max_days_out ?? 90;
  const maxPerDay = rules.max_per_day ?? 10;
  const slotMinutes = serviceDurationMinutes;

  const now = new Date();
  const earliestStart = new Date(now.getTime() + leadTimeMinutes * 60000);
  const latestDay = new Date(now.getTime() + maxDaysOut * 24 * 60 * 60000);

  const slots: Slot[] = [];
  const slotsPerDay: Record<string, number> = {};

  let current = new Date(earliestStart);
  current.setUTCHours(0, 0, 0, 0);

  while (current <= latestDay) {
    const dayKey = current.toISOString().split("T")[0];
    const dayParts = utcToZonedParts(timezone, current);
    const weekdayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dayParts.weekday];

    const dayHours = weekdayKey ? hours[weekdayKey] : undefined;
    if (!dayHours || dayHours.length === 0) {
      // Closed this day
      current = new Date(current.getTime() + 24 * 60 * 60000);
      continue;
    }

    for (const [openStr, closeStr] of dayHours) {
      const openMinutes = parseHhMm(openStr);
      const closeMinutes = parseHhMm(closeStr);
      if (openMinutes === null || closeMinutes === null) continue;

      const dayStart = zonedPartsToUtc(
        timezone,
        dayParts.year,
        dayParts.month,
        dayParts.day,
        Math.floor(openMinutes / 60),
        openMinutes % 60,
      );

      const dayEnd = zonedPartsToUtc(
        timezone,
        dayParts.year,
        dayParts.month,
        dayParts.day,
        Math.floor(closeMinutes / 60),
        closeMinutes % 60,
      );

      let slotStart = new Date(Math.max(dayStart.getTime(), earliestStart.getTime()));

      while (slotStart.getTime() + slotMinutes * 60000 <= dayEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60000);

        // Check no collision with existing bookings or buffer
        const bufferStart = new Date(slotStart.getTime() - bufferMinutes * 60000);
        const bufferEnd = new Date(slotEnd.getTime() + bufferMinutes * 60000);

        let collides = false;
        for (const booked of bookedRanges) {
          if (bufferStart < booked.end && bufferEnd > booked.start) {
            collides = true;
            break;
          }
        }

        const dayKeyStr = dayKey as string;
        if (!collides && (slotsPerDay[dayKeyStr] ?? 0) < maxPerDay) {
          const label = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }).format(slotStart);

          slots.push({ start: slotStart, end: slotEnd, label });
          slotsPerDay[dayKeyStr] = (slotsPerDay[dayKeyStr] ?? 0) + 1;
        }

        slotStart = new Date(slotStart.getTime() + 30 * 60000); // 30-min increment
      }
    }

    current = new Date(current.getTime() + 24 * 60 * 60000);
  }

  return slots;
}
