/**
 * The portal's top navigation. Six primary sections, per the information
 * architecture; the active section is derived from the current path.
 */

import LogoMark from './Logo.tsx';
import NetPill from './NetPill.tsx';
import { Link, usePath } from './router.tsx';
import { useTheme } from './theme.ts';

const SECTIONS = [
  { to: '/why', label: 'Why Midnight' },
  { to: '/compare', label: 'Compare' },
  { to: '/learn', label: 'Learn & Try' },
  { to: '/solutions', label: 'Solutions' },
  { to: '/standards', label: 'Standards' },
  { to: '/build', label: 'Build' },
] as const;

export default function SiteNav({ chainId = null }: { readonly chainId?: string | null }) {
  const path = usePath();
  const [theme, toggleTheme] = useTheme();

  return (
    <nav className="site-nav">
      <Link to="/" className="site-nav-brand" aria-label="Home">
        <LogoMark className="brand-logo" />
        <span className="site-nav-title">Regulated assets on Midnight</span>
      </Link>
      <div className="site-nav-links">
        {SECTIONS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className={path.startsWith(s.to) ? 'site-nav-link active' : 'site-nav-link'}
          >
            {s.label}
          </Link>
        ))}
      </div>
      <div className="site-nav-right">
        <NetPill chainId={chainId} />
        <button className="theme-btn" onClick={toggleTheme}>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
    </nav>
  );
}
