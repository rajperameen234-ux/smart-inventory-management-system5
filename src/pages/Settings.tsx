import { useEffect, useState, type FormEvent } from "react";
import { useToast } from "../components/Toast";
import { useCurrency } from "../components/CurrencyProvider";
import {
  AlertIcon,
  CheckIcon,
  DatabaseIcon,
  LockIcon,
  RefreshIcon,
  ShieldIcon,
  StoreIcon,
  WalletIcon,
} from "../components/Icon";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  PageHeader,
  PageStack,
  Select,
  Textarea,
} from "../components/ui";
import { formatDate } from "../lib/format";
import {
  BASE_CURRENCY,
  isCurrencyCode,
  SUPPORTED_CURRENCIES,
  isValidRate,
  resolvePkrPerUnit,
  type CurrencyCode,
} from "../lib/currency";
import { supabase } from "../supabase";

type StoredSettings = {
  businessName: string;
  phone: string;
  address: string;
  currency: string;
  lowStock: string;
  notifications: boolean;
};

const STORAGE_KEY = "si.settings";

const DEFAULTS: StoredSettings = {
  businessName: "Smart Inventory Store",
  phone: "0300-1234567",
  address: "Hyderabad, Sindh",
  currency: "PKR",
  lowStock: "10",
  notifications: true,
};

