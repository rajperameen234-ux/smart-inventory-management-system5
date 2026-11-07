import type { ComponentType } from "react";
import {
  ChartIcon,
  DashboardIcon,
  PackageIcon,
  SettingsIcon,
  ShoppingCartIcon,
  TagIcon,
  TrendingUpIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
} from "../components/Icon";

// The page ids and hash parsing live in the pure `pages` module so node
// --test can exercise them without pulling in React components.
export {
  DEFAULT_PAGE,
  isPageId,
  parsePageFromHash,
  PAGES,
} from "./pages";
export type { PageId } from "./pages";

import type { PageId } from "./pages";

export type NavIcon = ComponentType<{ size?: number }>;

export type NavEntry = {
  id: PageId;
  label: string;
  icon: NavIcon;
  accent: string;
  title: string;
  subtitle: string;
};

export type NavSection = {
  title: string;
  items: NavEntry[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: DashboardIcon,
        accent: "#7C3AED",
        title: "Dashboard",
        subtitle: "Business performance at a glance",
      },
      {
        id: "products",
        label: "Products",
        icon: PackageIcon,
        accent: "#C026D3",
        title: "Products",
        subtitle: "Catalogue, pricing and stock levels",
      },
      {
        id: "categories",
        label: "Categories",
        icon: TagIcon,
        accent: "#DB2777",
        title: "Categories",
        subtitle: "Organise your product catalogue",
      },
      {
        id: "suppliers",
        label: "Suppliers",
        icon: TruckIcon,
        accent: "#0284C7",
        title: "Suppliers",
        subtitle: "Vendors and purchase partners",
      },
      {
        id: "customers",
        label: "Customers",
        icon: UsersIcon,
        accent: "#0D9488",
        title: "Customers",
        subtitle: "Client directory and balances",
      },
    ],
  },
  {
    title: "Transactions",
    items: [
      {
        id: "sales",
        label: "Sales",
        icon: ShoppingCartIcon,
        accent: "#E11D48",
        title: "Sales",
        subtitle: "Record and track every transaction",
      },
      {
        id: "dues",
        label: "Credit / Dues",
        icon: WalletIcon,
        accent: "#B45309",
        title: "Credit & Dues",
        subtitle: "Outstanding customer balances",
      },
      {
        id: "profit",
        label: "Profit",
        icon: TrendingUpIcon,
        accent: "#9333EA",
        title: "Profit",
        subtitle: "Gross profit from actual sale history",
      },
    ],
  },
  {
    title: "Insights",
    items: [
      {
        id: "reports",
        label: "Reports",
        icon: ChartIcon,
        accent: "#4F46E5",
        title: "Reports & Analytics",
        subtitle: "Sales performance and exports",
      },
      {
        id: "settings",
        label: "Settings",
        icon: SettingsIcon,
        accent: "#64748B",
        title: "Settings",
        subtitle: "Business and system preferences",
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavEntry[] = NAV_SECTIONS.flatMap(
  (section) => section.items
);

export function getNavEntry(id: PageId): NavEntry {
  return (
    ALL_NAV_ITEMS.find((item) => item.id === id) ?? ALL_NAV_ITEMS[0]
  );
}

export const BRAND = {
  name: "Smart Inventory",
  tagline: "Management System",
};