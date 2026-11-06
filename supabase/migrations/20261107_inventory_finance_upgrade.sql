-- ============================================================================
-- Smart Inventory — finance upgrade migration
--
-- Safe / non-destructive: adds missing columns, one new table and three
-- transactional RPC functions. No data is deleted, renamed or retyped.
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
UPDATE public.sales s
SET unit_price   = ROUND(s.total_amount / NULLIF(s.quantity, 0), 2),
    unit_cost    = pu.purchase_price,
    product_name = pu.name,
    discount     = 0
FROM public.products pu
WHERE s.product_id = pu.id
  AND (s.unit_price IS NULL
       OR s.unit_cost IS NULL
       OR s.product_name IS NULL);

-- ----------------------------------------------------------------------------
-- 2. Customer payments ledger
--
-- Every payment recorded against a customer is preserved here. A payment
-- reduces the outstanding balance of real sales; it must NEVER be counted as
-- a new sale or as new profit anywhere in the app.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  customer_id bigint NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  sale_id    bigint REFERENCES public.sales (id) ON DELETE CASCADE,
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

DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
CREATE POLICY "payments_select_own" ON public.payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "payments_insert_own" ON public.payments;
CREATE POLICY "payments_insert_own" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "payments_delete_own" ON public.payments;
CREATE POLICY "payments_delete_own" ON public.payments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. Atomic sale + stock deduction
--
-- Creates the sale and debits the product's stock inside ONE transaction:
--   * the product row is locked (no double deduction from concurrent saves),
--   * stock is validated server-side (no negative inventory, ever),
--   * unit cost and product name are captured at the time of the sale,
--   * subtotal / discount / final / due are recomputed server-side so the
--     frontend can never write inconsistent money figures.
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
  v_user       uuid := auth.uid();
  v_requested  numeric := ROUND(COALESCE(p_amount, 0), 2);
  v_remaining  numeric;
  v_outstanding numeric;
  v_open       record;
  v_alloc      numeric;
  v_applied    jsonb := '[]'::jsonb;
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
      ROUND(v_open.total_amount - v_open.paid_amount, 2),
      v_remaining
    );

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

  RETURN jsonb_build_object(
    'requested', v_requested,
    'applied', v_applied,
    'unallocated', v_remaining
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Delete a sale and restore its stock, atomically
--
-- Deleting is a reversal, not a stock guess: the product's stock is returned
-- exactly once, and any payments allocated to the sale are removed together
-- with it (ON DELETE CASCADE), keeping dues consistent.
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
