import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_PAGE,
  isPageId,
  PAGES,
  parsePageFromHash,
} from "../src/lib/pages.ts";

test("parsePageFromHash resolves every plain page hash", () => {
  for (const page of PAGES) {
    assert.equal(parsePageFromHash(`#/${page}`), page);
    assert.equal(parsePageFromHash(`#${page}`), page);
  }
});

test("REGRESSION: a recovery callback URL lands on the reset form", () => {
  // Supabase recovery links append their token payload as a SECOND
  // hash fragment after the router page.
  assert.equal(
    parsePageFromHash(
      "#/reset-password#access_token=abc&refresh_token=def"
    ),
    "reset-password"
  );
});

test("tokens after any page are discarded, not treated as a page", () => {
  assert.equal(
    parsePageFromHash("#/sales#access_token=abc&expires_in=3600"),
    "sales"
  );
});

test("unknown pages fall back to the default page", () => {
  assert.equal(parsePageFromHash("#/nope"), DEFAULT_PAGE);
  assert.equal(parsePageFromHash(""), DEFAULT_PAGE);
  assert.equal(parsePageFromHash(null), DEFAULT_PAGE);
  assert.equal(parsePageFromHash(undefined), DEFAULT_PAGE);
  assert.equal(parsePageFromHash("   "), DEFAULT_PAGE);
});

test("empty hash resolves to the dashboard", () => {
  assert.equal(parsePageFromHash("#"), DEFAULT_PAGE);
  assert.equal(parsePageFromHash("#/"), DEFAULT_PAGE);
});

test("reset-password is a known page id", () => {
  assert.ok(isPageId("reset-password"));
});

test("every page id is unique and non-empty", () => {
  const set = new Set(PAGES);
  assert.equal(set.size, PAGES.length);
  for (const page of PAGES) {
    assert.ok(page.length > 0);
  }
});

test("REGRESSION: isPageId agrees with parsePageFromHash", () => {
  for (const page of PAGES) {
    assert.ok(isPageId(page));
    assert.equal(parsePageFromHash(`#/${page}`), page);
  }
});
