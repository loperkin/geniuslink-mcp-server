# ChatGPT OAuth deployment plan

The existing Cloudflare Worker at https://geniuslink-mcp-server.purposeinpractice5.workers.dev/mcp uses a static bearer token and **must remain protected** until OAuth is fully implemented and verified.

## Chosen approach

Use the official Cloudflare `@cloudflare/workers-oauth-provider` 1.x library, GitHub OAuth as the upstream identity provider, and Cloudflare KV bound as `OAUTH_KV`. Restrict sign-in to the owner's exact GitHub account (verify the authenticated GitHub user ID, not only a display name).

Reference: https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-github-oauth

## GitHub OAuth app (user action)

Go to GitHub Settings > Developer settings > OAuth Apps > New OAuth App.

- Application name: Purpose in Practice Geniuslink MCP
- Homepage URL: https://geniuslink-mcp-server.purposeinpractice5.workers.dev
- Authorization callback URL: https://geniuslink-mcp-server.purposeinpractice5.workers.dev/callback

GitHub issues a **Client ID** and a **Client Secret**. Keep the client secret out of GitHub and ChatGPT. Save it as an encrypted Cloudflare Worker secret `GITHUB_CLIENT_SECRET`; store `GITHUB_CLIENT_ID` in Cloudflare Worker configuration. The exact upstream GitHub user ID should be allowlisted.

## Required before deployment

1. Create a Cloudflare KV namespace and bind it as `OAUTH_KV`.
2. Implement official OAuth provider with secure per-client consent, CSRF/state binding, PKCE, resource audience binding, and token lifecycle.
3. Add GitHub callback handler; verify authenticated GitHub user ID against the allowlist before issuing any MCP token.
4. Migrate MCP authentication to OAuth while keeping existing bearer-token access until tested; do not enable anonymous MCP requests.
5. Add tests for unauthorized access, invalid state, wrong GitHub user, wrong resource audience, and token revocation.
6. Verify OAuth metadata discovery and a complete ChatGPT connection before retiring legacy bearer token.

Do not confuse the GitHub OAuth client secret with the Geniuslink API secret or the MCP_AUTH_TOKEN.
