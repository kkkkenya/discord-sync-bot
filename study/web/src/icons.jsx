// Line icons, 20px, 1.75 stroke (styles.css .icon). Decorative: the label next to each says what it is.
const P = {
  today: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" /></>,
  units: <><path d="M5 5h14v14H5z" /><path d="M9 5v14M5 10h4M5 14h4" /></>,
  practise: <><path d="M4 20l4-1 11-11-3-3L5 16z" /><path d="M14 7l3 3" /></>,
  insights: <><path d="M4 20V4M4 20h16" /><path d="M8 16l4-5 3 3 5-6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M9 6l6 6-6 6" />,
};
export const Icon = ({ name }) => <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{P[name]}</svg>;
