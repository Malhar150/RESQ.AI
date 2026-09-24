import type { ReactElement, SVGProps } from "react";

const paths: Record<string, ReactElement> = {
  flood: (<><path d="M3 15c2 0 2-1.5 4.5-1.5S10 15 12 15s2-1.5 4.5-1.5S19 15 21 15" /><path d="M3 19.5c2 0 2-1.5 4.5-1.5S10 19.5 12 19.5s2-1.5 4.5-1.5 2.5 1.5 4.5 1.5" /><path d="M5 11V7.5L12 3l7 4.5V11" /><path d="M10 11V8.5h4V11" /></>),
  landslide: (<><path d="M2 20h20" /><path d="M3 20 10 6l4 7" /><path d="M13 13l3-1 5 8" /><circle cx="15.5" cy="16" r="1.2" /><circle cx="18" cy="13.5" r=".9" /></>),
  storm: (<><path d="M4 8h10a3 3 0 1 0-3-3" /><path d="M3 12h15a3 3 0 1 1-3 3" /><path d="M5 16h6" /></>),
  earthquake: (<><path d="M2 12h4l2-5 3 10 3-12 2 7h6" /></>),
  fire: (<><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.2-3.8 2.2-5 .3 1.6 1 2.6 2 3-.5-3 .3-5.8.8-8Z" /></>),
  building_collapse: (<><path d="M4 21V7l6-3v17" /><path d="M10 21h4" /><path d="M14 21l2.5-9 4 1.2L18 21" /><path d="M6.5 10h1M6.5 13.5h1M6.5 17h1" /><path d="M11.5 9l1.5 2.5-1 2 1.5 2" /></>),
  medical: (<><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 7.5v9M7.5 12h9" /></>),
  infrastructure: (<><path d="M2 17h20" /><path d="M4 17c2-4.5 5.5-7 8-7s6 2.5 8 7" /><path d="M8 12.2V17M16 12.2V17M12 10v7" /></>),
  other: (<><circle cx="6" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="18" cy="12" r="1.4" /></>),

  alert: (<><path d="M12 3 22 20H2Z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.3" r=".6" fill="currentColor" /></>),
  outbox: (<><path d="M3 13h5l1.5 2.5h5L16 13h5" /><path d="M5 13 7 5h10l2 8v6H5Z" /><path d="M12 7v4.5M10 9.5l2 2 2-2" /></>),
  relay: (<><rect x="2.5" y="5" width="7" height="14" rx="1.6" /><rect x="14.5" y="5" width="7" height="14" rx="1.6" /><path d="M10.5 10h3M12 8.5 13.5 10 12 11.5" /><path d="M13.5 14h-3M12 12.5 10.5 14 12 15.5" /></>),
  list: (<><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>),
  pin: (<><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  locate: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>),
  camera: (<><path d="M4 8h3l2-2.5h6L17 8h3v11H4Z" /><circle cx="12" cy="13" r="3.5" /></>),
  mic: (<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>),
  send: (<><path d="M4 12 20 4l-5 16-3.5-6.5Z" /><path d="M11.5 13.5 20 4" /></>),
  check: (<path d="m5 12.5 4.5 4.5L19 7" />),
  x: (<path d="M6 6l12 12M18 6 6 18" />),
  wifiOff: (<><path d="M2 8.5a15 15 0 0 1 4-2.4M9.5 5.2A15 15 0 0 1 22 8.5" /><path d="M5 12a10 10 0 0 1 4-2M13.5 9.8A10 10 0 0 1 19 12" /><path d="M8.5 15.5a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r=".8" fill="currentColor" /><path d="M3 3l18 18" /></>),
  globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>),
  qr: (<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.01M17 21h4v-4M14 18v3" /></>),
  scan: (<><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M4 12h16" /></>),
  refresh: (<><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" /><path d="M20 20v-4h-4" /></>),
  shield: (<><path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6Z" /><path d="m9 12 2 2 4-4" /></>),
  lock: (<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  map: (<><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2Z" /><path d="M9 4v14M15 6v14" /></>),
  chart: (<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  server: (<><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></>),
  photo: (<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>),
  arrowLeft: (<path d="M19 12H5M11 6l-6 6 6 6" />),
  trash: (<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>),
  bell: (<><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>),
  phone: (<><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2" /></>),
  tower: (<><path d="M12 10v11M8.5 21 12 10l3.5 11" /><path d="M8 6.5a5 5 0 0 1 8 0M5.5 4a8.5 8.5 0 0 1 13 0" /><circle cx="12" cy="9" r="1.2" /></>),
};

export type IconName = keyof typeof paths;

export function Icon({ name, ...rest }: { name: IconName | string } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {paths[name] ?? paths.other}
    </svg>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1B1F24" />
      <path d="M32 13 51 47H13Z" fill="none" stroke="#E4572E" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="32" cy="40" r="3.4" fill="#F4F1EA" />
      <rect x="29.6" y="24" width="4.8" height="11" rx="2.4" fill="#F4F1EA" />
    </svg>
  );
}
