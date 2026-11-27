export function Sprite() {
  return (
    <svg className="sprite" aria-hidden="true">
      <symbol id="i-spark" viewBox="0 0 16 16"><path d="M8 1.2 9.4 6l4.8 1.4-4.8 1.5L8 14.8 6.6 8.9 1.8 7.4 6.6 6Z" fill="currentColor" /></symbol>
      <symbol id="i-refresh" viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 3v4H9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" /></symbol>
      <symbol id="i-layers" viewBox="0 0 16 16"><path d="m8 2.5 5 2.7-5 2.7-5-2.7Zm-5 5 5 2.7 5-2.7M3 10.8l5 2.7 5-2.7" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /></symbol>
      <symbol id="i-folder" viewBox="0 0 16 16"><path d="M2.5 4h4l1.2 1.5h5.8v7H2.5Z" fill="none" stroke="currentColor" strokeWidth="1.1" /></symbol>
      <symbol id="i-check" viewBox="0 0 16 16"><path d="m3.2 8.4 3.1 3.1 6.5-6.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" /></symbol>
      <symbol id="i-x" viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" /></symbol>
      <symbol id="i-play" viewBox="0 0 16 16"><path d="M5 3.2 12 8l-7 4.8Z" fill="currentColor" /></symbol>
      <symbol id="i-image" viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" /><circle cx="6" cy="6.3" r="1.1" fill="currentColor" /><path d="m4 12 3-3 2 2 1.6-1.7L13 12" fill="none" stroke="currentColor" strokeWidth="1.1" /></symbol>
      <symbol id="i-wave" viewBox="0 0 16 16"><path d="M2 9h1.5V7H2Zm3 2h1.5V5H5Zm3-4h1.5V3H8Zm3 5h1.5V4H11Zm3-2h1.5V6H14Z" fill="currentColor" /></symbol>
      <symbol id="i-more" viewBox="0 0 16 16"><circle cx="3.2" cy="8" r=".9" fill="currentColor" /><circle cx="8" cy="8" r=".9" fill="currentColor" /><circle cx="12.8" cy="8" r=".9" fill="currentColor" /></symbol>
      <symbol id="i-download" viewBox="0 0 16 16"><path d="M8 3v8m-3-3 3 3 3-3M3 12v1.5h10V12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" /></symbol>
      <symbol id="i-search" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="m10 10 3 3" fill="none" stroke="currentColor" strokeWidth="1.2" /></symbol>
      <symbol id="i-plus" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.4" /></symbol>
      <symbol id="i-minus" viewBox="0 0 16 16"><path d="M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.4" /></symbol>
      <symbol id="i-fit" viewBox="0 0 16 16"><path d="M3 6V3h3M13 6V3H10M3 10v3h3m7-3v3h-3" fill="none" stroke="currentColor" strokeWidth="1.2" /></symbol>
      <symbol id="i-grid" viewBox="0 0 16 16"><path d="M3 3h10v10H3zM3 8h10M8 3v10" fill="none" stroke="currentColor" strokeWidth="1.1" /></symbol>
      <symbol id="i-trash" viewBox="0 0 16 16"><path d="M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.6 8h4.8l.6-8" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="square" /></symbol>
    </svg>
  );
}

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={className ?? 'icon'}>
      <use href={`#i-${name}`} />
    </svg>
  );
}
