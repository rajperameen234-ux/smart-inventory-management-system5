-- ============================================================================
-- Smart Inventory — finance upgrade migration
--
-- Safe / non-destructive: adds missing columns, one new table, three
-- transactional RPC functions, two foreign-key normalisations and a one-time
-- payments backfill. No data is deleted, renamed or retyped.
--
-- HOW TO APPLY: paste this whole file into the Supabase SQL Editor and run it.
-- (The publishable/anon key cannot run DDL, so this must be applied once by
-- the shop owner / admin from the Supabase dashboard.)
--
-- Idempotent: every statement can be re-run without damage.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Historical sale prices
--
-- `sales.total_amount` stays the FINAL amount after discount (as before).
-- The new columns freeze the prices that were true at the moment of the sale,
-- so later edits to a product's current purchase/selling price can never
-- rewrite profit for old transactions.
-- ----------------------------------------------------------------------------
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS unit_price   numeric(12,2);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS unit_cost    numeric(12,2);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS discount     numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS product_name text;

-- Best-effort snapshot for sales recorded BEFORE this migration: the effective
-- unit price derived from the stored total, and the product's purchase price
-- at migration time (the only historical figure that exists for those rows).
--
-- Every snapshot column is wrapped in COALESCE so a row keeps whatever value
-- it already had: an existing non-NULL unit_price, unit_cost, product_name or
-- discount is NEVER overwritten and no financial record is destructively
-- touched.
UPDATE public.sales s
SET unit_price   = COALESCE(
      s.unit_price,
      ROUND(s.total_amount / NULLIF(s.quantity, 0), 2)
    ),
    unit_cost    = COALESCE(s.unit_cost, pu.purchase_price),
    product_name = COALESCE(s.product_name, pu.name),
    discount     = COALESCE(s.discount, 0)
FROM public.products pu
WHERE s.product_id = pu.id
  AND (s.unit_price IS NULL
       OR s.unit_cost IS NULL
       OR s.product_name IS NULL
       OR s.discount IS NULL);

-- ----------------------------------------------------------------------------
-- 2. Customer payments ledger
--
-- Every payment recorded against a customer is preserved here. A payment
-- reduces the outstanding balance of real sales; it must NEVER be counted as
-- a new sale or as new profit anywhere in the app.
--
-- The ledger is append-only from the client's point of view: payment rows are
-- written exclusively by the record_customer_payment function, so payment
-- history cannot be created, altered or erased from the browser.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  customer_id bigint NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  sale_id    bigint REFERENCES public.sales (id) ON DELETE SET NULL,
  amount     numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_at    date NOT NULL DEFAULT CURRENT_DATE,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_customer_idx
  ON public.payments (customer_id, paid_at);

CREATE INDEX IF NOT EXISTS payments_user_idx
  ON public.payments (user_id, created_at);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- SELECT: read access is owner-scoped — every user only ever sees their own
-- payment history.
DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
CREATE POLICY "payments_select_own" ON public.payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT / DELETE removed (older file versions created both):
--   * direct client INSERTs would bypass the server-side validation,
--     FIFO allocation and per-customer affordability check the
--     record_customer_payment function enforces, and could not safely
--     verify that customer_id / sale_id belong to the caller;
--   * direct client DELETEs would let users erase payment history,
--     defeating the audit trail.
-- The function keeps working because SECURITY DEFINER runs it as the table
-- owner, which is not subject to these row-level or privilege checks.
DROP POLICY IF EXISTS "payments_insert_own" ON public.payments;
DROP POLICY IF EXISTS "payments_delete_own" ON public.payments;

-- Privilege belt-and-braces so the intent holds even if row-level security
-- is ever switched off by accident: anon gets nothing, authenticated clients
-- may only SELECT. The database performs the customer-cascade delete of
-- payment rows internally (referential action), which does not require these
-- privileges, so deleting a customer keeps working.
REVOKE ALL ON public.payments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated;
GRANT SELECT ON public.payments TO authenticated;

