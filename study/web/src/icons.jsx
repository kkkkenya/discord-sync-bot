// Line icons, 20px, 1.75 stroke (styles.css .icon). Decorative: the label next to each says what it is.
// Named groups (hand, lid, pen, line, bellg, lens, gear) are the parts styles.css moves when a tab becomes current.
const P = {
  today: <><circle cx="12" cy="12" r="8.5" /><g className="hand"><path d="M12 7.5V12l3 2" /></g></>,
  units: <><g className="lid"><rect x="3.5" y="4.5" width="17" height="4" rx="1.2" /></g><path d="M5 8.5v9.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V8.5" /><path d="M10 12.5h4" /></>,
  practise: <g className="pen"><path d="M15.5 4.5l4 4L9 19l-4.5 1 1-4.5z" /><path d="M13.5 6.5l4 4" /></g>,
  insights: <><path d="M4 19.5h16" /><polyline className="line" points="5,15 9.5,10.5 13,13 19,6.5" /></>,
  search: <g className="lens"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></g>,
  bell: <g className="bellg"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></g>,
  settings: <g className="gear"><path d="M10.3 4.3c.4-1.7 2.9-1.7 3.4 0a1.7 1.7 0 0 0 2.5 1.1c1.6-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1.1 2.5c1.7.4 1.7 2.9 0 3.4a1.7 1.7 0 0 0-1.1 2.5c.9 1.6-.8 3.3-2.4 2.4a1.7 1.7 0 0 0-2.5 1.1c-.4 1.7-2.9 1.7-3.4 0a1.7 1.7 0 0 0-2.5-1.1c-1.6.9-3.3-.8-2.4-2.4a1.7 1.7 0 0 0-1.1-2.5c-1.7-.4-1.7-2.9 0-3.4a1.7 1.7 0 0 0 1.1-2.5c-.9-1.6.8-3.3 2.4-2.4a1.7 1.7 0 0 0 2.5-1.1z" /><circle cx="12" cy="12" r="3" /></g>,
  user: <><circle cx="12" cy="9" r="3.5" /><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  down: <path d="M7 10l5 5 5-5" />,
  timer: <><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2 1.5M10 3h4" /></>,
  play: <path d="M8 5.5v13l10-6.5z" />,
  pause: <path d="M9 5.5v13M15 5.5v13" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.4 4.6-5" /></>,
  prompt: <><path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 3.5v-3.5h0a1.5 1.5 0 0 1-1.5-1.5z" /><path d="M8.5 9h7M8.5 12h4.5" /></>,
  file: <><path d="M7 3.5h7l4 4v13H7z" /><path d="M14 3.5v4h4" /></>,
  pin: <><path d="M9 4.5h6l-1 5 3 3H7l3-3z" /><path d="M12 12.5v7" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="1.8" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>,
  trash: <><path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" /></>,
  notes: <><path d="M5.5 4.5h13v10l-5 5h-8z" /><path d="M13.5 19.5v-5h5M8.5 8.5h7M8.5 11.5h4" /></>,
};
export const Icon = ({ name }) => <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{P[name]}</svg>;
