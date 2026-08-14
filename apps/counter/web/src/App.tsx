/**
 * The site shell: three pages behind a deliberately tiny router.
 *
 *   /                   the homepage — pick the example you came for
 *   /counter            the toolchain proof (dashboard)
 *   /unshielded-token   the unshielded contract token (tokenised-deposit design option 1)
 *
 * Unknown paths fall back to the homepage.
 */

import CounterPage from './CounterPage.tsx';
import PublicTokenPage from './deposit/PublicTokenPage.tsx';
import Home from './Home.tsx';
import { Router } from './router.tsx';

export default function App() {
  return (
    <Router
      routes={{
        '/': <Home />,
        '/counter': <CounterPage />,
        '/unshielded-token': <PublicTokenPage />,
        // Old link kept working; the page was briefly published under this path.
        '/deposit': <PublicTokenPage />,
      }}
    />
  );
}
