import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

/**
 * The Midnight stack was written for Node, so a browser build needs three things
 * that a plain React app does not:
 *
 *   wasm            @midnightntwrk/ledger-v9 is WebAssembly.
 *   nodePolyfills   the wallet SDK uses Buffer and process throughout.
 *
 * Top-level await needs no plugin: `build.target: 'esnext'` supports it natively,
 * and vite-plugin-top-level-await additionally requires rollup to be installed.
 *
 * The compiler's managed/ output is served from web/public/managed (symlinked by
 * `yarn ui:assets`) so FetchZkConfigProvider can fetch proving keys over HTTP.
 */
export default defineConfig({
  root: 'web',
  plugins: [
    react(),
    wasm(),
    nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
  ],
  /**
   * bn.js MUST be a single module instance.
   *
   * The wallet SDK's node-client validates RPC results with a schema that does
   * an `instanceof BN` check. Vite's dependency pre-bundling can hand
   * @polkadot/util one copy of bn.js and the schema another, so a perfectly good
   * BN fails validation with the very confusing
   *   "Expected BN, actual 581"
   * — 581 being the block number the transaction was already included in.
   * Deduping collapses them to one class so `instanceof` holds.
   */
  resolve: { dedupe: ['bn.js', '@polkadot/util', '@polkadot/api', '@polkadot/types'] },
  server: { port: 5173, strictPort: true, fs: { allow: ['..', '../..', '../../..'] } },
  optimizeDeps: { exclude: ['@midnightntwrk/ledger-v9'], include: ['bn.js'] },
  build: { target: 'esnext', outDir: '../dist-web', emptyOutDir: true },
});
