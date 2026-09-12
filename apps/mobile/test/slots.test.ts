import assert from "node:assert/strict";
import { test } from "node:test";
import { busyFromAppointments, suggestSlots } from "../src/slots.ts";
import type { Availability } from "../src/reception.ts";

const weekdays: Availability = {
  mon: { open: "09:00", close: "17:00" },
  tue: { open: "09:00", close: "17:00" },
  wed: { open: "09:00", close: "17:00" },
  thu: { open: "09:00", close: "17:00" },
  fri: { open: "09:00", close: "17:00" },
  sat: "closed",
  sun: "closed",
};

// A Wednesday, 8am local.
const wednesdayMorning = new Date(2026, 8, 16, 8, 0, 0);

test("suggests slots inside opening hours, respecting lead time", () => {
  const slots = suggestSlots({ now: wednesdayMorning, availability: weekdays, maxSlots: 3 });
  assert.equal(slots.length, 3);
  // 8am + 60min lead time = 9am, so the first slot is the 9:00 opening.
  assert.equal(new Date(slots[0].startISO).getHours(), 9);
  assert.equal(new Date(slots[1].startISO).getMinutes(), 30);
});

test("never offers a slot that would run past closing", () => {
  const slots = suggestSlots({
    now: new Date(2026, 8, 16, 15, 0, 0),
    availability: weekdays,
    durationMinutes: 60,
    maxSlots: 20,
  });
  const sameDay = slots.filter((slot) => new Date(slot.startISO).getDate() === 16);
  const last = new Date(sameDay[sameDay.length - 1].startISO);
  assert.equal(last.getHours(), 16); // 16:00 + 60min == 17:00 close, still fits.
});

test("skips closed days entirely and rolls into the next open one", () => {
  // Friday 6pm — after close, so the next slot must be Monday, not the weekend.
  const slots = suggestSlots({
    now: new Date(2026, 8, 18, 18, 0, 0),
    availability: weekdays,
    maxSlots: 1,
  });
  assert.equal(slots.length, 1);
  assert.equal(new Date(slots[0].startISO).getDay(), 1); // Monday
});

test("avoids times that clash with something already booked", () => {
  const busy = [
    {
      startISO: new Date(2026, 8, 16, 9, 0, 0).toISOString(),
      endISO: new Date(2026, 8, 16, 10, 0, 0).toISOString(),
    },
  ];
  const slots = suggestSlots({ now: wednesdayMorning, availability: weekdays, busy, maxSlots: 1 });
  assert.equal(new Date(slots[0].startISO).getHours(), 10);
});

test("onlyDateISO restricts results to that one day", () => {
  const slots = suggestSlots({
    now: wednesdayMorning,
    availability: weekdays,
    onlyDateISO: new Date(2026, 8, 17, 12, 0, 0).toISOString(),
    maxSlots: 50,
  });
  assert.ok(slots.length > 0);
  assert.ok(slots.every((slot) => new Date(slot.startISO).getDate() === 17));
});

test("a closed requested day yields nothing rather than silently sliding", () => {
  const saturday = new Date(2026, 8, 19, 12, 0, 0).toISOString();
  const slots = suggestSlots({
    now: wednesdayMorning,
    availability: weekdays,
    onlyDateISO: saturday,
  });
  assert.deepEqual(slots, []);
});

test("with no availability configured it suggests nothing instead of guessing", () => {
  assert.deepEqual(suggestSlots({ now: wednesdayMorning }), []);
});

test("busyFromAppointments ignores demo rows with no real date, and dead bookings", () => {
  const busy = busyFromAppointments([
    { status: "upcoming" },
    { status: "upcoming", startISO: "2026-09-16T09:00:00.000Z", durationMinutes: 45 },
    { status: "cancelled", startISO: "2026-09-16T11:00:00.000Z" },
    { status: "no-show", startISO: "2026-09-16T12:00:00.000Z" },
  ]);
  assert.equal(busy.length, 1);
  assert.equal(busy[0].endISO, "2026-09-16T09:45:00.000Z");
});