-- ----------------------------------------------------------------------------
-- 2a. Keep payment history when a sale is deleted (FK normalisation)
--
-- payments.sale_id used to remove its payment rows together with a deleted
-- sale, which erased the evidence that the money was ever collected. The
-- relationship is normalised to ON DELETE SET NULL:
--   * deleting a sale keeps every payments row as audit history; only the
--     sale link is cleared (sale_id becomes NULL),
--   * dues stay correct because they are computed from the sales table,
--     which loses the deleted row entirely,
--   * the React app never joins payments to sales (it selects only
--     id, customer_id, amount, paid_at, note), so a NULL sale_id is safe.
-- On a database where an earlier version of this file already created the
-- table with a CASCADE rule, the constraint is upgraded in place. On a fresh
-- database the CREATE TABLE above already used SET NULL and this block
-- becomes a no-op, which keeps the whole file idempotent.
-- ----------------------------------------------------------------------------
DO $payments_fk_fix$
DECLARE
  v_delete_action "char";
BEGIN
  IF to_regclass('public.payments') IS NULL
     OR to_regclass('public.sales') IS NULL THEN
    RETURN;
  END IF;

  SELECT con.confdeltype INTO v_delete_action
  FROM pg_constraint con
  WHERE con.contype = 'f'
    AND con.conrelid = 'public.payments'::regclass
    AND con.confrelid = 'public.sales'::regclass
    AND con.conname = 'payments_sale_id_fkey'
    AND con.conkey = ARRAY[(
          SELECT att.attnum FROM pg_attribute att
          WHERE att.attrelid = 'public.payments'::regclass
            AND att.attname = 'sale_id'
        )]::smallint[]
    AND con.confkey = ARRAY[(
          SELECT catt.attnum FROM pg_attribute catt
          WHERE catt.attrelid = 'public.sales'::regclass
            AND catt.attname = 'id'
        )]::smallint[];

  -- ("n" = SET NULL): nothing to do when the rule is already correct, and
  -- never touch a constraint this file did not create (rule name unknown).
  IF v_delete_action IS NULL OR v_delete_action = 'n' THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.payments DROP CONSTRAINT payments_sale_id_fkey';
  EXECUTE 'ALTER TABLE public.payments ADD CONSTRAINT payments_sale_id_fkey '
          'FOREIGN KEY (sale_id) REFERENCES public.sales (id) '
          'ON DELETE SET NULL';
END
$payments_fk_fix$;

-- ----------------------------------------------------------------------------
-- 2b. Deleting a customer must never silently delete their sales
--     ( foreign-key normalisation )
--
-- The app already refuses to delete a customer who has recorded sales, but
-- only a database rule can guarantee the same protection for direct deletes
-- from the Supabase dashboard or any other tool. Every single-column foreign
-- key from sales.customer_id to customers.id is inspected:
--   * ON DELETE CASCADE  -> dropped, then recreated below as RESTRICT (the
--     only rule that must be corrected),
--   * NO ACTION, RESTRICT, SET NULL -> left untouched, other tools may have
--     chosen them deliberately,
--   * no foreign key at all -> one is added as RESTRICT, unless the data
--     currently contains orphaned sales (no matching customer row), in which
--     case the file exits with a WARNING instead of failing the migration.
-- Every customer/sale row is preserved; only dangerous delete rules change.
-- ----------------------------------------------------------------------------
DO $sales_fk_fix$
DECLARE
  v_fk        record;
  v_total     int := 0;
  v_cascades  int := 0;
  v_survivors int;
  v_orphans   bigint := 0;
  v_name_taken boolean;
