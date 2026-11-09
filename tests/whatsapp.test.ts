import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildReminderMessage,
  buildWhatsAppUrl,
  formatMessageMoney,
  getBusinessName,
  normalizePakistaniPhone,
  prettyPakistaniPhone,
} from "../src/lib/whatsapp.ts";

/* ------------------------- phone normalization ------------------------- */

test("local Pakistani mobile formats normalize to international digits", () => {
  assert.equal(normalizePakistaniPhone("0300-1234567"), "923001234567");
  assert.equal(normalizePakistaniPhone("0300 1234567"), "923001234567");
  assert.equal(normalizePakistaniPhone("(0300) 123-4567"), "923001234567");
  assert.equal(normalizePakistaniPhone("300-1234567"), "923001234567");
  assert.equal(normalizePakistaniPhone("03001234567"), "923001234567");
});

test("+92 and 92-prefixed entries keep a single country code", () => {
  assert.equal(normalizePakistaniPhone("+923001234567"), "923001234567");
  assert.equal(normalizePakistaniPhone("+92 300 1234567"), "923001234567");
  assert.equal(normalizePakistaniPhone("923001234567"), "923001234567");
  assert.equal(normalizePakistaniPhone("92-300-1234567"), "923001234567");
  assert.equal(normalizePakistaniPhone("0092-300-1234567"), "923001234567");
});

test("invalid, foreign or landline numbers are rejected, never guessed", () => {
  assert.equal(normalizePakistaniPhone(""), null);
  assert.equal(normalizePakistaniPhone("   "), null);
  assert.equal(normalizePakistaniPhone("abc"), null);
  assert.equal(normalizePakistaniPhone("0512-3456789"), null);
  assert.equal(normalizePakistaniPhone("+1 (555) 123-4567"), null);
  assert.equal(normalizePakistaniPhone("+447911123456"), null);
  assert.equal(normalizePakistaniPhone("03001"), null);
  assert.equal(normalizePakistaniPhone("030012345678"), null);
  assert.equal(normalizePakistaniPhone("9230012345678"), null);
  assert.equal(normalizePakistaniPhone("930201234567"), null);
  assert.equal(normalizePakistaniPhone("+0092 300 1234567"), null);
});

/* ---------------------------- display + amounts ---------------------------- */

test("prettyPakistaniPhone renders the familiar display shape", () => {
  assert.equal(prettyPakistaniPhone("923001234567"), "+92 300 1234567");
});

test("formatMessageMoney groups digits and trims fractional noise", () => {
  assert.equal(formatMessageMoney(12500), "12,500");
  assert.equal(formatMessageMoney(1250.5), "1,250.5");
  assert.equal(formatMessageMoney(0), "0");
  assert.equal(formatMessageMoney(Number.NaN), "0");
});

/* ------------------------------ message + URL ------------------------------ */

test("REGRESSION: the default reminder template stays in the agreed shape", () => {
  const message = buildReminderMessage({
    customerName: "Ali Traders",
    businessName: "Kareem mart",
    totalPurchases: 24500,
    totalPaid: 12000,
    outstandingDue: 12500,
  });

  assert.equal(
    message,
    [
      "Assalam-o-Alaikum Ali Traders,",
      "",
      "This is a friendly payment reminder from Kareem mart.",
      "",
      "Your outstanding payment details:",
      "",
      "Total Amount: Rs. 24,500",
      "Paid Amount: Rs. 12,000",
      "Remaining Dues: Rs. 12,500",
      "",
      "Kindly clear your remaining balance at your convenience.",
      "",
      "Thank you for your business!",
    ].join("\n")
  );
});

test("buildWhatsAppUrl encodes the message and targets the number", () => {
  const url = buildWhatsAppUrl("923001234567", "Salam!\nRemaining dues: Rs. 500");

  assert.equal(
    url,
    "https://wa.me/923001234567?text=Salam!%0ARemaining%20dues%3A%20Rs.%20500"
  );
});

test("getBusinessName falls back when settings are unavailable", () => {
  // Outside a browser (node --test) there is no localStorage.
  assert.equal(getBusinessName(), "our shop");
});
