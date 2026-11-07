import { useState, type FormEvent } from "react";
import { supabase } from "../supabase";
import { CheckIcon, LockIcon } from "../components/Icon";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setError("");
    setLoading(true);

    try {
      if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      // Recovery links sign the user in automatically, so the new password is
      // applied to the live session and the user lands directly in the app.
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) throw updateError;

      setMessage(
        "Password updated successfully! Taking you to your workspace..."
      );

      setTimeout(() => {
        window.location.hash = "#/dashboard";
      }, 2000);
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
          <h2>Reset your password</h2>

          <p>
            Enter a new password to secure your account. Use the reset link sent to
            your email to proceed.
          </p>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <header>
            <h1>Reset Password</h1>
            <p>
              Set a new password for your account. Please make sure your new password
              is at least 6 characters long.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="auth-fields">
            <div className="field">
              <span className="label">New Password</span>

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
                  type="password"
                  className="input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                  autoComplete="new-password"
                  style={{ paddingLeft: 34 }}
                />
              </span>
            </div>

            <div className="field">
              <span className="label">Confirm Password</span>

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
                  type="password"
                  className="input"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm your password"
                  required
                  autoComplete="new-password"
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
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}