import assert from "node:assert/strict";
import { test } from "node:test";
import { REALTIME_MODEL, REALTIME_VOICE } from "./realtime-config";

test("realtime config falls back to the documented defaults", () => {
  assert.equal(REALTIME_MODEL, process.env.NEXT_PUBLIC_REALTIME_MODEL ?? "gpt-realtime-2.1");
  assert.equal(REALTIME_VOICE, process.env.NEXT_PUBLIC_REALTIME_VOICE ?? "marin");
});
