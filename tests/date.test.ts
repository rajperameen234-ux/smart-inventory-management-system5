import test from "node:test";
import assert from "node:assert/strict";

import {
  formatDate,
  parseDate,
  toDateInputValue,
  todayISODate,
  isValidDateInput,
} from "../src/lib/date.ts";

test("parseDate treats a date-only string as a LOCAL calendar date", () => {
  const parsed = parseDate("2026-01-01");

  assert.ok(parsed);
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 0);
  assert.equal(parsed.getDate(), 1);
});

test("REGRESSION: date-only strings must not shift a day for negative UTC offsets", () => {
  // `new Date("2026-01-01")` is UTC midnight; at UTC-5 that is 31 Dec 2025 local.
  // This asserts the day number matches the literal input on every machine.
  for (const iso of ["2026-01-01", "2026-03-15", "2026-12-31", "2026-03-31"]) {
    const parsed = parseDate(iso);

    assert.ok(parsed, `${iso} should parse`);

    const [year, month, day] = iso.split("-").map(Number);

    assert.equal(
      parsed.getDate(),
      day,
      `${iso} rendered as day ${parsed.getDate()}`
    );
    assert.equal(parsed.getMonth(), month - 1, `${iso} month mismatch`);
    assert.equal(parsed.getFullYear(), year, `${iso} year mismatch`);
  }
});

test("formatDate never renders the wrong calendar day", () => {
  // Assert on the rendered string, not the internal timezone maths.
  assert.equal(formatDate("2026-01-01"), "01 Jan 2026");
  assert.equal(formatDate("2026-03-15"), "15 Mar 2026");
  assert.equal(formatDate("2026-12-31"), "31 Dec 2026");
});

test("formatDate accepts timestamps and renders the local calendar day", () => {
  assert.equal(formatDate("2026-01-01T00:00:00.000Z"), "01 Jan 2026");
  assert.equal(formatDate("2026-01-01T00:00:00+00:00"), "01 Jan 2026");
});

test("parseDate rejects invalid and impossible dates", () => {
  assert.equal(parseDate(null), null);
  assert.equal(parseDate(undefined), null);
  assert.equal(parseDate(""), null);
  assert.equal(parseDate("not-a-date"), null);
  // 31 February would silently roll over to March in plain JS Date.
  assert.equal(parseDate("2026-02-31"), null);
  assert.equal(parseDate("2026-13-01"), null);
});

test("formatDate degrades to an em dash for unusable input", () => {
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate(""), "—");
  assert.equal(formatDate("garbage"), "—");
});

test("toDateInputValue produces a value <input type=date> accepts", () => {
  assert.equal(toDateInputValue("2026-01-01"), "2026-01-01");
  // A raw DB timestamp is the real-world case that previously blanked the field.
  assert.equal(toDateInputValue("2026-01-01T00:00:00+00:00"), "2026-01-01");
  assert.equal(toDateInputValue("2026-03-15T10:30:00.000Z"), "2026-03-15");
  assert.equal(toDateInputValue(""), "");
  assert.equal(toDateInputValue(null), "");
  assert.equal(toDateInputValue("garbage"), "");
});

test("todayISODate round-trips through the date input", () => {
  const today = todayISODate();

  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(toDateInputValue(today), today);
  assert.equal(formatDate(today), formatDate(new Date()));
});

test("isValidDateInput matches parseDate", () => {
  assert.equal(isValidDateInput("2026-01-01"), true);
  assert.equal(isValidDateInput("2026-02-31"), false);
  assert.equal(isValidDateInput(""), false);
});