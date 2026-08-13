/**
 * Dev-only log sidecar.
 *
 * Streams `docker logs -f` for the three localnet containers to the browser over
 * SSE, so the page can show what the node, indexer, and proof server are actually
 * doing. The proof server is the reason this exists: it exposes no metrics
 * endpoint, so its --verbose output is the only window into its behaviour.
 *
 *   yarn logs            # then the page connects to http://127.0.0.1:8899/logs
 *
 * DEVELOPMENT ONLY. This deliberately does not ship with the site:
 *
 *  - It binds to 127.0.0.1 only. Container logs are not something to expose on a
 *    network interface.
 *  - Container names come from a fixed allowlist, never from the request. No
 *    request input is ever interpolated into a command.
 *  - It is localnet-shaped by nature: against Stagenet you do not own the node,
 *    so there are no logs to tail.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const PORT = Number(process.env.LOG_SIDECAR_PORT ?? 8899);
const HOST = '127.0.0.1';
const ALLOWED_ORIGIN = process.env.LOG_SIDECAR_ORIGIN ?? 'http://localhost:5173';
const TAIL = process.env.LOG_SIDECAR_TAIL ?? '25';

/**
 * Fixed allowlist: label → container name. Nothing from the request reaches
 * `spawn`, so a caller cannot read arbitrary containers.
 */
const CONTAINERS = Object.freeze({
  node: process.env.LOG_SIDECAR_NODE ?? 'localnet-node-1',
  indexer: process.env.LOG_SIDECAR_INDEXER ?? 'localnet-indexer-1',
  proof: process.env.LOG_SIDECAR_PROOF ?? 'localnet-proof-server-1',
});

/**
 * Strip ANSI colour and the container's own timestamp prefix.
 *
 * The proof server logs through actix with colour enabled, which arrives as
 * escape sequences and renders as "[2m2026-08-13T…[0m [32m INFO[0m" in a browser.
 */
// eslint-disable-next-line no-control-regex
const ANSI = /\u001B\[[0-9;]*m/g;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?\s*/;

/**
 * Longest line forwarded to the page.
 *
 * The proof server's DEBUG output dumps the whole proving preimage as hex —
 * several thousand characters of witness-derived data per request. Truncating is
 * both practical (it would swamp the panel) and prudent: proof preimages are not
 * something to render in a UI or capture in a screenshot.
 */
const MAX_LINE = 240;

const clean = (line) => {
  const text = line.replace(ANSI, '').replace(TIMESTAMP, '').trimEnd();
  if (text.length <= MAX_LINE) return text;
  return `${text.slice(0, MAX_LINE)}… [${text.length - MAX_LINE} more chars truncated]`;
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${HOST}:${PORT}`);

  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    Vary: 'Origin',
  };

  if (url.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    response.end(JSON.stringify({ ok: true, sources: Object.keys(CONTAINERS) }));
    return;
  }

  if (url.pathname !== '/logs') {
    response.writeHead(404, cors);
    response.end();
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...cors,
  });

  const send = (event, data) => {
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send('open', { sources: Object.keys(CONTAINERS), tail: Number(TAIL) });

  const children = [];
  for (const [source, container] of Object.entries(CONTAINERS)) {
    // Arguments are fixed constants — never request-derived.
    const child = spawn('docker', ['logs', '-f', '--tail', TAIL, container], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);

    let buffered = '';
    const onChunk = (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        const text = clean(line);
        if (text) send('line', { source, text });
      }
    };

    // Docker sends container stdout and stderr separately; both are wanted.
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.on('error', (error) => send('line', { source, text: `sidecar: ${error.message}` }));
    child.on('exit', (code) =>
      send('line', {
        source,
        text: `sidecar: docker logs exited (${code}) — is ${container} running?`,
      }),
    );
  }

  // Keep proxies and idle connections from dropping the stream.
  const keepAlive = setInterval(() => response.write(': keep-alive\n\n'), 20_000);

  request.on('close', () => {
    clearInterval(keepAlive);
    for (const child of children) child.kill('SIGTERM');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`log sidecar on http://${HOST}:${PORT}/logs (dev only)`);
  console.log(`  sources: ${Object.entries(CONTAINERS).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`  allowing origin: ${ALLOWED_ORIGIN}`);
});
