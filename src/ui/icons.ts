// Simple line icons as inline SVG. Stroke colour comes from CSS currentColor.
const wrap = (body: string, extraClass = ''): string =>
  `<svg class="icon ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const SUN =
  '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>';
const CUP =
  '<path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8.5 6.5c0-1 .8-1.2.8-2.2M11.5 6.5c0-1 .8-1.2.8-2.2"/>';
const CROSS = '<path d="M4 20L20 4"/>';
const LENS = '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>';

export const ICONS = {
  sun: wrap(SUN),
  noSun: wrap(SUN + CROSS),
  cup: wrap(CUP),
  noCup: wrap(CUP + CROSS),
  sleep: wrap(
    '<circle cx="12" cy="12" r="8.5"/><path d="M8 10.5c.7-.7 1.6-.7 2.3 0M13.7 10.5c.7-.7 1.6-.7 2.3 0"/><ellipse cx="12" cy="15" rx="1.4" ry="1.8"/>',
  ),
  bed: wrap('<path d="M3 18V8M3 12h18v6M3 15h18M6 12V9.5h5V12"/>'),
  moon: wrap('<path d="M15.5 3.5a8.5 8.5 0 1 0 5 15 7 7 0 0 1-5-15z"/>'),
  plane: wrap('<path d="M2.5 16l19-9-4 8.5 3 4.5-6.5-2.5L9 20l.5-5.5z"/>'),
  landing: wrap(
    '<path d="M3 20h18M4 13l14 3.5c1 .3 1.8-.3 1.8-1.2 0-.6-.4-1.1-1-1.3L14 12.5l-4-7-2 .5 1.7 6.3L6 11.5l-1.5-2-1.5.5z"/>',
  ),
  pill: wrap(
    '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M9.5 8.5l5 7" transform="rotate(-35 12 12)"/>',
  ),
  lamp: wrap('<path d="M9 3h6l3 9H6z M12 12v6M8 21h8"/>'),
  clock: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  globe: wrap(
    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.8 2.5 4 5.3 4 8.5s-1.2 6-4 8.5c-2.8-2.5-4-5.3-4-8.5s1.2-6 4-8.5z"/>',
  ),
  calendar: wrap('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  link: wrap(
    '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  ),
  check: wrap('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  edit: wrap('<path d="M4 20h4l11-11-4-4L4 16z M13 7l4 4"/>'),
  zoomIn: wrap(LENS + '<path d="M10.5 7.5v6M7.5 10.5h6"/>'),
  zoomOut: wrap(LENS + '<path d="M7.5 10.5h6"/>'),
  days: wrap('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  chevron: wrap('<path d="M6 9l6 6 6-6"/>', 'chevron'),
} as const;

export type IconName = keyof typeof ICONS;
