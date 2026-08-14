/**
 * The smallest router that can honestly be called one.
 *
 * Three pages do not justify a routing dependency. History-API paths (not hash
 * routes) so URLs read like the site plan — `/counter`, `/deposit` — which
 * works in Vite dev out of the box and on any static host with SPA fallback.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const PathContext = createContext('/');

export function usePath(): string {
  return useContext(PathContext);
}

export function navigate(to: string): void {
  history.pushState(null, '', to);
  dispatchEvent(new PopStateEvent('popstate'));
}

export function Link({
  to,
  className,
  children,
}: {
  readonly to: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        // Let modified clicks (new tab, etc.) behave like a normal link.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function Router({
  routes,
}: {
  /** Path → page, with '/' as the fallback for unknown paths. */
  readonly routes: Readonly<Record<string, ReactNode>>;
}) {
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const page = routes[path] ?? routes['/'];
  return <PathContext.Provider value={path}>{page}</PathContext.Provider>;
}
