import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function Base({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="7.5" height="8.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="2" />
      <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2" />
      <rect x="3" y="14.5" width="7.5" height="6.5" rx="2" />
    </Base>
  );
}

export function PackageIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 2.75 20.5 7v10L12 21.25 3.5 17V7z" />
      <path d="M3.5 7 12 11.5 20.5 7" />
      <path d="M12 11.5v9.75" />
    </Base>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.83 0l-7.2-7.18a2 2 0 0 1-.59-1.42V4.5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.42.59l7.2 7.2a2 2 0 0 1 0 2.83Z" />
      <circle cx="7.75" cy="7.75" r="1.4" />
    </Base>
  );
}

export function TruckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2.5 6.75A1.25 1.25 0 0 1 3.75 5.5h9.5A1.25 1.25 0 0 1 14.5 6.75V15H2.5z" />
      <path d="M14.5 9.5h3.4a1.5 1.5 0 0 1 1.3.75l2.05 2.9a1.5 1.5 0 0 1 .25.8V15h-7z" />
      <circle cx="7" cy="17.5" r="2.25" />
      <circle cx="17.5" cy="17.5" r="2.25" />
      <path d="M9.25 17.5h5.75" />
    </Base>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M15.5 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20" />
      <circle cx="9.25" cy="8" r="3.4" />
      <path d="M21 20v-1.6a3.4 3.4 0 0 0-2.6-3.33" />
      <path d="M15.4 4.7a3.4 3.4 0 0 1 0 6.6" />
    </Base>
  );
}

export function ShoppingCartIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="9.5" cy="19.5" r="1.5" />
      <circle cx="17.5" cy="19.5" r="1.5" />
      <path d="M2.5 3.5h2.2l2.3 11.1a1.8 1.8 0 0 0 1.77 1.44h8.66a1.8 1.8 0 0 0 1.77-1.44L21 7.5H5.5" />
    </Base>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20.5 8.5V7A2.5 2.5 0 0 0 18 4.5H5.5A2.5 2.5 0 0 0 3 7v10a2.5 2.5 0 0 0 2.5 2.5H18a2.5 2.5 0 0 0 2.5-2.5v-1.5" />
      <path d="M21.5 8.5h-4.25a3.25 3.25 0 0 0 0 6.5h4.25a.5.5 0 0 0 .5-.5V9a.5.5 0 0 0-.5-.5Z" />
    </Base>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 3.5v15.5a1.5 1.5 0 0 0 1.5 1.5H21" />
      <path d="M7.5 16V11" />
      <path d="M12 16V6.5" />
      <path d="M16.5 16v-6" />
    </Base>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
      <path d="M19.4 14.5a1.5 1.5 0 0 0 .3 1.66l.05.05a1.8 1.8 0 1 1-2.55 2.55l-.05-.05a1.5 1.5 0 0 0-2.55 1.06v.15a1.8 1.8 0 1 1-3.6 0v-.08a1.5 1.5 0 0 0-2.63-1 1.5 1.5 0 0 0-1.66.3l-.05.05A1.8 1.8 0 1 1 3.86 16.7l.05-.05a1.5 1.5 0 0 0-1.06-2.55H2.7a1.8 1.8 0 1 1 0-3.6h.08a1.5 1.5 0 0 0 1-2.63 1.5 1.5 0 0 0-.3-1.66l-.05-.05a1.8 1.8 0 1 1 2.55-2.55l.05.05a1.5 1.5 0 0 0 1.66.3h.07a1.5 1.5 0 0 0 .92-1.37V2.7a1.8 1.8 0 1 1 3.6 0v.08a1.5 1.5 0 0 0 .98 1.37 1.5 1.5 0 0 0 1.66-.3l.05-.05a1.8 1.8 0 1 1 2.55 2.55l-.05.05a1.5 1.5 0 0 0-.3 1.66v.07a1.5 1.5 0 0 0 1.37.92h.15a1.8 1.8 0 1 1 0 3.6h-.08a1.5 1.5 0 0 0-1.37.92Z" />
    </Base>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Base>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5" />
      <path d="M13.75 20a2 2 0 0 1-3.5 0" />
    </Base>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m6 9 6 6 6-6" />
    </Base>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m14.5 6-6 6 6 6" />
    </Base>
  );
}

export function PanelLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9.5 4v16" />
    </Base>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12.5 5.5 18.5 11.5" />
      <path d="M15.7 3.9a2.1 2.1 0 0 1 3 3L8.4 17.2l-4 1 1-4z" />
    </Base>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 6.5h17" />
      <path d="M8.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v1.5" />
      <path d="M6.5 6.5 7.3 19a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12.5" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </Base>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Base>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20.5 11.5A8.5 8.5 0 1 0 19 16" />
      <path d="M21 4.5v5h-5" />
    </Base>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Base>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Base>
  );
}

