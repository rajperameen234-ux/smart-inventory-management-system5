import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { supabase } from "./supabase";
import AppShell from "./components/AppShell";
import { useToast } from "./components/Toast";
import {
  DEFAULT_PAGE,
  isPageId,
  type PageId,
} from "./lib/navigation";

import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Categories from "./pages/Categories";
import Suppliers from "./pages/Suppliers";
import Customers from "./pages/Customers";
import Sales from "./pages/Sales";
import CreditDues from "./pages/CreditDues";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

function readPageFromHash(): PageId {
  if (typeof window === "undefined") return DEFAULT_PAGE;

  const hash = window.location.hash.replace(/^#\/?/, "").trim();

  return isPageId(hash) ? hash : DEFAULT_PAGE;
}

function useCurrentUserEmail(): string {
  const [email, setEmail] = useState("");

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? "");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setEmail(session?.user?.email ?? "");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return email;
}

export default function App() {
  const toast = useToast();

  const [currentPage, setCurrentPage] = useState<PageId>(readPageFromHash);
  const [searchSeed, setSearchSeed] = useState("");
  const userEmail = useCurrentUserEmail();

  useEffect(() => {
    function onHashChange() {
      setCurrentPage(readPageFromHash());
    }

    window.addEventListener("hashchange", onHashChange);

    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((page: PageId, seed?: string) => {
    setCurrentPage(page);
    setSearchSeed(seed ?? "");

    const nextHash = `#/${page}`;

    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleSignOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast.error("Logout failed", error.message);
    }
  }, [toast]);

  return (
    <AppShell
      currentPage={currentPage}
      onNavigate={navigate}
      email={userEmail}
      onSignOut={() => void handleSignOut()}
    >
      {currentPage === "dashboard" ? (
        <Dashboard onNavigate={navigate} />
      ) : null}

      {currentPage === "products" ? (
        <Products searchSeed={searchSeed} />
      ) : null}

      {currentPage === "categories" ? <Categories /> : null}

      {currentPage === "suppliers" ? (
        <Suppliers searchSeed={searchSeed} />
      ) : null}

      {currentPage === "customers" ? (
        <Customers searchSeed={searchSeed} />
      ) : null}

      {currentPage === "sales" ? <Sales /> : null}

      {currentPage === "dues" ? <CreditDues /> : null}

      {currentPage === "reports" ? <Reports /> : null}

      {currentPage === "settings" ? <Settings /> : null}
    </AppShell>
  );
}