// The desk's icons (#301, D-184): a 24 px grid, drawn with a 1.8 px line, and Maya's picture. Shared by the desk and
// its board (#320).

const ICONS = {
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 9.5V20h12V9.5" /></>,
  book: <><path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5Z" /><path d="M12 6.5v13" /></>,
  chart: <><path d="M5 20h14" /><path d="M8 16v-4" /><path d="M12 16V8" /><path d="M16 16v-6" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  sound: <><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" /><path d="M18 7a7 7 0 0 1 0 10" /></>,
  chat: <><path d="M5 6h14v9H10l-4 3.5V15H5z" /></>,
  phone: <><path d="M7 4h3l1.5 4-2 1.5a10 10 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 5 6a2 2 0 0 1 2-2Z" /></>,
  board: <><rect x="3.5" y="5" width="17" height="11" rx="1.5" /><path d="m8 13 2.5-3 2 2 3.5-4" /><path d="M9 20h6" /><path d="M12 16v4" /></>,
  pen: <><path d="M15.5 5.5 18.5 8.5 9 18l-4 1 1-4z" /><path d="m13.5 7.5 3 3" /></>,
  eraser: <><path d="m9.5 19-4-4a1.5 1.5 0 0 1 0-2l7.5-7.5a1.5 1.5 0 0 1 2 0l4 4a1.5 1.5 0 0 1 0 2L12 19z" /><path d="M9.5 19H19" /><path d="m8.5 10 5.5 5.5" /></>,
  undo: <><path d="M9 7 5 11l4 4" /><path d="M5 11h9a5 5 0 0 1 0 10h-2" /></>,
  send: <><path d="M5 12 19 5l-4 14-3-6z" /><path d="m12 13 7-8" /></>,
  close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
  page: <><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5Z" /><path d="M14 3.5V8h4" /><path d="M9.5 12.5h5" /><path d="M9.5 16h5" /></>,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></>,
} as const;

export function Icon({ name, size = 22 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg className="desk-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** Maya's picture, from the FigJam board (102:122). */
export function Avatar({ size }: { size: number }) {
  // A small fixed picture; the image optimizer adds nothing here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="desk-avatar" src="/desk/maya.webp" alt="" width={size} height={size} />;
}