BEGIN
  IF to_regclass('public.sales') IS NULL
     OR to_regclass('public.customers') IS NULL THEN
    RETURN;
  END IF;

  FOR v_fk IN
    SELECT con.conname, con.confdeltype
    FROM pg_constraint con
    WHERE con.contype = 'f'
      AND con.conrelid = 'public.sales'::regclass
      AND con.confrelid = 'public.customers'::regclass
      AND con.conkey = ARRAY[(
            SELECT att.attnum FROM pg_attribute att
            WHERE att.attrelid = 'public.sales'::regclass
              AND att.attname = 'customer_id'
          )]::smallint[]
      AND con.confkey = ARRAY[(
            SELECT catt.attnum FROM pg_attribute catt
            WHERE catt.attrelid = 'public.customers'::regclass
              AND catt.attname = 'id'
          )]::smallint[]
  LOOP
    v_total := v_total + 1;

    IF v_fk.confdeltype = 'c' THEN
      v_cascades := v_cascades + 1;
      EXECUTE format(
        'ALTER TABLE public.sales DROP CONSTRAINT %I', v_fk.conname
      );
    END IF;
  END LOOP;

  v_survivors := v_total - v_cascades;

  -- A non-cascading rule already guards the relationship: leave other
  -- tools' choices alone.
  IF v_survivors > 0 THEN
    RETURN;
  END IF;

  SELECT COUNT(*) > 0 INTO v_name_taken
  FROM pg_constraint
  WHERE conrelid = 'public.sales'::regclass
    AND conname = 'sales_customer_id_fkey';

  IF v_name_taken THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_orphans
  FROM public.sales s
  WHERE s.customer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.customers c WHERE c.id = s.customer_id
    );

  IF v_orphans > 0 THEN
    RAISE WARNING
      'Sales rows without a matching customer (% row(s)) prevent adding the sales-customers foreign key. Clean up the orphaned rows and re-apply the file; nothing else in this migration was harmed.',
      v_orphans;
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.sales ADD CONSTRAINT sales_customer_id_fkey '
          'FOREIGN KEY (customer_id) REFERENCES public.customers (id) '
          'ON DELETE RESTRICT';
END
$sales_fk_fix$;

-- ----------------------------------------------------------------------------
-- 2c. Capture historical initial payments in the ledger (one-time backfill)
--
-- Sales recorded before this fix kept their initial payment only inside
-- sales.paid_amount; the payments ledger never saw that cash. This adds the
-- missing entries so payment history reflects every amount actually collected:
--   * a sale whose ledger rows already cover paid_total -> nothing inserted,
--   * a sale short by X -> exactly X inserted, capped so the ledger can
--     never exceed the sale's billed total even for corrupt rows,
--   * unpaid sales and rows missing user/customer links -> nothing inserted,
--   * rows belonging to deleted sales (payments.sale_id IS NULL) are
--     historical evidence and are never re-attributed.
-- Idempotent: a second run finds every sale already covered and inserts
-- nothing. Because it reconciles the ledger against paid_amount, re-applying
-- this whole file later also repairs history after direct client-side sale
-- edits (the cheapest interim repair until sale edits move behind a
-- database function).
-- ----------------------------------------------------------------------------
INSERT INTO public.payments (user_id, customer_id, sale_id, amount, paid_at, note)
SELECT
  s.user_id,
  s.customer_id,
  s.id,
  LEAST(
    ROUND(COALESCE(s.paid_amount, 0), 2) - COALESCE(ledger.total, 0),
    ROUND(COALESCE(s.total_amount, 0), 2) - COALESCE(ledger.total, 0)
  ),
  COALESCE(s.sale_date, CURRENT_DATE),
  'Initial payment recorded at sale time (backfill)'
FROM public.sales s
LEFT JOIN (
  SELECT sale_id, ROUND(SUM(amount), 2) AS total
  FROM public.payments
  WHERE sale_id IS NOT NULL
  GROUP BY sale_id
) ledger ON ledger.sale_id = s.id
WHERE s.paid_amount > 0.009
  AND s.user_id IS NOT NULL
  AND s.customer_id IS NOT NULL
  AND LEAST(
        ROUND(COALESCE(s.paid_amount, 0), 2) - COALESCE(ledger.total, 0),
        ROUND(COALESCE(s.total_amount, 0), 2) - COALESCE(ledger.total, 0)
      ) > 0.009;

