import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { supabase } from "../supabase";
import { initials, toNumber } from "../lib/format";
import {
  resolveMinimumStock,
  resolveStockStatus,
} from "../lib/inventory";
import {
  ALL_NAV_ITEMS,
  BRAND,
  getNavEntry,
  NAV_SECTIONS,
  type PageId,
} from "../lib/navigation";
import {
  AlertIcon,
  BellIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CloseIcon,
  LogOutIcon,
  MenuIcon,
  PanelLeftIcon,
  SearchIcon,
  TagIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
} from "./Icon";
import { useDismissable } from "./ui";

/* -------------------------------------------------------------------------- */
/*  Brand mark                                                                 */
/* -------------------------------------------------------------------------- */

function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span
      className="brand-mark"
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
    >
      <svg
        width={size * 0.52}
        height={size * 0.52}
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

/* -------------------------------------------------------------------------- */
/*  Sidebar                                                                    */
/* -------------------------------------------------------------------------- */

function Sidebar({
  currentPage,
  collapsed,
  mobileOpen,
  onToggleCollapse,
  onNavigate,
  onCloseMobile,
  email,
  onSignOut,
}: {
  currentPage: PageId;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onNavigate: (page: PageId) => void;
  onCloseMobile: () => void;
  email: string;
  onSignOut: () => void;
}) {
  return (
    <>
      {mobileOpen ? (
        <div
          className="sidebar-scrim"
          role="presentation"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside className="sidebar" aria-label="Primary navigation">
        <div className="sidebar-brand">
          <BrandMark />

          <div className="brand-copy">
            <strong>{BRAND.name}</strong>
            <span>{BRAND.tagline}</span>
          </div>
        </div>

        <div className="sidebar-scroll">
          {NAV_SECTIONS.map((section) => (
            <div className="nav-group" key={section.title}>
              <p className="nav-section-title">{section.title}</p>

              {section.items.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`nav-item${
                      currentPage === item.id ? " is-active" : ""
                    }`}
                    style={{ "--nav-accent": item.accent } as CSSProperties}
                    title={collapsed ? item.label : undefined}
                    aria-current={currentPage === item.id ? "page" : undefined}
                    onClick={() => {
                      onNavigate(item.id);
                      onCloseMobile();
                    }}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="avatar">{initials(email || "Admin User")}</span>

            <div className="sidebar-user-copy">
              <strong>{email.split("@")[0] || "admin"}</strong>
              <span>Administrator</span>
            </div>

            <button
              type="button"
              className="icon-btn"
              style={{ marginLeft: "auto" }}
              aria-label="Sign out"
              title="Sign out"
              onClick={onSignOut}
            >
              <LogOutIcon size={16} />
            </button>
          </div>

          <button
            type="button"
            className="sidebar-collapse"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeftIcon size={16} />
            <span className="sidebar-collapse-label">
              {collapsed ? "Expand" : "Collapse"}
            </span>
            {collapsed ? null : <ChevronLeftIcon size={14} />}
          </button>
        </div>
      </aside>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Global search                                                              */
/* -------------------------------------------------------------------------- */

type SearchHit = {
  group: string;
  id: number;
  title: string;
  subtitle: string;
  page: PageId;
};

function GlobalSearch({
  currentPage,
  onNavigate,
}: {
  currentPage: PageId;
  onNavigate: (page: PageId, seed?: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestRef = useRef(0);

  const { panelRef } = useDismissable(open, () => setOpen(false));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const query = term.trim();

    if (query.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }

    const safe = query.replace(/[,%()]/g, " ");

    setSearching(true);

    const timer = window.setTimeout(async () => {
      requestRef.current += 1;
      const requestId = requestRef.current;

      const [products, customers, suppliers] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, supplier, stock")
          .ilike("name", `%${safe}%`)
          .limit(5),
        supabase
          .from("customers")
          .select("id, name, phone, dues")
          .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
          .limit(5),
        supabase
          .from("suppliers")
          .select("id, company, contact")
          .ilike("company", `%${safe}%`)
          .limit(5),
      ]);

      if (requestId !== requestRef.current) return;

      const next: SearchHit[] = [];

      (products.data ?? []).forEach((row) => {
        next.push({
          group: "Products",
          id: Number(row.id),
          title: String(row.name ?? "Untitled"),
          subtitle: `${row.supplier ?? "Uncategorised"} · ${Number(row.stock ?? 0)} in stock`,
          page: "products",
        });
      });

      (customers.data ?? []).forEach((row) => {
        next.push({
          group: "Customers",
          id: Number(row.id),
          title: String(row.name ?? "Unnamed"),
          subtitle: row.phone ? String(row.phone) : "No phone on file",
          page: "customers",
        });
      });

      (suppliers.data ?? []).forEach((row) => {
        next.push({
          group: "Suppliers",
          id: Number(row.id),
          title: String(row.company ?? "Unknown supplier"),
          subtitle: row.contact ? String(row.contact) : "No contact on file",
          page: "suppliers",
        });
      });

      setHits(next);
      setSearching(false);
    }, 240);

    return () => window.clearTimeout(timer);
  }, [term]);

  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>();

    hits.forEach((hit) => {
      const bucket = map.get(hit.group) ?? [];
      bucket.push(hit);
      map.set(hit.group, bucket);
    });

    return Array.from(map.entries());
  }, [hits]);

  const term_ = term.trim();

  return (
    <div className="topbar-search popover-anchor" data-popover-anchor>
      <span className="topbar-search-icon">
        <SearchIcon size={15} />
      </span>

      <input
        ref={inputRef}
        type="search"
        className="input"
        placeholder="Search products, customers, suppliers"
        aria-label="Search across your workspace"
        value={term}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
      />

      <span className="kbd">⌘K</span>

      {open ? (
        <div className="popover popover-wide" ref={panelRef}>
          {term_.length < 2 ? (
            <>
              <div className="popover-header">
                <strong>Quick jump</strong>
                <span>Type to search your data</span>
              </div>

              <div className="popover-body">
                {ALL_NAV_ITEMS.filter((item) => item.id !== currentPage).map(
                  (item) => {
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="popover-item"
                        style={{ "--nav-accent": item.accent } as CSSProperties}
                        onClick={() => {
                          onNavigate(item.id);
                          setOpen(false);
                        }}
                      >
                        <Icon size={16} />
                        {item.label}
                      </button>
                    );
                  }
                )}
              </div>
            </>
          ) : searching ? (
            <div className="loading-block" style={{ padding: "32px 16px" }}>
              Searching…
            </div>
          ) : grouped.length === 0 ? (
            <div className="empty-state" style={{ padding: "32px 20px" }}>
              <span className="empty-icon">
                <SearchIcon size={20} />
              </span>
              <h4>No matches</h4>
              <p>
                Nothing in your workspace matches “{term_}”. Try a different
                keyword.
              </p>
            </div>
          ) : (
            <div className="search-results">
              {grouped.map(([group, items]) => (
                <div key={group}>
                  <p className="search-group-title">{group}</p>

                  {items.map((hit) => (
                    <button
                      key={`${hit.group}-${hit.id}`}
                      type="button"
                      className="popover-item"
                      onClick={() => {
                        onNavigate(hit.page, hit.title);
                        setOpen(false);
                        setTerm("");
                      }}
                    >
                      {hit.group === "Products" ? (
                        <TagIcon size={16} />
                      ) : hit.group === "Customers" ? (
                        <UsersIcon size={16} />
                      ) : (
                        <TruckIcon size={16} />
                      )}

                      <span className="popover-item-copy">
                        <strong>{hit.title}</strong>
                        <span>{hit.subtitle}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Notifications                                                              */
/* -------------------------------------------------------------------------- */

type NotificationItem = {
  id: string;
  tone: "danger" | "warning" | "info";
  title: string;
  detail: string;
};

function NotificationBell({
  onNavigate,
}: {
  onNavigate: (page: PageId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const { panelRef } = useDismissable(open, () => setOpen(false));

  const load = useCallback(async () => {
    setLoading(true);

    /**
     * FIX: this previously fetched only the 25 lowest-stock rows and filtered
     * client-side. With more than 25 healthy products ahead of a critical one,
     * the alert was silently never raised. The low-stock set is now computed
     * from every row the user can actually see.
     */
    const [products, dues] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, stock, minimum_stock")
        .order("id", { ascending: true })
        .limit(1000),
      supabase.from("dues").select("id, remaining_due, status").limit(1000),
    ]);

    const next: NotificationItem[] = [];

    (products.data ?? []).forEach((row) => {
      const status = resolveStockStatus(row.stock, row.minimum_stock);

      if (status === "healthy") return;

      next.push({
        id: `product-${row.id}`,
        tone: status === "out" ? "danger" : "warning",
        title: status === "out" ? "Out of stock" : "Low stock",
        detail: `${row.name} · ${toNumber(row.stock)} left (min ${resolveMinimumStock(row.minimum_stock)})`,
      });
    });

    const outstanding = (dues.data ?? []).filter(
      (row) => toNumber(row.remaining_due) > 0
    ).length;

    if (outstanding > 0) {
      next.push({
        id: "dues-summary",
        tone: "info",
        title: "Open credit balances",
        detail: `${outstanding} record${
          outstanding === 1 ? "" : "s"
        } still awaiting payment`,
      });
    }

    setItems(next.slice(0, 12));
    setLoaded(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && !loaded) void load();
  }, [open, loaded, load]);

  const unread = loaded ? items.length : 0;

  return (
    <div className="popover-anchor" data-popover-anchor>
      <button
        type="button"
        className={`icon-btn${open ? " is-open" : ""}`}
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon size={18} />

        {unread > 0 ? (
          <span className="icon-dot">{unread > 9 ? "9+" : unread}</span>
        ) : null}
      </button>

      {open ? (
        <div className="popover popover-wide" ref={panelRef}>
          <div className="popover-header">
            <strong>Notifications</strong>

            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => void load()}
              disabled={loading}
            >
              Refresh
            </button>
          </div>

          <div className="popover-body">
            {loading ? (
              <div className="loading-block" style={{ padding: "32px 16px" }}>
                Checking your inventory…
              </div>
            ) : items.length === 0 ? (
              <div className="empty-state" style={{ padding: "32px 20px" }}>
                <span className="empty-icon">
                  <WalletIcon size={20} />
                </span>
                <h4>You are all caught up</h4>
                <p>No low-stock items or outstanding balances right now.</p>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="notification-row">
                  <span
                    className="notification-dot"
                    style={{
                      background:
                        item.tone === "danger"
                          ? "var(--danger-bg)"
                          : item.tone === "warning"
                            ? "var(--warning-bg)"
                            : "var(--info-bg)",
                      color:
                        item.tone === "danger"
                          ? "var(--danger)"
                          : item.tone === "warning"
                            ? "var(--warning)"
                            : "var(--info)",
                    }}
                  >
                    <AlertIcon size={14} />
                  </span>

                  <div className="notification-copy">
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="popover-footer">
            <button
              type="button"
              className="popover-item"
              onClick={() => {
                onNavigate("products");
                setOpen(false);
              }}
            >
              View inventory
            </button>

            <button
              type="button"
              className="popover-item"
              onClick={() => {
                onNavigate("dues");
                setOpen(false);
              }}
            >
              Review credit &amp; dues
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Profile menu                                                                */
/* -------------------------------------------------------------------------- */

function ProfileMenu({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { panelRef } = useDismissable(open, () => setOpen(false));

  return (
    <div className="popover-anchor" data-popover-anchor>
      <button
        type="button"
        className={`profile-trigger${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar avatar-lg">{initials(email || "Admin")}</span>

        <span className="profile-copy">
          <strong>{email.split("@")[0] || "admin"}</strong>
          <span>Administrator</span>
        </span>

        <ChevronDownIcon size={14} />
      </button>

      {open ? (
        <div className="popover" ref={panelRef}>
          <div className="popover-header">
            <div style={{ minWidth: 0 }}>
              <strong
                style={{
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {email}
              </strong>
              <span>Signed in via Supabase</span>
            </div>
          </div>

          <div className="popover-body">
            <button
              type="button"
              className="popover-item"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              <LogOutIcon size={16} />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shell                                                                      */
/* -------------------------------------------------------------------------- */

export default function AppShell({
  currentPage,
  onNavigate,
  email,
  onSignOut,
  children,
}: {
  currentPage: PageId;
  onNavigate: (page: PageId, seed?: string) => void;
  email: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;

    return window.localStorage.getItem("si.sidebar-collapsed") === "1";
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  const entry = getNavEntry(currentPage);

  useEffect(() => {
    window.localStorage.setItem(
      "si.sidebar-collapsed",
      collapsed ? "1" : "0"
    );
  }, [collapsed]);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 900) setMobileOpen(false);
    }

    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  }, []);

  function handleSidebarButton() {
    if (window.innerWidth <= 900) {
      setMobileOpen(true);
      return;
    }

    setCollapsed((value) => !value);
  }

  return (
    <div
      className={`app-shell${collapsed ? " is-collapsed" : ""}${
        mobileOpen ? " is-mobile-open" : ""
      }`}
    >
      <Sidebar
        currentPage={currentPage}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        onNavigate={onNavigate}
        onCloseMobile={() => setMobileOpen(false)}
        email={email}
        onSignOut={onSignOut}
      />

      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn sidebar-toggle"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            onClick={handleSidebarButton}
          >
            {mobileOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
          </button>

          <div className="topbar-identity">
            <h1>{entry.title}</h1>
            <p>{entry.subtitle}</p>
          </div>

          <div className="topbar-spacer" />

          <div className="topbar-actions">
            <GlobalSearch currentPage={currentPage} onNavigate={onNavigate} />

            <NotificationBell onNavigate={onNavigate} />

            <ProfileMenu email={email} onSignOut={onSignOut} />
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}