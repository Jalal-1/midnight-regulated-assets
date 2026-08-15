/**
 * Dark is the brand default; light is the explicit exception. The choice is
 * carried on <html> so the tokens flip everywhere (including body background),
 * and persisted so it survives navigation and reload.
 */

import { useEffect, useState } from 'react';

const THEME_KEY = 'mdd.theme.v1';

export function useTheme(): ['dark' | 'light', () => void] {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* private browsing */
    }
  }, [theme]);

  return [theme, () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))];
}
