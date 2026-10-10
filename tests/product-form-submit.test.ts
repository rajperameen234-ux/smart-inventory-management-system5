import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PAGES_DIR = join(process.cwd(), "src", "pages");

function readPage(name: string): string {
  return readFileSync(join(PAGES_DIR, name), "utf8");
}

/**
 * Extracts the opening tag of every `<Button ...>` element.
 *
 * A regex is not enough here: attributes contain arrow functions (`=>`) whose
 * `>` must not be mistaken for the end of the tag, and a lazy match would
 * happily span sibling buttons and report a false positive.
 */
function buttonTags(source: string): { index: number; header: string }[] {
  const tags: { index: number; header: string }[] = [];
  const open = /<Button\b/g;

  let match: RegExpExecArray | null;

  while ((match = open.exec(source)) !== null) {
    let depth = 0;
    let end = -1;

    for (let i = match.index; i < source.length; i += 1) {
      const char = source[i];

      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) {
        end = i;
        break;
      }
    }

    if (end === -1) continue;

    tags.push({ index: match.index, header: source.slice(match.index, end) });
    open.lastIndex = end;
  }

  return tags;
}

/**
 * Regression guard for the bug that made product create/edit silently do
 * nothing.
 *
 * The Save button lived in the Modal footer, outside the <form>. It relied on
 * the HTML5 `form="product-form"` attribute to submit — and ALSO had
 * `onClick={closeForm}`. React dispatched the click handler first, which set
 * `showForm = false`; the Modal rendered `null`; the <form> unmounted; the
 * browser then had no form to submit and never fired `submit`. `saveProduct`
 * was never called, so no INSERT or UPDATE was ever sent to Supabase and the
 * modal just appeared to close.
 *
 * These assertions fail if that pattern is ever reintroduced.
 */
test("REGRESSION: no submit button also closes the form it submits", () => {
  const offenders: string[] = [];

  for (const file of readdirSync(PAGES_DIR).filter((f) => f.endsWith(".tsx"))) {
    for (const tag of buttonTags(readPage(file))) {
      if (!tag.header.includes('type="submit"')) continue;
      if (tag.header.includes("onClick=")) {
        offenders.push(`${file}: ${tag.header.replace(/\s+/g, " ")}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `submit buttons must not carry onClick:\n${offenders.join("\n")}`
  );
});

test("REGRESSION: the product form and its submit button stay connected", () => {
  const products = readPage("Products.tsx");

  assert.match(
    products,
    /<form id="product-form"[\s\S]*?onSubmit=\{saveProduct\}/,
    "product form must keep its id and onSubmit handler"
  );

  assert.match(
    products,
    /type="submit"[\s\S]{0,120}?form="product-form"/,
    "the save button must submit product-form"
  );
});

test("REGRESSION: saveProduct performs a real write on both paths", () => {
  const products = readPage("Products.tsx");

  // Edit path.
  assert.match(
    products,
    /\.from\("products"\)[\s\S]{0,40}?\.update\(productDetails\)/,
    "edit path must issue an UPDATE"
  );

  // Create path.
  assert.match(
    products,
    /insertOwned\(\s*"products"/,
    "create path must issue an INSERT"
  );
});

test("REGRESSION: writes report their outcome instead of failing silently", () => {
  const products = readPage("Products.tsx");

  // Both write paths must destructure the error and handle it.
  assert.match(
    products,
    /const \{[^}]*error: updateError[^}]*\} = await supabase/,
    "update result must be checked"
  );

  assert.match(
    products,
    /if \(updateError\)/,
    "update failure must surface a toast"
  );

  assert.match(
    products,
    /if \(insertError\)/,
    "insert failure must surface a toast"
  );

  assert.match(
    products,
    /const \{[^}]*error: insertError[^}]*\} = await insertOwned/,
    "insert result must be checked"
  );
});

test("REGRESSION: an edit that matched no row is reported, not claimed as success", () => {
  const products = readPage("Products.tsx");

  /**
   * PostgREST returns `error: null` with zero affected rows when an UPDATE is
   * filtered out by RLS. The previous code reported success in that case, so
   * the UI claimed a save that never happened. The update must therefore use
   * `.select()` and verify a row came back.
   */
  assert.match(
    products,
    /\.update\(productDetails\)\s*\.eq\("id", editingId\)\s*\.select\(/,
    "update must select the affected row so a 0-row update is detectable"
  );

  assert.match(
    products,
    /updatedRows\.length === 0/,
    "a 0-row update must be reported to the user"
  );
});

test("all page forms declare a matching submit entry point", () => {
  const forms: string[] = [];

  for (const file of readdirSync(PAGES_DIR).filter((f) => f.endsWith(".tsx"))) {
    const source = readPage(file);

    for (const match of source.matchAll(/<form[^>]*id="([^"]+)"[^>]*onSubmit=\{([^}]+)\}/g)) {
      forms.push(`${file}:${match[1]} -> ${match[2]}`);
    }
  }

  assert.ok(forms.length > 0, "expected at least one identified form");

  assert.ok(
    forms.some((entry) => entry.includes("product-form -> saveProduct")),
    "product-form must be wired to saveProduct"
  );
});

/**
 * A PostgREST mutation that matches zero rows returns `error: null`. Under a
 * Row Level Security policy that filters the row out, UPDATE and DELETE
 * therefore look exactly like success. Every mutation must `.select()` the
 * affected rows so a 0-row result can be reported instead of hidden.
 */
test("REGRESSION: no UPDATE or DELETE can report success on zero rows", () => {
  const offenders: string[] = [];

  for (const file of readdirSync(PAGES_DIR).filter((f) => f.endsWith(".tsx"))) {
    const source = readPage(file);

    // Find every `.update(` / `.delete(` chain up to its `.eq(`.
    const chains = source.matchAll(/\.(update|delete)\([\s\S]{0,120}?\.eq\([^)]*\)([^;]*);/g);

    for (const chain of chains) {
      const [full, kind] = chain;

      if (!full.includes('.select(')) {
        offenders.push(`${file}: ${kind} without .select() -> ${full.replace(/\s+/g, " ")}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `mutations must .select() their affected rows:\n${offenders.join("\n")}`
  );
});

test("REGRESSION: zero-row results are surfaced, not treated as success", () => {
  const offenders: string[] = [];

  for (const file of readdirSync(PAGES_DIR).filter((f) => f.endsWith(".tsx"))) {
    const source = readPage(file);

    // Only judge files that actually perform a row-targeted mutation.
    const mutations = [...source.matchAll(/\.(update|delete)\([\s\S]{0,140}?\.eq\([^)]*\)[^;]*;/g)];

    if (mutations.length === 0) continue;

    // Every one of them must select the affected rows...
    const selects = mutations.filter((m) => m[0].includes(".select("));

    if (selects.length !== mutations.length) {
      offenders.push(`${file}: ${mutations.length - selects.length}/${mutations.length} mutations lack .select()`);
      continue;
    }

    // ...and the file must actually inspect the row count somewhere.
    if (!/updatedRows|deletedRows|affectedRows|length === 0/.test(source)) {
      offenders.push(`${file}: selects affected rows but never checks the count`);
    }
  }

  assert.deepEqual(offenders, []);
});