import { useState, type FormEvent } from "react";
import { supabase } from "../supabase";
import {
  CheckIcon,
  LockIcon,
  MailIcon,
  ShieldIcon,
  TrendingUpIcon,
} from "../components/Icon";

const CURRENT_YEAR = new Date().getFullYear();

const HIGHLIGHTS = [
  {
    icon: TrendingUpIcon,
    label: "Live revenue, sales and inventory analytics",
  },
  {
    icon: LockIcon,
    label: "Per-account data isolation with row-level security",
  },
  {
    icon: ShieldIcon,
    label: "Secure authentication powered by Supabase",
  },
];

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (signInError) throw signInError;
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;

        setMessage(
          data.session
            ? "Account created successfully!"
            : "Account created. Please check your email to confirm."
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Please try again."
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
          <h2>Run your entire operation from one calm workspace.</h2>

          <p>
            Products, sales, credit, suppliers and customers — connected to your
            Supabase backend with real-time data and per-account isolation.
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
            <h1>{isLogin ? "Welcome back" : "Create your account"}</h1>
            <p>
              {isLogin
                ? "Sign in to continue to your inventory workspace."
                : "Get started with your own secure workspace in seconds."}
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
                  required
                  autoComplete="email"
                  style={{ paddingLeft: 34 }}
                />
              </span>
            </div>

            <div className="field">
              <span className="label">Password</span>

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
                  autoComplete={
                    isLogin ? "current-password" : "new-password"
                  }
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
              {loading
                ? "Please wait..."
                : isLogin
                  ? "Sign in to workspace"
                  : "Create account"}
            </button>
          </form>

          <div className="auth-footer">
            {isLogin ? "Don't have an account? " : "Already have an account? "}

            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setMessage("");
                setError("");
              }}
            >
              {isLogin ? "Create account" : "Back to sign in"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}