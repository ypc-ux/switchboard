import { isQuietHour, inQuietHours, nextAllowedSendTime, localHour } from "../src/lib/quiet-hours";
import { renderTemplate } from "../src/lib/textback";

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
};

// wrap-around window 21:00 -> 08:00
eq("22:00 is quiet (21->8)", isQuietHour(22, 21, 8), true);
eq("03:00 is quiet (21->8)", isQuietHour(3, 21, 8), true);
eq("08:00 is NOT quiet (boundary, exclusive end)", isQuietHour(8, 21, 8), false);
eq("21:00 IS quiet (boundary, inclusive start)", isQuietHour(21, 21, 8), true);
eq("14:00 is NOT quiet (21->8)", isQuietHour(14, 21, 8), false);

// non-wrapping window 1:00 -> 6:00
eq("03:00 is quiet (1->6)", isQuietHour(3, 1, 6), true);
eq("23:00 NOT quiet (1->6)", isQuietHour(23, 1, 6), false);

// degenerate window = always allowed
eq("start==end means never quiet", isQuietHour(5, 9, 9), false);

// timezone awareness: 02:00 UTC is 21:00 previous day in New York
const at = new Date("2026-09-10T02:00:00Z");
eq("NY local hour for 02:00Z", localHour("America/New_York", at), 22);
eq("Tokyo local hour for 02:00Z", localHour("Asia/Tokyo", at), 11);
eq("quiet in NY at 02:00Z (21->8)", inQuietHours("America/New_York", 21, 8, at), true);
eq("NOT quiet in Tokyo at 02:00Z (21->8)", inQuietHours("Asia/Tokyo", 21, 8, at), false);

// deferral lands outside the window, and is in the future
const deferred = nextAllowedSendTime("America/New_York", 21, 8, at);
eq("deferred time is outside quiet hours", inQuietHours("America/New_York", 21, 8, deferred), false);
eq("deferred time is after the miss", deferred.getTime() > at.getTime(), true);
console.log(`      deferred ${at.toISOString()} -> ${deferred.toISOString()} (NY hour ${localHour("America/New_York", deferred)})`);

// a call outside quiet hours is not deferred at all
const midday = new Date("2026-09-10T16:00:00Z"); // 12:00 NY
eq("no deferral outside quiet hours", nextAllowedSendTime("America/New_York", 21, 8, midday).getTime(), midday.getTime());

// template rendering
eq("template renders vars",
  renderTemplate("Sorry we missed you at {{business}}. Book: {{booking_url}}", { business: "Acme HVAC", booking_url: "https://a.co/b" }),
  "Sorry we missed you at Acme HVAC. Book: https://a.co/b");
eq("missing var collapses cleanly",
  renderTemplate("Hi from {{business}}. {{booking_url}}", { business: "Acme" }),
  "Hi from Acme.");

console.log(fail === 0 ? "\nAll pure-logic tests passed." : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
