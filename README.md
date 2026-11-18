# Geniuslink MCP Server

A community-built, **read-only** Model Context Protocol (MCP) adapter for the [Geniuslink API](https://api.geni.us/), maintained for the Purpose in Practice / PIP Builds workflow.

> **Status: initial integration scaffold.** The MCP transport and authenticated HTTP client are implemented, but Geniuslink's exact account-specific reporting endpoint paths and response formats must be verified against the interactive API v3 documentation before enabling reporting. No credentials have been used, and no live Geniuslink data has been retrieved.

## What it does

- Runs a local MCP server over **stdio** for compatible MCP clients.
- Authenticates requests using `X-Api-Key` and `X-Api-Secret`, as documented by Geniuslink.
- Exposes `geniuslink_api_status` to confirm local configuration without making an API request.
- Exposes `geniuslink_read_report` for **explicitly configured** API v3 GET endpoints only.
- Does not implement create/update/delete operations.
- Rejects arbitrary external URLs, redirects, query-string secrets, and unconfigured API paths.

## Requirements

- Node.js 20 or later
- Geniuslink API key and secret
- A compatible local MCP client

## Local setup

```bash
npm install
npm run build
```

Set environment variables in your shell or in your MCP client's secure environment configuration. See [`.env.example`](.env.example). **Do not commit or share actual credentials.**

```text
GENIUSLINK_API_KEY=your-key
GENIUSLINK_API_SECRET=your-secret
GENIUSLINK_ALLOWED_GET_PATHS=/v3/REPLACE_WITH_VERIFIED_REPORT_PATH
```

**Important:** `GENIUSLINK_ALLOWED_GET_PATHS` is a comma-separated list of exact paths from your own API v3 reference. The example is deliberately not a claimed working endpoint. Without a verified path, the reporting tool refuses requests.

Launch:

```bash
npm start
```

For a stdio MCP client, configure command `node` and arguments `/absolute/path/to/geniuslink-mcp-server/dist/server.js`, with the three environment variables above. Keep keys in the client's secure configuration, not the public repository.

## Available tools

### `geniuslink_api_status`

Reports whether key, secret, and read-only endpoint allowlist are configured. Never returns secret values.

### `geniuslink_read_report`

Parameters:

- `path`: exact allowed GET path, such as a verified Geniuslink API v3 report endpoint
- `query`: optional simple query parameters, such as documented date ranges or pagination

Returns the JSON response (size limited). This is a constrained API bridge, **not** a guarantee that every Geniuslink reporting endpoint or report format is available on your account.

## Security and limitations

- The server is **stdio only**. It is **not** a publicly reachable HTTPS MCP endpoint or an automatically installed ChatGPT connector.
- Do not expose a public endpoint that forwards a shared Geniuslink key and secret without first adding user authentication, authorization, transport security, request limits and secret management.
- Keep this public repository free of API keys, API secrets, response dumps containing personal data, and private reports.
- The adapter never follows HTTP redirects and limits response size.
- Geniuslink documents click-trend reporting, but Amazon commissions should **not** be assumed to be accessible through this API.
- This adapter does not click affiliate links or generate artificial traffic.
- Product comparisons and reports should not publish prices; let readers choose based on their own budget.

## Next steps

1. In [Geniuslink API Explorer](https://api.geni.us/), authorize locally with your credentials and inspect the **v3** GET endpoints for links and click-trend reports.
2. Record **endpoint paths and parameter names only** (never keys or secrets).
3. Add those verified GET paths to the allowlist, then run the local MCP client.
4. Add typed, documented report tools and mocked tests once real endpoint response shapes are known.
5. For ChatGPT remote access, deploy a properly authenticated remote MCP service. This local stdio scaffold is not yet that service.

## References

- [Official Geniuslink API help](https://intercom.geni.us/en/articles/1065234-geniuslink-api)
- [Geniuslink API Explorer](https://api.geni.us/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## License

MIT. This is an independent community project, not an official Geniuslink product.
