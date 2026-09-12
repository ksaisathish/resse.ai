import assert from "node:assert/strict";
import { test } from "node:test";
import { toSpeechText } from "../src/speech-text.ts";

test("strips bold and italic wrappers rather than reading them aloud", () => {
  assert.equal(toSpeechText("We're open **8 to 5** today."), "We're open 8 to 5 today.");
  assert.equal(toSpeechText("That's *really* soon."), "That's really soon.");
  assert.equal(toSpeechText("***Fully*** booked."), "Fully booked.");
  assert.equal(toSpeechText("Ask for __Priya__."), "Ask for Priya.");
});

test("keeps link and image labels, drops the URLs", () => {
  assert.equal(toSpeechText("See [our hours](https://example.com/hours)."), "See our hours.");
  assert.equal(toSpeechText("![a QR code](data:image/png;base64,AAA)"), "a QR code");
});

test("flattens bullets and headings into spoken sentences", () => {
  assert.equal(
    toSpeechText("## Services\n- Cleaning\n- Whitening"),
    "Services. Cleaning. Whitening",
  );
});

test("numbered lists keep their numbering, which reads naturally", () => {
  assert.equal(toSpeechText("1. Cleaning\n2. Checkup"), "1. Cleaning. 2. Checkup");
});

test("removes code fences and inline ticks", () => {
  assert.equal(toSpeechText("Call `+15550190020` now."), "Call +15550190020 now.");
  assert.equal(toSpeechText("```json\n{}\n```"), "{}");
});

test("drops stray asterisks from a truncated stream", () => {
  assert.equal(toSpeechText("Booked for **Priya"), "Booked for Priya");
});

test("leaves plain prose untouched", () => {
  assert.equal(
    toSpeechText("Priya Nair is checked in for a 10:30 AM checkup."),
    "Priya Nair is checked in for a 10:30 AM checkup.",
  );
});
