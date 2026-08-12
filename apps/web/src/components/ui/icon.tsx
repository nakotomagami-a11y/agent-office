import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Icon registry. Mirrors the v3 `II.*` set in design-source/sprites.jsx,
 * collapsed into a single declarative component so callers say
 * <Icon name="home" /> instead of pulling individual symbols.
 *
 * Adding a new icon? Append a key to ICON_PATHS - the type updates itself.
 */

type IconShape = {
  /** viewBox override (defaults to "0 0 24 24") */
  viewBox?: string;
  /** stroke-only icons share these defaults; filled icons override via `fill` */
  fill?: "none" | "currentColor";
  stroke?: "none" | "currentColor";
  strokeWidth?: number;
  strokeLinecap?: "round" | "butt" | "square";
  strokeLinejoin?: "round" | "miter" | "bevel";
  /** raw inner JSX as a render fn so we don't ship dangerouslySetInnerHTML */
  body: React.ReactNode;
};

const STROKE_BASE: Omit<IconShape, "body"> = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const FILL_BASE: Omit<IconShape, "body"> = {
  fill: "currentColor",
  stroke: "none",
};

const ICON_PATHS = {
  home: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
      </>
    ),
  },
  users: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
        <path d="M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
  },
  activity: {
    ...STROKE_BASE,
    body: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  },
  settings: {
    ...STROKE_BASE,
    body: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>
    ),
  },
  templates: {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
  },
  memory: {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M7 10v4M11 10v4M15 10v4" />
      </>
    ),
  },
  plus: {
    ...STROKE_BASE,
    strokeWidth: 2,
    strokeLinejoin: undefined,
    body: <path d="M12 5v14M5 12h14" />,
  },
  send: {
    ...FILL_BASE,
    body: <path d="M3 11.5 21 3l-8.5 18-2-7.5-7.5-2z" />,
  },
  attach: {
    ...STROKE_BASE,
    body: (
      <path d="m21 12-9 9a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5" />
    ),
  },
  image: {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-5-5L5 21" />
      </>
    ),
  },
  slash: {
    ...STROKE_BASE,
    strokeLinejoin: undefined,
    body: <path d="m17 4-10 16" />,
  },
  copy: {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>
    ),
  },
  branch: {
    ...STROKE_BASE,
    body: (
      <>
        <circle cx="6" cy="6" r="2" />
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="8" r="2" />
        <path d="M6 8v8M8 6h5a5 5 0 0 1 5 5" />
      </>
    ),
  },
  refresh: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
        <path d="M21 3v5h-5" />
      </>
    ),
  },
  edit: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z" />
      </>
    ),
  },
  search: {
    ...STROKE_BASE,
    body: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
  },
  gauge: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M3.5 17a9 9 0 1 1 17 0" />
        <path d="m12 12 4-2" />
        <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      </>
    ),
  },
  x: {
    ...STROKE_BASE,
    strokeWidth: 2,
    strokeLinejoin: undefined,
    body: <path d="M6 6l12 12M18 6 6 18" />,
  },
  minus: {
    ...STROKE_BASE,
    strokeWidth: 2,
    body: <path d="M5 12h14" />,
  },
  chevron: {
    ...STROKE_BASE,
    body: <path d="m9 18 6-6-6-6" />,
  },
  "chevron-down": {
    ...STROKE_BASE,
    body: <path d="m6 9 6 6 6-6" />,
  },
  play: {
    ...FILL_BASE,
    body: <path d="M8 5v14l11-7z" />,
  },
  stop: {
    ...FILL_BASE,
    body: <rect x="6" y="6" width="12" height="12" rx="1" />,
  },
  map: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="m9 4-7 3v13l7-3 6 3 7-3V4l-7 3z" />
        <path d="M9 4v13M15 7v13" />
      </>
    ),
  },
  grid: {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </>
    ),
  },
  folder: {
    ...STROKE_BASE,
    body: (
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    ),
  },
  cpu: {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="5" y="5" width="14" height="14" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
      </>
    ),
  },
  sun: {
    ...STROKE_BASE,
    body: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </>
    ),
  },
  moon: {
    ...STROKE_BASE,
    body: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  },
  server: {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="2" y="3" width="20" height="6" rx="1" />
        <rect x="2" y="15" width="20" height="6" rx="1" />
        <path d="M6 6h.01M6 18h.01" />
      </>
    ),
  },
  globe: {
    ...STROKE_BASE,
    body: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
      </>
    ),
  },
  terminal: {
    ...STROKE_BASE,
    body: (
      <>
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </>
    ),
  },
  list: {
    ...STROKE_BASE,
    body: (
      <>
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </>
    ),
  },
  check: {
    ...STROKE_BASE,
    strokeWidth: 2.5,
    body: <polyline points="20 6 9 17 4 12" />,
  },
  "external-link": {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </>
    ),
  },
  layers: {
    ...STROKE_BASE,
    body: (
      <>
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </>
    ),
  },
  crosshair: {
    ...STROKE_BASE,
    body: (
      <>
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="1" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="1" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="23" y2="12" />
      </>
    ),
  },
  cursor: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51z" />
        <path d="m13 13 6 6" />
      </>
    ),
  },
  hammer: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="m15 12-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9" />
        <path d="M17.64 15 22 10.64" />
        <path d="m20.91 11.7-1.25-1.25c.16-.63.2-1.3.1-1.96l1.13-1.12a2.5 2.5 0 0 0 0-3.54l-1.82-1.82a2.5 2.5 0 0 0-3.54 0l-1.12 1.13c-.66-.1-1.33-.06-1.96.1L11.1 2c-.63.63-.63 1.65 0 2.28l1.12 1.12" />
      </>
    ),
  },
  pen: {
    ...STROKE_BASE,
    body: (
      <>
        <line x1="18" y1="2" x2="22" y2="6" />
        <path d="M7.5 20.5 19 9l-4-4L3.5 16.5 2 22z" />
      </>
    ),
  },
  trash: {
    ...STROKE_BASE,
    body: (
      <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </>
    ),
  },
  pin: {
    ...STROKE_BASE,
    body: (
      <>
        <line x1="12" y1="17" x2="12" y2="22" />
        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
      </>
    ),
  },
  undo: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M3 7v6h6" />
        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
      </>
    ),
  },
  redo: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M21 7v6h-6" />
        <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
      </>
    ),
  },
  "help-circle": {
    ...STROKE_BASE,
    body: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>
    ),
  },
  "paint-bucket": {
    ...STROKE_BASE,
    body: (
      <>
        <path d="m19 11-8-8-8.5 8.5a5.5 5.5 0 0 0 7.78 7.78L19 11Z" />
        <path d="m5 2 5 5" />
        <path d="M17.5 17.5c1.1 1.1 1.5 2 1.5 3a2 2 0 0 1-4 0c0-1 .4-1.9 1.5-3Z" />
      </>
    ),
  },
  eyedrop: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="m2 22 1-1h3l9-9" />
        <path d="M3 21v-3l9-9" />
        <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
      </>
    ),
  },
  download: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </>
    ),
  },
  upload: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </>
    ),
  },
  shield: {
    ...STROKE_BASE,
    body: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  },
  bot: {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
        <line x1="8" y1="16" x2="8" y2="16" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="16" x2="16" y2="16" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  archive: {
    ...STROKE_BASE,
    body: (
      <>
        <polyline points="21 8 21 21 3 21 3 8" />
        <rect x="1" y="3" width="22" height="5" />
        <line x1="10" y1="12" x2="14" y2="12" />
      </>
    ),
  },
  zap: {
    ...STROKE_BASE,
    body: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  },
  filter: {
    ...STROKE_BASE,
    body: <path d="M3 4h18l-7 9v6l-4 2v-8z" />,
  },
  "branch-ao": {
    ...STROKE_BASE,
    body: (
      <>
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="6" cy="18" r="2.5" />
        <path d="M6 8.5v7" />
        <path d="M18 8.5c0 4-6 3-6 7" />
      </>
    ),
  },
  "corner-down": {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M9 10l-5 5 5 5" />
        <path d="M20 4v7a4 4 0 0 1-4 4H4" />
      </>
    ),
  },
  sparkle: {
    ...STROKE_BASE,
    body: <path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7z" />,
  },
  "bot-ao": {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="3" y="8" width="18" height="12" rx="2" />
        <path d="M12 8V4" />
        <circle cx="9" cy="14" r="1" />
        <circle cx="15" cy="14" r="1" />
        <path d="M8 4h8" />
      </>
    ),
  },
  identity: {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="11" r="2.5" />
        <path d="M14 9h4" />
        <path d="M14 13h3" />
        <path d="M5 17.5c.7-1.6 2.3-2.5 4-2.5s3.3.9 4 2.5" />
      </>
    ),
  },
  wrench: {
    ...STROKE_BASE,
    body: <path d="M14.7 6.3a4 4 0 1 1 3 3L6 21l-3-3 11.7-11.7" />,
  },
  book: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" />
        <path d="M4 17h12" />
      </>
    ),
  },
  bookmark: {
    ...STROKE_BASE,
    body: <path d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z" />,
  },
  eye: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  code: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M16 18l6-6-6-6" />
        <path d="M8 6l-6 6 6 6" />
      </>
    ),
  },
  "terminal-ao": {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 9l3 3-3 3" />
        <path d="M13 15h4" />
      </>
    ),
  },
  bold: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M7 5h6a3 3 0 0 1 0 6H7z" />
        <path d="M7 11h7a3 3 0 0 1 0 6H7z" />
      </>
    ),
  },
  italic: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M19 4h-9" />
        <path d="M14 20H5" />
        <path d="M15 4L9 20" />
      </>
    ),
  },
  heading: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M6 4v16" />
        <path d="M18 4v16" />
        <path d="M6 12h12" />
      </>
    ),
  },
  link: {
    ...STROKE_BASE,
    body: (
      <>
        <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
        <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
      </>
    ),
  },
  lock: {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
  },
  "more-horizontal": {
    ...FILL_BASE,
    body: (
      <>
        <circle cx="5" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="19" cy="12" r="1.5" />
      </>
    ),
  },
  smartphone: {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  monitor: {
    ...STROKE_BASE,
    body: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  },
  "git-commit": {
    ...STROKE_BASE,
    body: (
      <>
        <circle cx="12" cy="12" r="3" />
        <line x1="3" y1="12" x2="9" y2="12" />
        <line x1="15" y1="12" x2="21" y2="12" />
      </>
    ),
  },
} as const;

export type IconName = keyof typeof ICON_PATHS;

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  /** Pixel size; defaults to inheriting from the surrounding `.i` rule (16px). */
  size?: number;
  /** Optional accessible label - when omitted the icon is `aria-hidden`. */
  label?: string;
};

export function Icon({
  name,
  size,
  label,
  className,
  width,
  height,
  ...rest
}: IconProps) {
  const shape = ICON_PATHS[name];
  const ariaProps = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true };
  const dimProps =
    size !== undefined
      ? { width: size, height: size }
      : { width: width ?? undefined, height: height ?? undefined };

  return (
    <svg
      viewBox={shape.viewBox ?? "0 0 24 24"}
      className={cn("w-4 h-4 shrink-0 [flex:0_0_16px]", className)}
      fill={shape.fill}
      stroke={shape.stroke}
      strokeWidth={shape.strokeWidth}
      strokeLinecap={shape.strokeLinecap}
      strokeLinejoin={shape.strokeLinejoin}
      {...dimProps}
      {...ariaProps}
      {...rest}
    >
      {shape.body}
    </svg>
  );
}
