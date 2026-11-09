import { useEffect, useState } from "react";
import AuthGate from "./AuthGate";
import App from "./App";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

export type AuthRoute = "login" | "forgot-password" | "reset-password";

/**
 * Resolve the auth-layer route from the URL hash.
 *
 * Recovery callback URLs are `/#/reset-password#access_token=...` — the
 * router page is the segment before the second "#". Anything else counts as
 * the plain login/signup screen.
 */
export function getAuthRoute(): AuthRoute {
  if (typeof window === "undefined") return "login";

  const raw = window.location.hash.replace(/^#\/?/, "").split("#")[0] ?? "";

  if (raw === "forgot-password") return "forgot-password";
  if (raw === "reset-password") return "reset-password";

  return "login";
}

/**
 * Top-level auth routing.
 *
 * Forgot/reset pages render OUTSIDE AuthGate so they work before any session
 * exists — while the reset page is on screen it listens for the recovery
 * session itself. AuthGate (session gate + <App />) stays untouched for the
 * login/signup screen.
 */
export default function AuthRouter() {
  const [route, setRoute] = useState<AuthRoute>(getAuthRoute);

  useEffect(() => {
    function onHashChange() {
      // Supabase clears the ENTIRE hash (`window.location.hash = ''`) after
      // consuming recovery tokens, which fires a hashchange here. Swallow
      // that empty-hash event so the user isn't yanked off the reset form
      // mid-flow; real navigation always lands on a non-empty hash.
      if (window.location.hash === "") return;

      setRoute(getAuthRoute());
    }

    window.addEventListener("hashchange", onHashChange);

    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route === "forgot-password") return <ForgotPassword />;
  if (route === "reset-password") return <ResetPassword />;

  return (
    <AuthGate>
      <App />
    </AuthGate>
  );
}
