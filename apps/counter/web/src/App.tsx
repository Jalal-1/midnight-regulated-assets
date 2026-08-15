/**
 * The site shell: three pages behind a deliberately tiny router.
 *
 *   /                   the front door — Learn or Try
 *   /learn              the architecture, in four chapters
 *   /learn/topic        one chapter (selected by #hash), article + interactive model
 *   /examples           the live examples index
 *   /counter            the toolchain proof (dashboard)
 *   /unshielded-token   the unshielded contract token (tokenised-deposit design option 1)
 *
 * Unknown paths fall back to the front door.
 */

import CounterPage from './CounterPage.tsx';
import PublicTokenPage from './deposit/PublicTokenPage.tsx';
import Home from './Home.tsx';
import Landing from './Landing.tsx';
import Learn from './learn/Learn.tsx';
import LearnTopic from './learn/LearnTopic.tsx';
import { Router } from './router.tsx';

export default function App() {
  return (
    <Router
      routes={{
        '/': <Landing />,
        '/learn': <Learn />,
        '/learn/topic': <LearnTopic />,
        '/examples': <Home />,
        '/counter': <CounterPage />,
        '/unshielded-token': <PublicTokenPage />,
        // Old link kept working; the page was briefly published under this path.
        '/deposit': <PublicTokenPage />,
      }}
    />
  );
}
