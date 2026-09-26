// Small hand-drawn icon set replacing lucide-react (no npm package needed).
// Same minimalist stroke style (24x24, round caps/joins, currentColor) but
// original path data — only the icons actually rendered anywhere in the
// old HomeView/NamingView/ScoringView/ResultsView are included.

const ICON_PATHS = {
  trophy: `
    <path d="M8 4h8v4a4 4 0 0 1-4 4a4 4 0 0 1-4-4V4z"/>
    <path d="M8 5H5a2 2 0 0 0 2 4"/>
    <path d="M16 5h3a2 2 0 0 1-2 4"/>
    <path d="M12 12v3"/>
    <path d="M9 19h6"/>
    <path d="M10 19v-2a2 2 0 0 1 4 0v2"/>
  `,
  'plus-circle': `
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 8v8M8 12h8"/>
  `,
  history: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 7v5l4 2"/>
  `,
  trash: `
    <path d="M4 7h16"/>
    <path d="M9 7V4h6v3"/>
    <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>
    <path d="M10 11v6M14 11v6"/>
  `,
  users: `
    <circle cx="9" cy="8" r="3"/>
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
    <circle cx="17.5" cy="9" r="2.3"/>
    <path d="M15.7 20a5.2 5.2 0 0 1 5.3-5.3"/>
  `,
  play: `
    <path d="M7 4l13 8-13 8V4z"/>
  `,
  crown: `
    <path d="M4 18h16l-1.2-9-4.3 4-2.5-6.5-2.5 6.5-4.3-4L4 18z"/>
  `,
  calendar: `
    <rect x="4" y="5" width="16" height="16" rx="2"/>
    <path d="M4 10h16"/>
    <path d="M8 3v4M16 3v4"/>
  `,
  'alert-triangle': `
    <path d="M12 4l9 16H3L12 4z"/>
    <path d="M12 10v4"/>
    <path d="M12 17.02v.01"/>
  `,
  'arrow-right': `
    <path d="M4 12h16M14 6l6 6-6 6"/>
  `,
  'user-plus': `
    <circle cx="9" cy="8" r="3"/>
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
    <path d="M19 8v4M17 10h4"/>
  `,
  'check-circle': `
    <circle cx="12" cy="12" r="9"/>
    <path d="M8 12.5l3 3 5-6"/>
  `,
  shuffle: `
    <path d="M3 7h5l4 5.5 4-5.5h5"/>
    <path d="M17 5l4 2-4 2"/>
    <path d="M3 17h5l3.5-4.8"/>
    <path d="M13.5 12.8L16 16"/>
    <path d="M17 14.6l4 2.4-4 2"/>
  `,
  share: `
    <circle cx="6" cy="12" r="2.4"/>
    <circle cx="18" cy="6" r="2.4"/>
    <circle cx="18" cy="18" r="2.4"/>
    <path d="M8.3 10.7l7.4-4.4M8.3 13.3l7.4 4.4"/>
  `,
  home: `
    <path d="M4 11l8-7 8 7"/>
    <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/>
    <path d="M10 20v-5h4v5"/>
  `,
  activity: `
    <path d="M3 12h4l3 8 4-16 3 8h4"/>
  `,
  'alert-circle': `
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 8v5"/>
    <path d="M12 16.02v.01"/>
  `,
  'chevron-right': `
    <path d="M9 5l7 7-7 7"/>
  `,
  check: `
    <path d="M5 12.5l5 5L19 7"/>
  `,
};

// Returns an inline <svg> markup string. `cls` is appended to the default
// "icon" class so callers can size/color it from CSS.
export function icon(name, cls = '') {
  const paths = ICON_PATHS[name];
  if (!paths) {
    console.warn(`icon(): unknown icon "${name}"`);
    return '';
  }
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
