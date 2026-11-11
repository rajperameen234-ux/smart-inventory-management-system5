import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../supabase";
import { useToast } from "./Toast";
import { applyActiveCurrency } from "../lib/format";
import {
  BASE_CURRENCY,
  convertFromPkrPrecise,
  convertToPkr,
  isCurrencyCode,
  isValidRate,
  pkrPerUnitFromApiRates,
  resolvePkrPerUnit,
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
  type CurrencyRates,
} from "../lib/currency";

/**
 * Global display currency.
 *
 * One provider owns the shopkeeper's selected display currency, the
 * exchange rates that convert it, and per-user persistence. Every page reads
 * it through `useCurrency()` and every money formatter mirrors the selection
 * through `applyActiveCurrency`, so switching the currency re-renders the
 * whole app immediately — no page refresh involved.
 *
 * Persistence:
 *   - `si.currency.selection`  — map of { storageKey -> currency code }, one
 *     bucket per signed-in shopkeeper (user id) plus a "default" bucket used
 *     while signed out (seeded from the legacy Settings preference).
 *   - `si.currency.rates`      — cached fetched rates, manual overrides and
 *     the time of the last successful fetch.
 */
const SELECTION_KEY = "si.currency.selection";
const RATES_KEY = "si.currency.rates";
const LEGACY_SETTINGS_KEY = "si.settings";

/** Free, key-less exchange-rate API queried with PKR as the base. */
const RATES_API_URL = "https://open.er-api.com/v6/latest/PKR";
const RATES_FETCH_TIMEOUT_MS = 10_000;

type StoredRates = {
  fetchedAt: number | null;
  rates: CurrencyRates;
  manualRates: CurrencyRates;
};

type SelectionMap = Record<string, CurrencyCode>;

const DEFAULT_RATES: StoredRates = {
  fetchedAt: null,
  rates: {},
  manualRates: {},
};

/** Storage bucket for the current viewer: per user when signed in. */
const ANONYMOUS_BUCKET = "default";

function userBucket(userId: string | null): string {
  return userId ? `user:${userId}` : ANONYMOUS_BUCKET;
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);

    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); preferences simply do not
    // persist — the app keeps working with in-memory state.
  }
}

/** Load the stored selection map, migrating the legacy Settings preference. */
function loadSelection(): SelectionMap {
  const stored = readJson<SelectionMap>(SELECTION_KEY);
  const selection: SelectionMap =
    stored && typeof stored === "object" ? { ...stored } : {};

  if (!selection[ANONYMOUS_BUCKET]) {
    // Legacy migration: the old Settings page saved `currency` inside
    // `si.settings`. Carry that choice forward once instead of resetting it.
    const legacy = readJson<{ currency?: unknown }>(LEGACY_SETTINGS_KEY);

    if (legacy && isCurrencyCode(legacy.currency)) {
      selection[ANONYMOUS_BUCKET] = legacy.currency;
    }
  }

  return selection;
}

function loadStoredRates(): StoredRates {
  const stored = readJson<Partial<StoredRates>>(RATES_KEY);

  if (!stored) return DEFAULT_RATES;

  return {
    fetchedAt:
      typeof stored.fetchedAt === "number" ? stored.fetchedAt : null,
    rates:
      stored.rates && typeof stored.rates === "object"
        ? (stored.rates as CurrencyRates)
        : {},
    manualRates:
      stored.manualRates && typeof stored.manualRates === "object"
        ? (stored.manualRates as CurrencyRates)
        : {},
  };
}

type RateStatus = "base" | "manual" | "fetched" | "missing";

