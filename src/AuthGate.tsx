import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import Auth from "./pages/Auth";
import { Spinner } from "./components/Spinner";

function BrandGlyph() {
  return (
    <span className="brand-mark" style={{ width: 38, height: 38, borderRadius: 12 }}>
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
  );
}

export default function AuthGate({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession();

      if (active) {
        setSession(error ? null : data.session);
        setLoading(false);
      }
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (active) {
        setSession(newSession);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="boot-inner">
          <BrandGlyph />
          <Spinner large />
          <p>Restoring your secure session…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return <>{children}</>;
}