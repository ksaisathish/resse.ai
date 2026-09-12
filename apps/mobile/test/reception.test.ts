import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  applyStatusChange,
  initialReception,
  upcomingAppointments,
  validateStatusChange,
  type ReceptionSnapshot,
} from "../src/reception.ts";

function cloneReception(): ReceptionSnapshot {
  return structuredClone(initialReception);
}

describe("appointment status transitions", () => {
  test("rejects a status change on an appointment that is already completed", () => {
    const snapshot = cloneReception();

    const result = applyStatusChange(snapshot, {
      appointmentId: "appt-1",
      status: "checked-in",
    });

    assert.deepEqual(result.snapshot, snapshot);
    assert.equal(result.appointment, undefined);
    assert.equal(
      result.error,
      'Jordan Blake\'s appointment is already "completed"; cannot change it to "checked-in".',
    );
  });

  test("rejects an unknown appointment id before mutation", () => {
    const snapshot = cloneReception();

    assert.deepEqual(
      validateStatusChange(snapshot, { appointmentId: "appt-999", status: "checked-in" }),
      { ok: false, reason: 'No local appointment matched "appt-999"; nothing changed.' },
    );
  });

  test("rejects partial streamed arguments before mutation", () => {
    const snapshot = cloneReception();

    assert.deepEqual(
      validateStatusChange(snapshot, { appointmentId: "appt-2" }),
      { ok: false, reason: "Appointment details are still streaming; nothing changed." },
    );
  });

  test("checks a customer in from an upcoming appointment", () => {
    const snapshot = cloneReception();

    const result = applyStatusChange(snapshot, {
      appointmentId: "appt-2",
      status: "checked-in",
    });

    assert.equal(result.appointment?.status, "checked-in");
    assert.equal(result.appointment?.customerName, "Priya Nair");
    const updated = result.snapshot.appointments.find((item) => item.id === "appt-2");
    assert.equal(updated?.status, "checked-in");
  });
});

test("lists only upcoming appointments", () => {
  const snapshot = cloneReception();
  assert.deepEqual(
    upcomingAppointments(snapshot).map((item) => item.id),
    ["appt-2", "appt-4"],
  );
});