-- ----------------------------------------------------------------------------
-- 3. Atomic sale + stock deduction
--
-- Creates the sale and debits the product's stock inside ONE transaction:
--   * the product row is locked (no double deduction from concurrent saves),
--   * stock is validated server-side (no negative inventory, ever),
--   * unit cost and product name are captured at the time of the sale,
--   * subtotal / discount / final / due are recomputed server-side so the
--     frontend can never write inconsistent money figures,
--   * any cash the customer hands over with the sale (the initial payment)
--     is written to the payments ledger inside the same transaction, so
--     payment history shows every collected amount.
-- Returns the new sale id (bigint). Raises on invalid input.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sale_with_stock(
  p_customer_id bigint,
  p_product_id  bigint,
  p_quantity    numeric,
  p_unit_price  numeric,
  p_discount    numeric DEFAULT 0,
  p_paid_amount numeric DEFAULT 0,
  p_sale_date   date DEFAULT CURRENT_DATE
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       uuid := auth.uid();
  v_product    record;
  v_qty        numeric := p_quantity;
  v_price      numeric := p_unit_price;
  v_discount   numeric := COALESCE(p_discount, 0);
  v_paid       numeric := COALESCE(p_paid_amount, 0);
  v_subtotal   numeric;
  v_total      numeric;
  v_due        numeric;
  v_sale_id    bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF v_qty IS NULL OR v_qty <> ROUND(v_qty) OR v_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a whole number greater than 0.';
  END IF;

  IF v_price IS NULL OR v_price < 0 THEN
    RAISE EXCEPTION 'Selling price cannot be negative.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = p_customer_id AND user_id = v_user
  ) THEN
    RAISE EXCEPTION 'Customer not found.';
  END IF;

  -- Serialize sale creation with payment recording for the same customer.
  -- The key and the lock ordering (ownership checks -> advisory lock ->
  -- row locks) exactly match record_customer_payment, so the payment
  -- function's affordability check and this function's stock arithmetic
  -- always see a settled state. Different customers and different users
  -- remain fully parallel.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_customer_id::text, 0)
  );

  -- Lock the product row so concurrent saves cannot double-deduct stock.
  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id AND user_id = v_user
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found.';
  END IF;

  IF COALESCE(v_product.stock, 0) < v_qty THEN
    RAISE EXCEPTION 'Only % unit(s) in stock.', COALESCE(v_product.stock, 0);
  END IF;

  v_subtotal := ROUND(v_price * v_qty, 2);
  v_discount := LEAST(GREATEST(v_discount, 0), v_subtotal);
  v_total    := ROUND(v_subtotal - v_discount, 2);
  v_paid     := LEAST(GREATEST(v_paid, 0), v_total);
  v_due      := ROUND(v_total - v_paid, 2);

  INSERT INTO public.sales (
    user_id, customer_id, product_id, quantity,
    total_amount, paid_amount, due_amount, sale_date,
    unit_price, unit_cost, discount, product_name
  ) VALUES (
    v_user, p_customer_id, p_product_id, v_qty,
    v_total, v_paid, v_due, p_sale_date,
    ROUND(v_price, 2), v_product.purchase_price, v_discount, v_product.name
  )
  RETURNING id INTO v_sale_id;

  UPDATE public.products
  SET stock = COALESCE(stock, 0) - v_qty
  WHERE id = p_product_id AND user_id = v_user;

  -- Audit ledger: the cash collected at sale time is recorded exactly once,
  -- inside the same transaction as the sale itself. Later collections of the
  -- remaining dues are logged separately by record_customer_payment and can
  -- never overlap this amount, because they only cover due_amount, which
  -- already excludes this initial payment.
  IF v_paid > 0.009 THEN
    INSERT INTO public.payments (user_id, customer_id, sale_id, amount, paid_at, note)
    VALUES (
      v_user,
      p_customer_id,
      v_sale_id,
      v_paid,
      p_sale_date,
      'Initial payment recorded at sale time'
    );
  END IF;

  RETURN v_sale_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Record a customer payment (FIFO allocation)
