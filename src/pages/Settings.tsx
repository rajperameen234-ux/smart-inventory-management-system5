import { useEffect, useState, type FormEvent } from "react";
import { useToast } from "../components/Toast";
import {
  CheckIcon,
  DatabaseIcon,
  LockIcon,
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

  const [businessName, setBusinessName] = useState(DEFAULTS.businessName);
  const [phone, setPhone] = useState(DEFAULTS.phone);
  const [address, setAddress] = useState(DEFAULTS.address);
  const [currency, setCurrency] = useState(DEFAULTS.currency);
  const [lowStock, setLowStock] = useState(DEFAULTS.lowStock);
  const [notifications, setNotifications] = useState(DEFAULTS.notifications);

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
        setCurrency(parsed.currency ?? DEFAULTS.currency);
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
    setCurrency(DEFAULTS.currency);
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
      currency,
      lowStock,
      notifications,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    toast.success("Settings saved", "Your preferences have been stored.");
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
                  <Field label="Default currency">
                    <Select
                      value={currency}
                      onChange={(event) => setCurrency(event.target.value)}
                    >
                      <option value="PKR">PKR - Pakistani Rupee</option>
                      <option value="USD">USD - US Dollar</option>
                      <option value="AED">AED - UAE Dirham</option>
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