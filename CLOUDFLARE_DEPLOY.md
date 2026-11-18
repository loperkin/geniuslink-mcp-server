# Deploy to Cloudflare Workers

The Cloudflare Worker in `worker.js` exposes a **read-only, authenticated** MCP endpoint at `https://<your-worker>.workers.dev/mcp`.

## Cloudflare GitHub deployment settings

- Repository: `loperkin/geniuslink-mcp-server`
- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Preview builds: off for now
- Cloudflare Access: off **only because the Worker itself requires a secret bearer token on every /mcp request**

## Before connecting a client

In **Workers & Pages > geniuslink-mcp-server > Settings > Variables and Secrets**, add these **Secret** values:

- `MCP_AUTH_TOKEN`: generate a long, random, unique token (at least 32 random bytes). This token authenticates MCP clients. Do not reuse your Geniuslink API key.
- `GENIUSLINK_API_KEY`: your Geniuslink API key.
- `GENIUSLINK_API_SECRET`: your Geniuslink API secret.

**Never commit credentials to GitHub, enter them as plaintext environment variables, or paste them into chat.**

The Worker refuses MCP requests until `MCP_AUTH_TOKEN` is set. All MCP requests must send `Authorization: Bearer <MCP_AUTH_TOKEN>`. The `/mcp` endpoint supports stateless JSON-RPC MCP over POST. GET SSE streaming is not implemented. Some ChatGPT connection flows require OAuth instead of a static bearer token; if yours does, OAuth must be implemented before connection.

## Deployment and validation

1. Deploy from Cloudflare's connected GitHub repository.
2. Add the three secrets in Cloudflare's dashboard.
3. Check unauthenticated POST to `/mcp` returns HTTP 401, not analytics.
4. With your bearer token, send an MCP `initialize` JSON-RPC request and `tools/list`; then test `geniuslink_api_status`.
5. Finally test `geniuslink_list_links` with `{"take": 5}` against the live Geniuslink API. API authentication headers and v1 availability are **not yet verified against a live account**.

Note: A deployed Worker is not the same as a successfully connected ChatGPT app. Do not expose its token or use it with untrusted clients.

The original local stdio server remains available via `npm start`.