--
-- Allocates the payment against the customer's oldest open sales, updating
-- paid/due amounts and logging one payments row per allocation. All inside a
-- single transaction. Refuses amounts that exceed the outstanding balance
-- and zero/negative payments. A payment changes collections and dues ONLY —
-- it must never be reported as a sale or as profit.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_customer_payment(
  p_customer_id bigint,
  p_amount      numeric,
  p_paid_at     date DEFAULT CURRENT_DATE,
  p_note        text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        uuid := auth.uid();
  v_requested   numeric := ROUND(COALESCE(p_amount, 0), 2);
  v_remaining   numeric;
  v_outstanding numeric;
  v_open        record;
  v_alloc       numeric;
  v_applied     jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF v_requested <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than 0.';
  END IF;

  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'Select the payment date.';
  END IF;

  -- The customer must belong to the calling user.
  IF NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = p_customer_id AND user_id = v_user
  ) THEN
    RAISE EXCEPTION 'Customer not found.';
  END IF;

  -- ------------------------------------------------------------------
  -- Concurrency guard: serialize payment processing per customer.
  --
  -- A transaction-level advisory lock is held until this transaction
  -- commits or rolls back, so two simultaneous payments for the same
  -- customer can never interleave their FIFO allocations, cannot both
  -- pass the affordability check against stale data, and cannot
  -- overpay. The lock key is scoped to (user, customer): different
  -- customers and different users still process in parallel.
  -- ------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_customer_id::text, 0)
  );

  -- The outstanding balance is recalculated AFTER the lock, so it sees
  -- every committed payment and every sale for this customer.
  SELECT COALESCE(SUM(due_amount), 0) INTO v_outstanding
  FROM public.sales
  WHERE user_id = v_user AND customer_id = p_customer_id;

  IF v_requested > ROUND(v_outstanding, 2) THEN
    RAISE EXCEPTION 'Payment (Rs. %) exceeds the outstanding balance (Rs. %).',
      v_requested, ROUND(v_outstanding, 2);
  END IF;

  v_remaining := v_requested;

  FOR v_open IN
    SELECT id, total_amount, paid_amount
    FROM public.sales
    WHERE user_id = v_user
      AND customer_id = p_customer_id
      AND due_amount > 0.009
    ORDER BY sale_date NULLS LAST, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0.009;

    v_alloc := LEAST(
      ROUND(
        COALESCE(v_open.total_amount, 0) - COALESCE(v_open.paid_amount, 0),
        2
      ),
      v_remaining
    );

    -- Guard against corrupt rows: a zero allocation must abort the
    -- whole payment instead of writing a payments row the amount CHECK
    -- would reject half-way through.
    IF v_alloc <= 0.009 THEN
      RAISE EXCEPTION 'Sale % has inconsistent amounts; payment aborted.', v_open.id;
    END IF;

    UPDATE public.sales
    SET paid_amount = ROUND(paid_amount + v_alloc, 2),
        due_amount  = ROUND(total_amount - paid_amount - v_alloc, 2)
    WHERE id = v_open.id;

    INSERT INTO public.payments (user_id, customer_id, sale_id, amount, paid_at, note)
    VALUES (v_user, p_customer_id, v_open.id, v_alloc, p_paid_at, p_note);

    v_applied := v_applied || jsonb_build_object(
      'sale_id', v_open.id, 'amount', v_alloc
    );

    v_remaining := ROUND(v_remaining - v_alloc, 2);
  END LOOP;

  -- ------------------------------------------------------------------
  -- All-or-nothing: the payment is either fully allocated or fully
  -- rejected. Raising here rolls back EVERY sales update and payments
  -- row written by this call, so a partial allocation is never
  -- committed and an unallocated remainder can never be returned.
  -- ------------------------------------------------------------------
  IF v_remaining > 0.009 THEN
    RAISE EXCEPTION 'Payment (Rs. %) could not be fully allocated; outstanding balance changed.', v_requested;
  END IF;

  RETURN jsonb_build_object(
    'requested', v_requested,
    'applied', v_applied
  );
END;
$$;
-- ----------------------------------------------------------------------------
-- 5. Delete a sale and restore its stock, atomically
--
-- Deleting is a reversal, not a stock guess: the product's stock is returned
-- exactly once. Payment rows that belong to the sale (the initial payment
-- logged at sale time and any FIFO collection allocations) are NOT deleted:
-- payments.sale_id uses ON DELETE SET NULL, so the ledger keeps the evidence
-- that money was collected (with the sale link cleared), while dues stay
-- consistent because they are derived from the sales table alone.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_sale_and_restock(
  p_sale_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_sale  record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id AND user_id = v_user
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found.';
  END IF;

  UPDATE public.products
  SET stock = COALESCE(stock, 0) + v_sale.quantity
  WHERE id = v_sale.product_id AND user_id = v_user;

  DELETE FROM public.sales WHERE id = p_sale_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Function permissions
--
-- Definer functions bypass RLS, so they are restricted to authenticated users
-- only (every anon call fails immediately).
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_sale_with_stock(bigint, bigint, numeric, numeric, numeric, numeric, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_customer_payment(bigint, numeric, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_sale_and_restock(bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_sale_with_stock(bigint, bigint, numeric, numeric, numeric, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_customer_payment(bigint, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sale_and_restock(bigint) TO authenticated;
