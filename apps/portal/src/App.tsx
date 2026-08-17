/**
 * The portal: six primary sections over a deliberately tiny router.
 *
 *   /                         institutional homepage (root)
 *   /studio                   guided issuance dashboard
 *   /why                      Why Midnight
 *   /compare                  Compare asset models (registry-driven)
 *   /learn                    Learn & Try index (labs + status pages + concepts)
 *   /learn/topic#<chapter>    architecture concepts (interactive teaching models)
 *   /labs/public-token        guided lab — transparency baseline (real lifecycle)
 *   /labs/confidential-token  guided lab — the CFT (real lifecycle)
 *   /models/<id>              honest status pages for models without lifecycles
 *   /solutions[/…]            product compositions
 *   /standards                Standards & assurance
 *   /build                    runbook; /build/counter — the counter diagnostic
 *
 * Old paths redirect so no link ever breaks.
 */

import { useEffect } from 'react';

import { navigate, Router } from '@mra/lab-shell';

import CounterPage from './CounterPage.tsx';
import ConfidentialTokenLab from './labs/ConfidentialTokenLab.tsx';
import PublicTokenLab from './labs/PublicTokenLab.tsx';
import Learn from './learn/Learn.tsx';
import LearnTopic from './learn/LearnTopic.tsx';
import BuildPage from './pages/BuildPage.tsx';
import Compare from './pages/Compare.tsx';
import Home from './pages/Home.tsx';
import ModelStatusPage from './pages/ModelStatusPage.tsx';
import Solutions from './pages/Solutions.tsx';
import Studio from './studio/Studio.tsx';
import SolutionDeposits from './pages/SolutionDeposits.tsx';
import SolutionRwa from './pages/SolutionRwa.tsx';
import Standards from './pages/Standards.tsx';
import Why from './pages/Why.tsx';

function NotFound() {
  return (
    <div className="portal-inner prose" style={{ paddingTop: 80 }}>
      <h1>Page not found</h1>
      <p>
        This address does not exist. <a href="/">Go to the homepage</a> or open the{' '}
        <a href="/studio">Asset dashboard</a>.
      </p>
    </div>
  );
}

/** Full-page redirect — for targets the SPA navigate path cannot re-render reliably. */
function HardRedirect({ to }: { readonly to: string }) {
  useEffect(() => {
    location.replace(to + location.search + location.hash);
  }, [to]);
  return null;
}

function Redirect({ to }: { readonly to: string }) {
  useEffect(() => {
    // Preserve query and hash: /counter?autorun must land as /build/counter?autorun.
    navigate(to + location.search + location.hash);
  }, [to]);
  return null;
}

export default function App() {
  return (
    <Router
      routes={{
        '/': <Home />,
        '/studio': <Studio />,
        '/portal': <HardRedirect to="/" />,
        '/why': <Why />,
        '/compare': <Compare />,
        '/learn': <Learn />,
        '/learn/topic': <LearnTopic />,
        '/labs/public-token': <PublicTokenLab />,
        '/labs/confidential-token': <ConfidentialTokenLab />,
        '/models/native-unshielded': <ModelStatusPage id="native-unshielded" />,
        '/models/native-shielded': <ModelStatusPage id="native-shielded" />,
        '/models/shielded-contract-token': <ModelStatusPage id="shielded-contract-token" />,
        '/solutions': <Solutions />,
        '/solutions/tokenised-deposits': <SolutionDeposits />,
        '/solutions/rwa': <SolutionRwa />,
        '/standards': <Standards />,
        '/build': <BuildPage />,
        '/build/counter': <CounterPage />,
        // Legacy paths — published in earlier iterations; keep them working.
        '/counter': <Redirect to="/build/counter" />,
        '/unshielded-token': <Redirect to="/labs/public-token" />,
        '/deposit': <Redirect to="/labs/public-token" />,
        '/examples': <Redirect to="/learn" />,
        '*': <NotFound />,
      }}
    />
  );
}
