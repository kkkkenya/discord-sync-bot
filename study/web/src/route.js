import { useEffect, useState } from 'react';

// Hash routes: #/today, #/units, #/unit/EMM-302/papers, #/practise, #/insights. A unit code travels with a dash
// for its space, so links stay readable.
export const unitSlug = (code) => String(code || '').replace(/\s+/g, '-');
export const unitCode = (slug) => String(slug || '').replace(/-/g, ' ');
export const href = (...parts) => `#/${parts.filter(Boolean).join('/')}`;

const parse = () => {
  const [name = 'today', ...rest] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  return { name, rest };
};

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => { setRoute(parse()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (to) => { location.hash = to; };