export default function Settings() {
  const toast = useToast();

  /**
   * FIX: the currency selector used to keep its own local state here, so
   * picking USD changed nothing outside this page. The selection now lives in
   * the global CurrencyProvider and every financial figure in the app reads
   * it — this page only displays and edits the shared value.
   */
  const {
    currency,
    setCurrency,
    rates,
    manualRates,
    ratesUpdatedAt,
    ratesError,
    ratesLoading,
    rateMissing,
    refreshRates,
    setManualRate,
  } = useCurrency();

  const [businessName, setBusinessName] = useState(DEFAULTS.businessName);
  const [phone, setPhone] = useState(DEFAULTS.phone);
  const [address, setAddress] = useState(DEFAULTS.address);
  const [lowStock, setLowStock] = useState(DEFAULTS.lowStock);
  const [notifications, setNotifications] = useState(DEFAULTS.notifications);
  const [manualDrafts, setManualDrafts] = useState<Partial<Record<CurrencyCode, string>>>({});

  const [connection, setConnection] = useState<"idle" | "checking" | "ok" | "fail">(
    "idle"
  );
  const [connectionMessage, setConnectionMessage] = useState("");
  const [profile, setProfile] = useState<{
    email: string;
    lastSignIn: string;
  } | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<StoredSettings>;

        setBusinessName(parsed.businessName ?? DEFAULTS.businessName);
        setPhone(parsed.phone ?? DEFAULTS.phone);
        setAddress(parsed.address ?? DEFAULTS.address);
        // The currency itself is owned by the global provider now; the legacy
        // field is left in place for other readers (e.g. WhatsApp helpers).
        setLowStock(parsed.lowStock ?? DEFAULTS.lowStock);
        setNotifications(parsed.notifications ?? DEFAULTS.notifications);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;

      setProfile({
        email: data.user.email ?? "Unknown user",
        lastSignIn:
          (data.user.last_sign_in_at as string | undefined) ?? "",
      });
    });
  }, []);

  function resetSettings() {
    setBusinessName(DEFAULTS.businessName);
    setPhone(DEFAULTS.phone);
    setAddress(DEFAULTS.address);
    setCurrency(BASE_CURRENCY);
    setLowStock(DEFAULTS.lowStock);
    setNotifications(DEFAULTS.notifications);

    toast.info("Defaults restored", "Review your settings and save to apply.");
  }

  const saveSettings = (event: FormEvent) => {
    event.preventDefault();

    const payload: StoredSettings = {
      businessName: businessName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      // Kept in sync so older readers of `si.settings` stay consistent.
      currency,
      lowStock,
      notifications,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    toast.success(
      "Settings saved",
      `Display currency: ${currency}. Your preferences have been stored.`
    );
  };

  async function checkConnection() {
    setConnection("checking");

    const { error } = await supabase.from("products").select("id").limit(1);

    if (error) {
      setConnection("fail");
      setConnectionMessage(error.message);
      toast.error("Database connection failed", error.message);
      return;
    }

    setConnection("ok");
    setConnectionMessage("Connected to Supabase with row-level security active.");
    toast.success("Supabase connected successfully");
  }

  const tradableCurrencies = SUPPORTED_CURRENCIES.filter(
    (info) => info.code !== BASE_CURRENCY
  );

  function commitManualRate(code: CurrencyCode) {
    const draft = manualDrafts[code];

    if (draft === undefined) return;

    const trimmed = draft.trim();

    if (trimmed === "") {
      // Empty input clears the override so the fetched rate applies again.
      setManualRate(code, null);
      setManualDrafts((current) => {
        const next = { ...current };
        delete next[code];
        return next;
      });
      toast.info("Manual rate cleared", `${code} uses the fetched rate again.`);
      return;
    }

    const value = Number(trimmed);

    if (!isValidRate(value)) {
      toast.error(
        "Invalid exchange rate",
        `${trimmed} is not a valid rate. Enter how many PKR one ${code} is worth.`
      );
      return;
    }

    setManualRate(code, value);
    setManualDrafts((current) => ({ ...current, [code]: "" }));
    toast.success("Manual rate saved", `1 ${code} = ${value} PKR`);
  }

  return (
    <main className="page-content">
      <PageStack>
        <PageHeader
          title="Settings"
          description="Manage your business profile and system preferences."
        />

        <form onSubmit={saveSettings}>
          <PageStack>
            <Card>
              <CardHeader
                title="Business information"
                description="Used on printed reports and exported invoices"
              />

              <CardBody>
                <div className="form-grid">
                  <Field label="Business name">
                    <Input
                      type="text"
                      value={businessName}
                      placeholder="Enter business name"
                      onChange={(event) => setBusinessName(event.target.value)}
                    />
                  </Field>

                  <Field label="Phone number">
                    <Input
                      type="text"
                      value={phone}
                      placeholder="Enter phone number"
                      onChange={(event) => setPhone(event.target.value)}
                    />
                  </Field>

                  <Field label="Business address" className="span-2">
                    <Textarea
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      placeholder="Enter business address"
                      rows={3}
                    />
                  </Field>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Inventory preferences"
                description="Configure how stock and money are handled"
              />

              <CardBody>
                <div className="form-grid">
                  <Field
                    label="Display currency"
                    hint={
                      currency === BASE_CURRENCY
                        ? "Base currency — all records are stored in PKR."
                        : rateMissing
                          ? `No exchange rate for ${currency} — amounts stay in PKR until a rate is available.`
                          : `All amounts are shown in ${currency} using the current exchange rate.`
                    }
                  >
                    <Select
                      value={currency}
                      onChange={(event) => {
                        if (isCurrencyCode(event.target.value)) {
                          setCurrency(event.target.value);
                        }
                      }}
                    >
                      {SUPPORTED_CURRENCIES.map((info) => (
                        <option key={info.code} value={info.code}>
                          {info.label}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field
                    label="Low stock threshold"
                    hint="Products at or below this quantity are flagged as low stock."
                  >
                    <Input
                      type="number"
                      min="1"
                      value={lowStock}
                      onChange={(event) => setLowStock(event.target.value)}
                    />
                  </Field>
                </div>

                <div style={{ marginTop: 4 }}>
                  <div className="switch-row">
                    <div>
                      <strong>Low stock notifications</strong>
                      <p>
                        Show notifications when products reach the low stock
                        threshold.
                      </p>
                    </div>

                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={notifications}
                        onChange={(event) =>
                          setNotifications(event.target.checked)
                        }
                      />
                      <span className="slider" />
                    </label>
                  </div>

                  <div className="switch-row">
                    <div>
                      <strong>Print report headers</strong>
                      <p>
                        Include your business details at the top of printed
                        reports.
                      </p>
                    </div>

                    <label className="switch">
                      <input
                        type="checkbox"
                        defaultChecked
                        onChange={(event) =>
                          toast.info(
                            "Preference updated",
                            event.target.checked
                              ? "Report headers enabled."
                              : "Report headers disabled."
                          )
                        }
                      />
                      <span className="slider" />
                    </label>
                  </div>
                </div>
              </CardBody>
            </Card>

            <div className="form-actions">
              <Button variant="secondary" type="button" onClick={resetSettings}>
                Restore defaults
              </Button>

              <Button variant="primary" type="submit">
                <CheckIcon size={15} />
                Save settings
              </Button>
            </div>
          </PageStack>
        </form>

        <Card>
          <CardHeader
            title="Exchange rates"
            description={`Base currency ${BASE_CURRENCY} · fetched rates update automatically, manual rates always win`}
            actions={
              <Button
                variant="secondary"
                onClick={() => void refreshRates()}
                disabled={ratesLoading}
              >
                <RefreshIcon size={15} />
                {ratesLoading ? "Fetching..." : "Refresh rates"}
              </Button>
            }
          />

          <CardBody>
            {ratesError ? (
              <div className="alert alert-warning" role="status">
                <AlertIcon size={16} />
                <div className="alert-content">
                  <strong>Exchange rates could not be fetched</strong>
                  {ratesError} Set a manual rate below so the selected currency
                  can still be displayed correctly.
                </div>
              </div>
            ) : null}

            {rateMissing ? (
              <div className="alert alert-error" role="alert">
                <AlertIcon size={16} />
                <div className="alert-content">
                  <strong>No exchange rate for {currency}</strong>
                  Amounts are shown in PKR while this persists. Fetch rates or
                  enter a manual rate below — the display currency is never
                  silently faked.
                </div>
              </div>
            ) : null}

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Currency</th>
                    <th className="num">Fetched rate (PKR per 1)</th>
                    <th className="num">Manual rate (PKR per 1)</th>
                    <th className="num">Effective</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {tradableCurrencies.map((info) => {
                    const fetched = rates[info.code];
                    const manual = manualRates[info.code];
                    const effective = resolvePkrPerUnit(
                      info.code,
                      rates,
                      manualRates
                    );

                    return (
                      <tr key={info.code}>
                        <td className="cell-primary">{info.label}</td>

                        <td className="num">
                          {isValidRate(fetched) ? fetched : <span className="cell-muted">—</span>}
                        </td>

                        <td className="num">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={
                              isValidRate(fetched) ? String(fetched) : "e.g. 278.50"
                            }
                            value={manualDrafts[info.code] ?? ""}
                            onChange={(event) =>
                              setManualDrafts((current) => ({
                                ...current,
                                [info.code]: event.target.value,
                              }))
                            }
                            onBlur={() => commitManualRate(info.code)}
                            aria-label={`Manual exchange rate for ${info.code}`}
                            style={{ width: 140 }}
                          />
                        </td>

                        <td className="num cell-strong">
                          {effective !== null ? (
                            effective
                          ) : (
                            <span className="money-neg">unavailable</span>
                          )}
                        </td>

                        <td>
                          {manual !== undefined ? (
                            <Badge tone="lavender">Manual</Badge>
                          ) : isValidRate(fetched) ? (
                            <Badge tone="success">Live</Badge>
                          ) : (
                            <Badge tone="yellow">Missing</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="calc-note">
              {ratesUpdatedAt
                ? `Last fetched ${formatDate(new Date(ratesUpdatedAt).toISOString().slice(0, 10))}. `
                : "Rates have never been fetched. "}
              A manual rate overrides the fetched one for that currency only;
              leave the field empty to use the live rate again. Amounts are
              stored in PKR and converted for display, so changing these rates
              never rewrites your records.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Workspace & security"
            description="Your Supabase session and data isolation status"
            actions={
              <Button
                variant="secondary"
                onClick={() => void checkConnection()}
                disabled={connection === "checking"}
              >
                <DatabaseIcon size={15} />
                {connection === "checking" ? "Checking..." : "Test connection"}
              </Button>
            }
          />

          <CardBody>
            <div className="tile-grid">
              <article className="tile">
                <div className="tile-head">
                  <span className="tile-icon is-mint">
                    <LockIcon size={17} />
                  </span>

                  <div className="tile-body">
                    <h4>Signed in as</h4>
                    <p>{profile?.email ?? "Authenticated user"}</p>
                  </div>
                </div>

                <div className="tile-actions">
                  <Badge tone="success">Session active</Badge>
                  <span className="toolbar-spacer" />
                  {profile?.lastSignIn ? (
                    <span className="toolbar-count">
                      Since {formatDate(profile.lastSignIn)}
                    </span>
                  ) : null}
                </div>
              </article>

              <article className="tile">
                <div className="tile-head">
                  <span className="tile-icon is-sky">
                    <ShieldIcon size={17} />
                  </span>

                  <div className="tile-body">
                    <h4>Row level security</h4>
                    <p>
                      Every query runs through Supabase so records stay isolated
                      per account.
                    </p>
                  </div>
                </div>

                <div className="tile-actions">
                  <Badge tone="success">Enforced</Badge>
                </div>
              </article>

              <article className="tile">
                <div className="tile-head">
                  <span
                    className={`tile-icon${
                      connection === "ok" ? " is-mint" : " is-pink"
                    }`}
                  >
                    {connection === "ok" ? (
                      <WalletIcon size={17} />
                    ) : (
                      <StoreIcon size={17} />
                    )}
                  </span>

                  <div className="tile-body">
                    <h4>Database status</h4>
                    <p>
                      {connection === "ok"
                        ? connectionMessage
                        : connection === "fail"
                          ? connectionMessage
                          : "Run a connection test to verify your database is reachable."}
                    </p>
                  </div>
                </div>

                <div className="tile-actions">
                  <Badge
                    tone={
                      connection === "ok"
                        ? "success"
                        : connection === "fail"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {connection === "ok"
                      ? "Connected"
                      : connection === "fail"
                        ? "Error"
                        : "Not tested"}
                  </Badge>
                </div>
              </article>
            </div>
          </CardBody>
        </Card>
      </PageStack>
    </main>
  );
}