import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BASE_CURRENCY,
  convertFromPkr,
  convertFromPkrPrecise,
  convertToPkr,
  isCurrencyCode,
  isValidRate,
  pkrPerUnitFromApiRates,
  resolvePkrPerUnit,
} from "../src/lib/currency.ts";

import {
  applyActiveCurrency,
  formatMoney,
} from "../src/lib/format.ts";

import { buildReminderMessage } from "../src/lib/whatsapp.ts";

/** The agreed showcase rate: 1 USD = 278.50 PKR. */
const USD_RATE = 278.5;

/* ------------------------------ conversions ------------------------------ */

test("base amounts convert exactly at the agreed USD rate", () => {
  assert.equal(convertFromPkr(27850, USD_RATE), 100);
  assert.equal(convertFromPkr(55700, USD_RATE), 200);
  assert.equal(convertFromPkr(13925, USD_RATE), 50);
  assert.equal(convertFromPkr(2785, USD_RATE), 10);
});

test("converting back to PKR restores the original stored amount", () => {
  for (const base of [27850, 55700, 13925, 2785]) {
    const display = convertFromPkr(base, USD_RATE);
    assert.equal(convertToPkr(display, USD_RATE), base);
  }
});

test("form seeding keeps enough precision to round-trip", () => {
  // A base amount that has no clean 2dp display value at 278.50 PKR/USD.
  const base = 27850.05;

  const seeded = convertFromPkrPrecise(base, USD_RATE);
  // Precise enough that saving the re-typed value returns the same record.
  assert.equal(convertToPkr(seeded, USD_RATE), base);
});

test("zero and free amounts stay stable", () => {
  assert.equal(convertFromPkr(0, USD_RATE), 0);
  assert.equal(convertToPkr(0, USD_RATE), 0);
});

/* -------------------------------- rates ---------------------------------- */

test("invalid rates are rejected, never silently applied", () => {
  assert.equal(isValidRate(0), false);
  assert.equal(isValidRate(-5), false);
  assert.equal(isValidRate(Number.NaN), false);
  assert.equal(isValidRate(Number.POSITIVE_INFINITY), false);
  assert.equal(isValidRate(278.5), true);
});

test("API rates quoted per PKR are inverted into PKR-per-unit", () => {
  // open.er-api.com returns 1 PKR = 0.00359066 USD for the USD key; the
  // inversion is rounded to the same 2dp money scale as everything else.
  assert.equal(
    pkrPerUnitFromApiRates({ USD: 0.00359066 }).USD,
    Math.round((1 / 0.00359066) * 100) / 100
  );
});

test("resolvePkrPerUnit prefers manual rates over fetched ones", () => {
  assert.equal(
    resolvePkrPerUnit(
      "USD",
      { USD: 280 },
      { USD: 278.5 }
    ),
    278.5
  );

  assert.equal(resolvePkrPerUnit("USD", { USD: 280 }, {}), 280);
  assert.equal(resolvePkrPerUnit("USD", {}, {}), null);
});

test("the base currency always resolves to 1 with no rate data", () => {
  assert.equal(resolvePkrPerUnit(BASE_CURRENCY, {}, {}), 1);
});

test("unknown currency codes are rejected", () => {
  assert.equal(isCurrencyCode("PKR"), true);
  assert.equal(isCurrencyCode("USD"), true);
  assert.equal(isCurrencyCode("GBP"), true);
  assert.equal(isCurrencyCode("EUR"), true);
  assert.equal(isCurrencyCode("AED"), true);
  assert.equal(isCurrencyCode("SAR"), true);
  assert.equal(isCurrencyCode("XYZ"), false);
  assert.equal(isCurrencyCode(""), false);
});

/* ------------------------------ formatting ------------------------------- */

test("formatMoney converts exactly once with the active currency", () => {
  applyActiveCurrency({ code: "USD", pkrPerUnit: USD_RATE, rateMissing: false });

  assert.equal(formatMoney(27850), "$100");
  assert.equal(formatMoney(55700, 0), "$200");
  assert.equal(formatMoney(13925), "$50");
  assert.equal(formatMoney(2785), "$10");

  // Switching back restores rupee formatting without any stale conversion.
  applyActiveCurrency({ code: "PKR", pkrPerUnit: 1, rateMissing: false });
  assert.equal(formatMoney(27850), "Rs. 27,850");
});

test("formatMoney falls back to PKR display when the rate is missing", () => {
  applyActiveCurrency({ code: "USD", pkrPerUnit: 1, rateMissing: true });

  assert.equal(formatMoney(27850), "Rs. 27,850");

  applyActiveCurrency({ code: "PKR", pkrPerUnit: 1, rateMissing: false });
});

/* ------------------------------- reminders ------------------------------- */

test("the reminder message defaults to PKR (regression guard)", () => {
  const message = buildReminderMessage({
    customerName: "Ali",
    businessName: "Kareem mart",
    totalPurchases: 27850,
    totalPaid: 13925,
    outstandingDue: 13925,
  });

  assert.match(message, /Total Amount: Rs\. 27,850/);
  assert.match(message, /Paid Amount: Rs\. 13,925/);
  assert.match(message, /Remaining Dues: Rs\. 13,925/);
});

test("the reminder message converts when a currency with a rate is passed", () => {
  const message = buildReminderMessage(
    {
      customerName: "Ali",
      businessName: "Kareem mart",
      totalPurchases: 27850,
      totalPaid: 13925,
      outstandingDue: 13925,
    },
    { code: "USD", pkrPerUnit: USD_RATE }
  );

  assert.match(message, /Total Amount: \$ 100/);
  assert.match(message, /Paid Amount: \$ 50/);
  assert.match(message, /Remaining Dues: \$ 50/);
});

test("a missing rate keeps the reminder in PKR instead of faking it", () => {
  const message = buildReminderMessage(
    {
      customerName: "Ali",
      businessName: "Kareem mart",
      totalPurchases: 27850,
      totalPaid: 13925,
      outstandingDue: 13925,
    },
    { code: "USD", pkrPerUnit: null }
  );

  assert.match(message, /Total Amount: Rs\. 27,850/);
});
