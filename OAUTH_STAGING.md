# Staging OAuth deployment (does not replace production)

Staging Worker: `geniuslink-mcp-oauth-test.purposeinpractice5.workers.dev`

Production Worker remains: `geniuslink-mcp-server.purposeinpractice5.workers.dev`

## 1. GitHub OAuth staging app

Create **a separate GitHub OAuth App** in GitHub Developer Settings:
- Application name: `Purpose in Practice Geniuslink MCP Staging`
- Homepage: `https://geniuslink-mcp-oauth-test.purposeinpractice5.workers.dev`
- Callback: `https://geniuslink-mcp-oauth-test.purposeinpractice5.workers.dev/callback`

The existing production GitHub OAuth app's callback should remain unchanged.

## 2. Cloudflare staging Worker

In Cloudflare Workers & Pages, create a **new** Worker using GitHub repo `loperkin/geniuslink-mcp-server`, branch `main`.
- Worker project name: `geniuslink-mcp-oauth-test`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --config wrangler.oauth.jsonc`
- Preview builds: disabled
- Cloudflare Access: disabled **only because the OAuth provider protects /mcp**

The staging Wrangler config binds `OAUTH_KV` to the existing namespace. For full isolation create a second KV namespace and change only the staging Wrangler KV ID before deploying.

Add these **staging Worker** secrets/variables (they are NOT automatically inherited from production):
- `GITHUB_CLIENT_ID` — staging OAuth App Client ID
- `GITHUB_CLIENT_SECRET` — staging OAuth App Client Secret (Secret)
- `GENIUSLINK_API_KEY` — existing Geniuslink key (Secret)
- `GENIUSLINK_API_SECRET` — existing Geniuslink secret (Secret)
- `MCP_AUTH_TOKEN` — separate random bearer token (Secret), used only for internal legacy Worker bridge

Never paste secrets into chat, commit them, or place them in plaintext Wrangler vars.

## 3. Test before production

- Unauthenticated POST to `https://geniuslink-mcp-oauth-test.purposeinpractice5.workers.dev/mcp` must return HTTP 401 with OAuth resource metadata.
- OAuth metadata discovery should expose the staging issuer.
- In ChatGPT custom MCP connector, choose OAuth and enter staging URL `https://geniuslink-mcp-oauth-test.purposeinpractice5.workers.dev/mcp`.
- Approve the consent screen, sign into GitHub as `loperkin`, then call `geniuslink_api_status` and `geniuslink_list_links`.
- Confirm access from any other GitHub account is denied.

Do **not** change the production Wrangler entry point until staging OAuth login and MCP calls are verified.