export type CurrencyContextValue = {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  /** Effective PKR-per-unit rate for the selection; 1 for PKR, null if missing. */
  pkrPerUnit: number | null;
  /** True when a non-PKR currency is selected but no usable rate exists. */
  rateMissing: boolean;
  rateStatus: RateStatus;
  rates: CurrencyRates;
  manualRates: CurrencyRates;
  ratesUpdatedAt: number | null;
  ratesError: string;
  ratesLoading: boolean;
  refreshRates: () => Promise<boolean>;
  setManualRate: (code: CurrencyCode, value: number | null) => void;
  /** Display -> base (PKR); identity when PKR or the rate is unavailable. */
  toPkr: (displayAmount: number) => number;
  /** Base (PKR) -> display, precise enough to round-trip a form field. */
  toDisplay: (pkrAmount: number) => number;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const toast = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionMap>(loadSelection);
  const [ratesState, setRatesState] = useState<StoredRates>(loadStoredRates);
  const [ratesError, setRatesError] = useState("");
  const [ratesLoading, setRatesLoading] = useState(false);
  const [initialised, setInitialised] = useState(false);

  // Avoid re-warning for the identical failure on every re-render.
  const lastWarning = useRef("");

  // Keep async callbacks honest about the latest state without making them
  // dependencies that change on every keystroke.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const ratesStateRef = useRef(ratesState);
  ratesStateRef.current = ratesState;

  const bucket = userBucket(userId);
  const currency: CurrencyCode = isCurrencyCode(selection[bucket])
    ? selection[bucket]
    : (selection[ANONYMOUS_BUCKET] ?? BASE_CURRENCY);

  const setCurrency = useCallback(
    (code: CurrencyCode) => {
      setSelection((current) => {
        const next = { ...current, [userBucket(userIdRef.current)]: code };

        writeJson(SELECTION_KEY, next);

        return next;
      });

      if (code !== BASE_CURRENCY) {
        const manual = ratesStateRef.current.manualRates[code];
        const fetched = ratesStateRef.current.rates[code];
        const resolved = resolvePkrPerUnit(
          code,
          ratesStateRef.current.rates,
          ratesStateRef.current.manualRates
        );

        if (resolved === null) {
          toast.error(
            "Exchange rate unavailable",
            `${code} is selected but no exchange rate could be resolved${
              manual === undefined && fetched === undefined
                ? " — refresh rates or set one manually in Settings."
                : "."
            } Amounts stay in PKR until a rate is available.`
          );
        }
      }
    },
    [toast]
  );

  const fetchRates = useCallback(async (): Promise<boolean> => {
    setRatesLoading(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      RATES_FETCH_TIMEOUT_MS
    );

    try {
      const response = await fetch(RATES_API_URL, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Exchange-rate service responded ${response.status}.`);
      }

      const payload = (await response.json()) as {
        result?: string;
        rates?: Record<string, unknown>;
      };

      if (payload.result && payload.result !== "success") {
        throw new Error(`Exchange-rate service reported "${payload.result}".`);
      }

      const rates = pkrPerUnitFromApiRates(payload.rates);

      const useful = SUPPORTED_CURRENCIES.filter(
        (info) => info.code !== BASE_CURRENCY && isValidRate(rates[info.code])
      );

      if (useful.length === 0) {
        throw new Error("The exchange-rate response contained no usable rates.");
      }

      setRatesError("");
      lastWarning.current = "";
      setRatesState((current) => {
        const next: StoredRates = {
          fetchedAt: Date.now(),
          rates,
          manualRates: current.manualRates,
        };

        writeJson(RATES_KEY, next);

        return next;
      });

      return true;
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.name === "AbortError"
            ? "The exchange-rate request timed out."
            : caught.message
          : "Could not reach the exchange-rate service.";

      setRatesError(message);

      if (lastWarning.current !== message) {
        lastWarning.current = message;
        toast.error("Exchange rates unavailable", message);
      }

      return false;
    } finally {
      window.clearTimeout(timeout);
      setRatesLoading(false);
    }
  }, [toast]);

  // Track the signed-in shopkeeper so each user gets an independent currency
  // preference that survives reloads, sign-outs and sign-ins.
  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUserId(data.user?.id ?? null);
        setInitialised(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user?.id ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Re-resolve the selection for the current viewer whenever the bucket
  // changes (sign-in/sign-out switches the per-user preference). A signed-in
  // user without their own choice inherits the pre-sign-in selection once.
  useEffect(() => {
    if (!initialised) return;

    if (
      !isCurrencyCode(selection[bucket]) &&
      isCurrencyCode(selection[ANONYMOUS_BUCKET])
    ) {
      setCurrency(selection[ANONYMOUS_BUCKET]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bucket changes only with identity
  }, [bucket, initialised]);

  // Fetch rates once on mount when any non-base currency can be displayed.
  useEffect(() => {
    const stored = loadStoredRates();

    const hasCache =
      stored.fetchedAt !== null &&
      SUPPORTED_CURRENCIES.some(
        (info) => info.code !== BASE_CURRENCY && isValidRate(stored.rates[info.code])
      );

    const needsRate = SUPPORTED_CURRENCIES.some(
      (info) =>
        info.code !== BASE_CURRENCY &&
        resolvePkrPerUnit(info.code, stored.rates, stored.manualRates) === null
    );

    if (needsRate || !hasCache) void fetchRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const pkrPerUnit = useMemo(
    () => resolvePkrPerUnit(currency, ratesState.rates, ratesState.manualRates),
    [currency, ratesState]
  );

  const rateMissing = currency !== BASE_CURRENCY && pkrPerUnit === null;
  const effectiveRate = pkrPerUnit ?? 1;

  const rateStatus: RateStatus =
    currency === BASE_CURRENCY
      ? "base"
      : pkrPerUnit === null
        ? "missing"
        : isValidRate(ratesState.manualRates[currency])
          ? "manual"
          : "fetched";

  /**
   * Mirror the selection into the module state used by `formatMoney` /
   * `formatCompactMoney` BEFORE children render, so every page below the
   * provider formats with the currency the user just picked. Idempotent
   * assignment — safe to run on every render pass.
   */
  applyActiveCurrency({
    code: currency,
    pkrPerUnit: effectiveRate,
    rateMissing,
  });

  const setManualRate = useCallback((code: CurrencyCode, value: number | null) => {
    setRatesState((current) => {
      const manualRates = { ...current.manualRates };

      if (value === null || !isValidRate(value)) delete manualRates[code];
      else manualRates[code] = value;

      const next: StoredRates = { ...current, manualRates };

      writeJson(RATES_KEY, next);

      return next;
    });
  }, []);

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      setCurrency,
      pkrPerUnit,
      rateMissing,
      rateStatus,
      rates: ratesState.rates,
      manualRates: ratesState.manualRates,
      ratesUpdatedAt: ratesState.fetchedAt,
      ratesError,
      ratesLoading,
      refreshRates: fetchRates,
      setManualRate,
      toPkr: (displayAmount: number) => convertToPkr(displayAmount, effectiveRate),
      toDisplay: (pkrAmount: number) =>
        convertFromPkrPrecise(pkrAmount, effectiveRate),
    }),
    [
      currency,
      setCurrency,
      pkrPerUnit,
      rateMissing,
      rateStatus,
      ratesState,
      ratesError,
      ratesLoading,
      fetchRates,
      setManualRate,
      effectiveRate,
    ]
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext);

  if (!context) {
    throw new Error("useCurrency must be used inside <CurrencyProvider>.");
  }

  return context;
}
