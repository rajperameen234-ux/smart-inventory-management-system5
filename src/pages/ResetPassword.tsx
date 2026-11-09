import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../supabase";
import { AlertIcon, CheckIcon, LockIcon } from "../components/Icon";
import { Spinner } from "../components/Spinner";

const MIN_PASSWORD_LENGTH = 6;
const CURRENT_YEAR = new Date().getFullYear();

/** One-time recovery links stay valid for max_age (default 3600s); if they
 * have already been consumed the stored session still answers getSession —
 * the update still works, which is the point of "ready". */
type LinkStatus = "verifying" | "ready" | "invalid" | "updated";

/**
 * Recovery callback URLs look like:
 *
 *   /#/reset-password#access_token=...&refresh_token=...&type=recovery
 *
 * and, when verification failed, the error params are appended to the SAME
 * second fragment:
 *
 *   /#/reset-password#error_description=Email+link+is+invalid+...&error_code=403
 *
 * Supabase may also surface errors on the query string. Scan both places for
 * `error=` params so an expired or already-used link never reaches the form.
 */
function readRecoveryUrlError(): string | null {
  const href = window.location.href;
  const chunks: string[] = [];

  const hashIndex = href.indexOf("#");

  const queryIndex = href.indexOf("?");
  if (queryIndex !== -1) {
    const queryEnd = hashIndex !== -1 ? hashIndex : href.length;
    chunks.push(href.slice(queryIndex + 1, queryEnd));
  }

  if (hashIndex !== -1) {
    const extra = href
      .slice(hashIndex + 1)
      .split("#")
      .slice(1)
      .join("&");
    if (extra.includes("error=")) chunks.push(extra);
  }

  const errorChunk = chunks.find((chunk) => chunk.includes("error="));

  if (!errorChunk) return null;

  const params = new URLSearchParams(errorChunk);
  const description = params.get("error_description");
  const code = params.get("error_code");
  const genericError = params.get("error");

  return description || (code ? `Error ${code}` : genericError);
}

function friendlyLinkError(raw: string | null): string {
  const text = (raw ?? "").toLowerCase();
  if (text.includes("expired")) {
    return "This password reset link has expired. Request a new reset link and follow it straight away.";
  }
  if (text.includes("invalid") || text.includes("used") || text.includes("consumed")) {
    return "This password reset link is invalid or was already used. Request a new reset link to continue.";
  }
  if (text) {
    return `${raw}. Please request a new reset link to continue.`;
  }
  return "This password reset link couldn't be verified. Request a new reset link and try again.";
}

