/**
 * WhatsApp dues-reminder helpers.
 *
 * Pure functions only (no React, no Supabase) so they can be unit tested.
 * Balances are passed in by the caller — this module never reads or writes
 * customer, sale, payment or dues data on its own.
 */

/** The settings key written by the Settings page (`pages/Settings.tsx`). */
const SETTINGS_KEY = "si.settings";

const DEFAULT_BUSINESS_FALLBACK = "our shop";

const PK_COUNTRY_CODE = "92";
/** A Pakistani mobile number without the country code: 10 digits, starts with 3. */
const PK_LOCAL_DIGITS = 10;

const messageMoneyFormatter = new Intl.NumberFormat("en-PK", {
  maximumFractionDigits: 2,
});

/** Grouped rupee amount for message templates (e.g. "12,500"). */
export function formatMessageMoney(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;

  return messageMoneyFormatter.format(amount);
}

/** A valid local mobile part: exactly 10 digits starting with 3 (03xx range). */
function isPkLocalMobile(part: string): boolean {
  return part.length === PK_LOCAL_DIGITS && /^3\d{9}$/.test(part);
}

function isInternationalPrefix(digits: string): boolean {
  return digits.startsWith("0092") || digits.startsWith("00");
}

/**
 * Split the "+"/"00"/"92"/"0" prefixes off an input and return the local
 * Pakistani mobile part ("3001234567"), or null when the number is not a
 * valid Pakistani mobile. Invalid numbers are rejected, never guessed.
 *
 * Accepted shapes:
 *   +92 300 1234567   +923001234567   923001234567   0092-300-1234567
 *   0300-1234567      03 00 1234567   300-1234567
 */
export function normalizePakistaniPhone(raw: string): string | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();

  if (trimmed.length === 0) return null;

  const plus = trimmed.startsWith("+");

  let digits = trimmed.replace(/[^\d]/g, "");

  // "00" international dial prefixes ("0092...", "00923001234567").
  if (isInternationalPrefix(digits)) {
    if (digits.startsWith("0092")) {
      digits = digits.slice(4);
    } else {
      // "00" followed by something other than the country code: a
      // call to a foreign country or garbage — not guessable.
      return null;
    }
  }

  if (plus) {
    // "+..." must carry the Pakistani country code.
    if (digits.startsWith(PK_COUNTRY_CODE)) {
      digits = digits.slice(PK_COUNTRY_CODE.length);
    } else {
      return null;
    }
  } else if (
    digits.length > PK_LOCAL_DIGITS + 1 &&
    digits.startsWith(PK_COUNTRY_CODE)
  ) {
    // "923001234567" typed without the "+".
    digits = digits.slice(PK_COUNTRY_CODE.length);
  } else if (digits.startsWith("0")) {
    // Local trunk zero ("03xx...").
    digits = digits.slice(1);
  }

  if (!isPkLocalMobile(digits)) return null;

  return PK_COUNTRY_CODE + digits;
}

/** Pretty display form of normalized digits, e.g. "+92 300 1234567". */
export function prettyPakistaniPhone(intlDigits: string): string {
  if (!/^\d{10,15}$/.test(intlDigits)) {
    return `+${intlDigits}`;
  }

  if (
    intlDigits.length === PK_COUNTRY_CODE.length + PK_LOCAL_DIGITS &&
    intlDigits.startsWith(PK_COUNTRY_CODE)
  ) {
    const rest = intlDigits.slice(PK_COUNTRY_CODE.length);

    return `+${PK_COUNTRY_CODE} ${rest.slice(0, 3)} ${rest.slice(3)}`;
  }

  return `+${intlDigits}`;
}

export type ReminderDetails = {
  customerName: string;
  businessName: string;
  totalPurchases: number;
  totalPaid: number;
  outstandingDue: number;
};

/**
 * Build the default reminder message. Amounts are formatted here so the
 * rendered amounts cannot drift from the caller's calculations.
 */
export function buildReminderMessage(details: ReminderDetails): string {
  const name = details.customerName.trim() || "Customer";
  const shop = details.businessName.trim() || DEFAULT_BUSINESS_FALLBACK;

  return [
    `Assalam-o-Alaikum ${name},`,
    "",
    `This is a friendly payment reminder from ${shop}.`,
    "",
    "Your outstanding payment details:",
    "",
    `Total Amount: Rs. ${formatMessageMoney(details.totalPurchases)}`,
    `Paid Amount: Rs. ${formatMessageMoney(details.totalPaid)}`,
    `Remaining Dues: Rs. ${formatMessageMoney(details.outstandingDue)}`,
    "",
    "Kindly clear your remaining balance at your convenience.",
    "",
    "Thank you for your business!",
  ].join("\n");
}

/** Official Click-to-Chat URL with the message URL-encoded. */
export function buildWhatsAppUrl(intlDigits: string, message: string): string {
  return `https://wa.me/${intlDigits}?text=${encodeURIComponent(message)}`;
}

/**
 * Read the business/shop name stored by the Settings page. Node-safe: when
 * `window` is absent (unit tests) the fallback name is used.
 */
export function getBusinessName(): string {
  if (typeof window === "undefined") return DEFAULT_BUSINESS_FALLBACK;

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);

    if (!raw) return DEFAULT_BUSINESS_FALLBACK;

    const parsed = JSON.parse(raw) as { businessName?: unknown };

    const name =
      typeof parsed.businessName === "string" ? parsed.businessName.trim() : "";

    return name || DEFAULT_BUSINESS_FALLBACK;
  } catch {
    return DEFAULT_BUSINESS_FALLBACK;
  }
}
