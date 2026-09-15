/** Inline stroke icons — paths lifted verbatim from the design handoff. */

const PATHS: Record<string, string> = {
  inbox: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  list: 'M3 6h18 M7 12h14 M3 18h12',
  plus: 'M12 5v14 M5 12h14',
  chart: 'M9 17V9 M13 17V13 M17 17V11',
  search: 'M21 21l-4.3-4.3',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  clock: 'M12 6v6l4 2',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  send: 'M22 7l-10 5L2 7 M2 4h20v16H2z',
  edit: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  check: 'M20 6L9 17l-5-5',
  chevronStart: 'M15 18l-6-6 6-6', // points toward the inline-start (RTL: "next/open")
  chevronEnd: 'M9 18l6-6-6-6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  printer: 'M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z',
  users: 'M9 7a4 4 0 1 1 0 .01 M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2',
  calendar: 'M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4',
  layers: 'M12 3l9 6-9 6-9-6 9-6z M3 14l9 6 9-6',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  building: 'M4 22V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v18 M15 9h4a1 1 0 0 1 1 1v12 M8 7h3 M8 11h3 M8 15h3',
  // theme toggle (§3-د) — glyphs lifted verbatim from design-v2-ref/dashboard.dc.html
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  sun: 'M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M4.93 19.07l1.41-1.41 M17.66 6.34l1.41-1.41',
  // ت6 — the clipboard glyph (feather «copy»): the front sheet is the rect in extra() below
  copy: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  // toast marks / dismiss
  alert: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  close: 'M18 6L6 18 M6 6l12 12',
};

/** Icons whose glyph needs a leading circle/rect the stroke path assumes. */
function extra(name: string): JSX.Element | null {
  switch (name) {
    case 'search':
    case 'clock':
      return <circle cx={name === 'search' ? 11 : 12} cy={name === 'search' ? 11 : 12} r={name === 'search' ? 7 : 10} />;
    case 'eye':
      return <circle cx="12" cy="12" r="3" />;
    case 'chart':
      return <rect x="3" y="3" width="18" height="18" rx="2" />;
    case 'lock':
      return <rect x="3" y="11" width="18" height="11" rx="2" />;
    case 'copy':
      return <rect x="9" y="9" width="13" height="13" rx="2" />;
    case 'sun':
      return <circle cx="12" cy="12" r="4" />;
    default:
      return null;
  }
}

export interface IconProps {
  name: keyof typeof PATHS | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, className, strokeWidth = 1.75 }: IconProps) {
  const d = PATHS[name];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {extra(name)}
      {d?.split(' M').map((seg, i) => <path key={i} d={i === 0 ? seg : `M${seg}`} />)}
    </svg>
  );
}
