import { useState, type FormEvent } from "react";
import { supabase } from "../supabase";
import { CheckIcon, MailIcon, ShieldIcon } from "../components/Icon";

const CURRENT_YEAR = new Date().getFullYear();

/** Same double-hash recovery target the reset page parses back. */
const RESET_REDIRECT = `${window.location.origin}/#/reset-password`;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HIGHLIGHTS = [
  {
    icon: MailIcon,
    label: "Reset link delivered straight to your inbox",
  },
  {
    icon: ShieldIcon,
    label: "Secure recovery handled by Supabase Auth",
  },
];

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setError("");

    const normalized = email.trim();

    if (!normalized) {
      setError("Please enter the email address you registered with.");
      return;
    }

    if (!EMAIL_PATTERN.test(normalized)) {
      setError("That doesn't look like a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        normalized,
        {
          redirectTo: RESET_REDIRECT,
        }
      );

      if (resetError) throw resetError;

      setEmail("");
      // Deliberately vague: the response must not reveal whether the
      // address is registered.
      setMessage(
        "If an account exists for this address, a password reset link is on its way. Check your inbox (and spam folder) — the link opens a page where you can set a new password."
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
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
            <span
              style={{ display: "block", fontSize: 11.5, opacity: 0.7 }}
            >
              Management System
            </span>
          </div>
        </div>

        <div className="auth-pitch">
          <h2>Locked out? Recover access in a couple of clicks.</h2>

          <p>
            We send a one-time, securely signed reset link to your inbox. The
            link only opens the password form — no one can use it to sign in
            without setting a new password first.
          </p>

          <ul className="auth-points">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;

              return (
                <li className="auth-point" key={item.label}>
                  <Icon size={16} />
                  {item.label}
                </li>
              );
            })}
          </ul>
        </div>

        <p style={{ fontSize: 12, opacity: 0.55 }}>
          © {CURRENT_YEAR} Smart Inventory. All rights reserved.
        </p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <header>
            <h1>Forgot Your Password?</h1>
            <p>
              Enter the email address linked to your account and we'll send you
              a password reset link. For your security the address is never
              revealed to anyone but you.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="auth-fields">
            <div className="field">
              <span className="label">Email</span>

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
                  <MailIcon size={15} />
                </span>

                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  autoFocus
                  style={{ paddingLeft: 34 }}
                />
              </span>
            </div>

            {error ? (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="alert alert-success" role="status">
                <CheckIcon size={16} />
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
              style={{ height: 40 }}
            >
              {loading ? "Sending reset link..." : "Send Reset Link"}
            </button>
          </form>

          <div className="auth-footer">
            {"Remembered your password? "}
            <button type="button" onClick={backToLogin}>
              Back to Login
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function backToLogin() {
  window.location.hash = "#/";
}
