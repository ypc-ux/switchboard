/**
 * Tests for availability slot generation
 */

import { availableSlots } from "../availability";
import { db } from "../supabase";
import type { Hours, BookingRules } from "../knowledge";

describe("availableSlots", () => {
  const testClientId = "test-client-" + Date.now();
  const timezone = "America/Los_Angeles";

  const hours: Hours = {
    mon: [["09:00", "18:00"]],
    tue: [["09:00", "18:00"]],
    wed: [["09:00", "18:00"]],
    thu: [["09:00", "18:00"]],
    fri: [["09:00", "18:00"]],
    sat: [],
    sun: [],
  };

  const rules: BookingRules = {
    lead_time_minutes: 30,
    buffer_minutes: 15,
    max_days_out: 90,
    max_per_day: 5,
    slot_minutes: 60,
  };

  beforeAll(async () => {
    // Create test client
    await db().from("clients").insert({
      id: testClientId,
      slug: `test-${Date.now()}`,
      name: "Test Salon",
      timezone,
      twilio_number: "+16505550100",
      forward_number: "+16505550101",
      active: true,
    });
  });

  afterAll(async () => {
    // Cleanup
    await db().from("clients").delete().eq("id", testClientId);
  });

  it("should generate slots within business hours", async () => {
    const slots = await availableSlots(testClientId, timezone, hours, rules, 60);

    expect(slots.length).toBeGreaterThan(0);

    // All slots should have required properties
    slots.forEach((slot) => {
      expect(slot.start).toBeInstanceOf(Date);
      expect(slot.end).toBeInstanceOf(Date);
      expect(slot.label).toMatch(/\d{1,2}:\d{2}\s(?:AM|PM)/);
    });
  });

  it("should respect lead time (no slots before now + lead_time)", async () => {
    const slots = await availableSlots(testClientId, timezone, hours, rules, 60);

    const now = new Date();
    const earliestAllowed = new Date(now.getTime() + 30 * 60000); // 30 min lead time

    slots.forEach((slot) => {
      expect(slot.start.getTime()).toBeGreaterThanOrEqual(earliestAllowed.getTime() - 60000); // Allow 1 min tolerance
    });
  });

  it("should respect max_per_day limit", async () => {
    const slots = await availableSlots(testClientId, timezone, hours, rules, 60);

    // Group by date
    const byDate: Record<string, number> = {};
    slots.forEach((slot) => {
      const date = slot.start.toISOString().split("T")[0];
      byDate[date] = (byDate[date] || 0) + 1;
    });

    // No day should exceed max_per_day
    Object.values(byDate).forEach((count) => {
      expect(count).toBeLessThanOrEqual(rules.max_per_day!);
    });
  });

  it("should respect max_days_out", async () => {
    const slots = await availableSlots(testClientId, timezone, hours, rules, 60);

    const now = new Date();
    const maxDate = new Date(now.getTime() + 90 * 24 * 60 * 60000); // 90 days

    slots.forEach((slot) => {
      expect(slot.start.getTime()).toBeLessThanOrEqual(maxDate.getTime() + 60000); // 1 min tolerance
    });
  });

  it("should not generate slots on closed days", async () => {
    const slots = await availableSlots(testClientId, timezone, hours, rules, 60);

    // Saturday (6) and Sunday (0) are closed
    slots.forEach((slot) => {
      const dayOfWeek = slot.start.getUTCDay();
      expect([0, 6]).not.toContain(dayOfWeek);
    });
  });

  it("should generate 30-minute increments", async () => {
    const slots = await availableSlots(testClientId, timezone, hours, rules, 60);

    // Group by hour and check minutes are 0 or 30
    const minutes = new Set<number>();
    slots.forEach((slot) => {
      minutes.add(slot.start.getUTCMinutes());
    });

    minutes.forEach((m) => {
      expect([0, 30]).toContain(m);
    });
  });

  it("should exclude slots colliding with existing bookings", async () => {
    // Create a booking
    const bookingStart = new Date();
    bookingStart.setUTCHours(14, 0, 0, 0); // 2pm UTC
    const bookingEnd = new Date(bookingStart.getTime() + 60 * 60000); // 1 hour

    await db().from("bookings").insert({
      client_id: testClientId,
      service: "Haircut",
      starts_at: bookingStart.toISOString(),
      ends_at: bookingEnd.toISOString(),
      source: "test",
    });

    try {
      const slots = await availableSlots(testClientId, timezone, hours, rules, 60);

      // No slot should collide with the booking
      slots.forEach((slot) => {
        const bufferStart = new Date(slot.start.getTime() - 15 * 60000); // 15 min buffer
        const bufferEnd = new Date(slot.end.getTime() + 15 * 60000);

        const collides =
          bufferStart < bookingEnd && bufferEnd > bookingStart;

        expect(collides).toBe(false);
      });
    } finally {
      // Cleanup
      await db()
        .from("bookings")
        .delete()
        .eq("starts_at", bookingStart.toISOString());
    }
  });

  it("should handle multiple time slots per day", async () => {
    // Hours with multiple slots (morning and afternoon)
    const multiHours: Hours = {
      mon: [
        ["09:00", "12:00"],
        ["14:00", "18:00"],
      ],
      tue: [
        ["09:00", "12:00"],
        ["14:00", "18:00"],
      ],
      wed: [
        ["09:00", "12:00"],
        ["14:00", "18:00"],
      ],
      thu: [
        ["09:00", "12:00"],
        ["14:00", "18:00"],
      ],
      fri: [
        ["09:00", "12:00"],
        ["14:00", "18:00"],
      ],
      sat: [],
      sun: [],
    };

    const slots = await availableSlots(testClientId, timezone, multiHours, rules, 60);

    expect(slots.length).toBeGreaterThan(0);

    // Should have slots from both time periods
    const morningSlots = slots.filter((s) => {
      const hour = parseInt(s.label.split(" ").pop()!.split(":")[0]);
      return hour < 12;
    });

    const afternoonSlots = slots.filter((s) => {
      const hour = parseInt(s.label.split(" ").pop()!.split(":")[0]);
      return hour >= 12;
    });

    expect(morningSlots.length).toBeGreaterThan(0);
    expect(afternoonSlots.length).toBeGreaterThan(0);
  });
});