export default function ResetPassword() {
  const [status, setStatus] = useState<LinkStatus>("verifying");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let unsubscribe: (() => void) | undefined;

    const urlError = readRecoveryUrlError();

    if (urlError) {
      setLinkError(urlError);
      setStatus("invalid");
      return;
    }

    void (async () => {
      const { data } = await supabase.auth.getSession();

      if (!active) return;
      if (data.session) {
        setStatus("ready");
        return;
      }

      // The token fragment is consumed asynchronously by the Supabase client
      // (detectSessionInUrl). A recovery link resolves to a PASSWORD_RECOVERY
      // event; any session at all is good enough to open the form.
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active || !session) return;

        // Only pull the form open from the "verifying" state so late
        // session events (refresh, sign-out) never dismiss a finished flow.
        setStatus((current) => (current === "verifying" ? "ready" : current));
      });
      unsubscribe = () => subscription.unsubscribe();

      timer = window.setTimeout(() => {
        if (!active) return;
        setStatus((current) =>
          current === "ready" || current === "updated" ? current : "invalid"
        );
      }, 10_000);
    })();

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") return;

    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? "");
    });

    return () => {
      active = false;
    };
  }, [status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!password || !confirmPassword) {
      setError("Please fill in both password fields.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("The two passwords you entered do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) throw updateError;

      setPassword("");
      setConfirmPassword("");

      // End the recovery session immediately so the link-derived credentials
      // can no longer act on the account. The user signs in fresh afterwards.
      try {
        await supabase.auth.signOut();
      } catch {
        // Signing out is best-effort; the new password is already saved.
      }

      setMessage(
        "Your password has been updated! Sign in with your new password next time."
      );
      setStatus("updated");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  function gotoForgotPassword() {
    window.location.hash = "#/forgot-password";
  }

  function gotoLogin() {
    window.location.hash = "#/";
  }

  return (
    <div className="auth-screen">
      <aside className="auth-aside">
        <div className="auth-brand">
          <span
            className="brand-mark"
            style={{ width: 38, height: 38, borderRadius: 12 }}
          >
            <svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 7.5 12 3l8 4.5-8 4.5z" />
              <path d="M4 12l8 4.5L20 12" />
              <path d="M4 16.5 12 21l8-4.5" />
            </svg>
          </span>

          <div>
            <strong style={{ fontSize: 15, color: "#fff" }}>
              Smart Inventory
            </strong>
            <span style={{ display: "block", fontSize: 11.5, opacity: 0.7 }}>
              Management System
            </span>
          </div>
        </div>

        <div className="auth-pitch">
          <h2>Pick a password only you know.</h2>

          <p>
            Your new password unlocks every page of your workspace. It must be
            at least 6 characters long — a mix of letters, digits and symbols
            keeps your business data safest.
          </p>
        </div>

        <p style={{ fontSize: 12, opacity: 0.55 }}>
          © {CURRENT_YEAR} Smart Inventory. All rights reserved.
        </p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          {status === "verifying" ? (
            <div className="reset-message">
              <Spinner large />
              <p>Verifying your reset link…</p>
            </div>
          ) : null}

          {status === "ready" ? (
            <>
              <header>
                <h1>Set a New Password</h1>
                <p>
                  {email
                    ? `Choose a strong new password for ${email}.`
                    : "Choose a strong new password for your account."}{" "}
                  Your password must be at least {MIN_PASSWORD_LENGTH}{" "}
                  characters long.
                </p>
              </header>

              <form onSubmit={handleSubmit} className="auth-fields">
                <PasswordField
                  label="New Password"
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggleShow={() => setShowPassword((value) => !value)}
                  showStateLabel={showPassword ? "Hide" : "Show"}
                  placeholder="At least 6 characters"
                />

                <PasswordField
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  show={showConfirm}
                  onToggleShow={() => setShowConfirm((value) => !value)}
                  showStateLabel={showConfirm ? "Hide" : "Show"}
                  placeholder="Repeat your new password"
                />

                {error ? (
                  <div className="alert alert-error" role="alert">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={loading}
                  style={{ height: 40 }}
                >
                  {loading ? "Updating password..." : "Update Password"}
                </button>
              </form>

              <div className="auth-footer">
                {"Changed your mind? "}
                <button type="button" onClick={gotoForgotPassword}>
                  Back to Forgot Password
                </button>
              </div>
            </>
          ) : null}

          {status === "invalid" ? (
            <>
              <header>
                <h1>Reset Link Problem</h1>
                <p>
                  We couldn't validate this password reset request, so no
                  change has been made to your account.
                </p>
              </header>

              <div className="auth-fields">
                <div className="alert alert-error" role="alert">
                  <AlertIcon size={16} />
                  {friendlyLinkError(linkError)}
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  style={{ height: 40 }}
                  onClick={gotoForgotPassword}
                >
                  Request a New Reset Link
                </button>
              </div>

              <div className="auth-footer">
                <button type="button" onClick={gotoLogin}>
                  Back to Login
                </button>
              </div>
            </>
          ) : null}

          {status === "updated" ? (
            <>
              <header>
                <h1>All Set!</h1>
                <p>Your password has been changed and the recovery session has ended.</p>
              </header>

              <div className="auth-fields">
                <div className="alert alert-success" role="status">
                  <CheckIcon size={16} />
                  {message || "Your password has been updated."}
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  style={{ height: 40 }}
                  onClick={gotoLogin}
                >
                  Back to Login
                </button>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
  showStateLabel: string;
  placeholder: string;
};

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  showStateLabel,
  placeholder,
}: PasswordFieldProps) {
  return (
    <div className="field">
      <span className="label">{label}</span>

      <span style={{ position: "relative", display: "block" }}>
        <span
          style={{
            position: "absolute",
            left: 11,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-muted)",
            pointerEvents: "none",
          }}
        >
          <LockIcon size={15} />
        </span>

        <input
          type={show ? "text" : "password"}
          className="input input-with-action"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          minLength={MIN_PASSWORD_LENGTH}
          required
          autoComplete="new-password"
        />

        <button
          type="button"
          className="input-trailing"
          onClick={onToggleShow}
          aria-label={`${showStateLabel} password`}
        >
          {showStateLabel}
        </button>
      </span>
    </div>
  );
}