export function TrendingUpIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m3 16.5 5.5-5.5 3.5 3.5 6-6.5" />
      <path d="M14.5 8h4v4" />
    </Base>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10.3 3.9 2.6 17.2A1.9 1.9 0 0 0 4.3 20.1h15.4a1.9 1.9 0 0 0 1.7-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 17h.01" />
    </Base>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Base>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Base>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.2 2.6 2.6L16 9.4" />
    </Base>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5" />
      <path d="M15.5 16.5 20 12l-4.5-4.5" />
      <path d="M20 12H9" />
    </Base>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3.5v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" />
    </Base>
  );
}

export function PrinterIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 9V3.5h10V9" />
      <path d="M7 18.5H5.5A2.5 2.5 0 0 1 3 16v-4.5A2.5 2.5 0 0 1 5.5 9h13a2.5 2.5 0 0 1 2.5 2.5V16a2.5 2.5 0 0 1-2.5 2.5H17" />
      <rect x="7" y="14.5" width="10" height="6" rx="1.2" />
    </Base>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M21 12.5h-5l-1.5 2.5h-5L8 12.5H3" />
      <path d="M6.4 4.9 3 12.5v5A2.5 2.5 0 0 0 5.5 20h13a2.5 2.5 0 0 0 2.5-2.5v-5l-3.4-7.6A2 2 0 0 0 15.8 4.5H8.2a2 2 0 0 0-1.8 1.4Z" />
    </Base>
  );
}

export function DatabaseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </Base>
  );
}

export function StoreIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9.5" />
      <path d="M2.5 9.5 4.6 4.2A1.5 1.5 0 0 1 6 3.25h12a1.5 1.5 0 0 1 1.4.95L21.5 9.5a2.5 2.5 0 0 1-4.5 2 2.5 2.5 0 0 1-4.5 0 2.5 2.5 0 0 1-4.5 0 2.5 2.5 0 0 1-2 .5Z" />
      <path d="M9.5 20.5v-6h5v6" />
    </Base>
  );
}

export function BoxesIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2.75" y="13.25" width="7.5" height="7.5" rx="1.8" />
      <rect x="13.75" y="13.25" width="7.5" height="7.5" rx="1.8" />
      <rect x="8.25" y="3.25" width="7.5" height="7.5" rx="1.8" />
    </Base>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 21s7-3.2 7-8.6V6.1L12 3.2 5 6.1v6.3C5 17.8 12 21 12 21Z" />
      <path d="m9.2 12 2 2 3.6-3.6" />
    </Base>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3.5 13.7 8l4.5 1.7-4.5 1.7L12 15.9l-1.7-4.5L5.8 9.7 10.3 8z" />
      <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </Base>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2.75" y="5" width="18.5" height="14" rx="2.5" />
      <path d="m3.5 7.5 7.35 5.05a2 2 0 0 0 2.3 0L20.5 7.5" />
    </Base>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20.5 16.9v2.6a1.8 1.8 0 0 1-2 1.8 17.6 17.6 0 0 1-7.7-2.75 17.3 17.3 0 0 1-5.35-5.35A17.6 17.6 0 0 1 2.7 5.4a1.8 1.8 0 0 1 1.8-2h2.6a1.8 1.8 0 0 1 1.79 1.55c.11.8.32 1.58.61 2.32a1.8 1.8 0 0 1-.4 1.9l-1.1 1.1a14.4 14.4 0 0 0 5.35 5.35l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.74.29 1.52.5 2.32.61A1.8 1.8 0 0 1 20.5 16.9Z" />
    </Base>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M19 10.5c0 5.25-7 11.25-7 11.25s-7-6-7-11.25a7 7 0 0 1 14 0Z" />
      <circle cx="12" cy="10.25" r="2.6" />
    </Base>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.25" y="5" width="17.5" height="16" rx="2.5" />
      <path d="M3.25 9.75h17.5M8 3v4M16 3v4" />
    </Base>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
      <path d="m3.5 12.5 8.5 4.25 8.5-4.25" />
      <path d="m3.5 17 8.5 4.25L20.5 17" />
    </Base>
  );
}

export function FileTextIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14 3.5H6.5A1.5 1.5 0 0 0 5 5v14.5a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19.5V8.5z" />
      <path d="M14 3.5V8.5H19" />
      <path d="M8.5 13h7M8.5 16.5h4.5" />
    </Base>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.2" />
      <path d="M8 10V7.5a4 4 0 1 1 8 0V10" />
    </Base>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Base>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 2" />
    </Base>
  );
}