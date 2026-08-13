# Build

Toolchain setup (pinned versions) · localnet quickstart · per-product fork
guides. See also field-notes.md.

## Hosting

Self-hosted on our own domain. Deployment is deferred until the site is complete
— no hosting platform is chosen or assumed, and nothing in this repo should
depend on one. Keep the build a plain static output plus the demo apps so that
stays true.

## Proving: local by default, hosted optional

Proving runs on a **local** proof server (`http://localhost:6300`) unless told
otherwise. That is the private option: proving consumes witness data, so a local
prover means secrets never leave the machine.

A **third-party hosted prover** — for example one running in a confidential space
— is supported as a configuration, not as an integration. Witness data does leave
the machine in that case, so it is only appropriate where the provider's TEE
attestation is part of your trust model.

**Status: placeholder.** The plumbing exists and is exercised by tests, but it has
not been pointed at a real provider. Expect to adjust the auth header shape to
whatever the provider actually wants.

Configure it entirely through the environment (see [.env.example](../.env.example)):

| Variable | Meaning |
|---|---|
| `MRA_PROOF_SERVER_URL` | Hosted prover base URL. Unset ⇒ local. |
| `MRA_PROOF_SERVER_API_KEY` | Required once the URL is set. |
| `MRA_PROOF_SERVER_AUTH_HEADER` | Header name. Default `Authorization`. |
| `MRA_PROOF_SERVER_AUTH_SCHEME` | Value prefix. Default `Bearer`; set empty for a bare key. |
| `MRA_PROOF_SERVER_TIMEOUT_MS` | Default 300 s local, 600 s hosted. |

Resolved by `resolveProofServer()` in `packages/network`, which enforces two rules:
the URL must be `https` (localhost exempt), and the API key is mandatory once a
URL is set. Both throw rather than warn. Use `describeProofServer()` for logging —
it redacts the key.

### The browser cannot keep an API key

`resolveProofServer()` reads `process.env`, which does not exist in a page, so a
browser always resolves to **local**. That default is deliberate.

To use a hosted prover from the browser, pass `proofServer` explicitly to
`createBrowserProviders`. Do **not** bake a key into the bundle — anything in the
page is readable by anyone who loads it, so a build-time key is a published key.
Either fetch a short-lived per-session token from your own backend at runtime, or
proxy proving through your backend and point the URL at the proxy. **Neither is
implemented here.**
