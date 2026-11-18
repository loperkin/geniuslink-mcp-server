# Geniuslink MCP Server

Community-built **read-only Geniuslink integration** for MCP clients, developed for Purpose in Practice and PIP Builds.

> **Status: v0.2 integration prototype.** The documented legacy **v1** endpoints for short links and click analytics are now wired into named MCP tools. They are visible in the Geniuslink API Explorer, but their continued availability, required query parameters, response formats and credentials have **not** been live-tested. v2/v3 can be added without rewriting the MCP interface.

## Available MCP tools

| Tool | API route | Purpose |
|---|---|---|
| `geniuslink_api_status` | None | Check local credential configuration safely |
| `geniuslink_list_links` | `GET /v1/links/list` | List short links |
| `geniuslink_link_click_trend` | `GET /v1/reports/link-click-trend-by-resolution` | Link click trends |
| `geniuslink_link_clicks_by_country` | `GET /v1/reports/link-clicks-by-country` | Link geography |
| `geniuslink_link_top_attributes` | `GET /v1/reports/link-top-attributetype-for-range` | Link attribute breakdowns |
| `geniuslink_account_click_trend` | `GET /v1/reports/click-trend-by-resolution` | Account click trends |
| `geniuslink_account_clicks_by_country` | `GET /v1/reports/clicks-by-country` | Account geography |
| `geniuslink_read_report` | Exact allowlisted GET path | Advanced access to documented endpoints |

Other v1 GET endpoints visible in the API Explorer are included in the allowlist, including `/v1/affiliate/stats`, `/v1/conversion-tracking`, `/v1/exportdata` and group reporting. **Names alone do not establish which metrics or commission data these endpoints return.**

No POST, PUT, PATCH or DELETE operations are exposed. **We do not assume Amazon affiliate commission data is available.**

## Install locally

Requires Node.js 20+ and a local MCP client supporting stdio.

```bash
git clone https://github.com/loperkin/geniuslink-mcp-server.git
cd geniuslink-mcp-server
npm install
npm run build
npm start
```

`npm start` runs an MCP server over **stdio**, not a web dashboard. Use an MCP client to interact with its tools.

Set `GENIUSLINK_API_KEY` and `GENIUSLINK_API_SECRET` in your MCP client's private environment configuration. See [`.env.example`](.env.example). Never paste actual credentials into ChatGPT, screenshots, issues, or GitHub files.

The client uses the documented `X-Api-Key` and `X-Api-Secret` HTTP headers. No credentials or requests have yet been tested against a live Geniuslink account.

### Sample stdio client configuration

Substitute your absolute installation path and provide credentials using your MCP client's secure secret mechanism. This is an illustrative configuration, not a ChatGPT remote connector configuration.

```json
{
  "mcpServers": {
    "geniuslink": {
      "command": "node",
      "args": ["/absolute/path/to/geniuslink-mcp-server/dist/server.js"],
      "env": {
        "GENIUSLINK_API_KEY": "SET_PRIVATELY",
        "GENIUSLINK_API_SECRET": "SET_PRIVATELY"
      }
    }
  }
}
```

Do **not** save a real-key version of that JSON in a repository.

## Query parameters: verify before use

The screenshot of the Geniuslink API Explorer shows endpoint **names**, not required query parameter definitions. All report tools therefore accept a `query` map of documented string parameters. Before calling a report, expand that specific operation in [the Geniuslink API Explorer](https://api.geni.us/) and read its parameter names, required fields and response examples.

For example, the MCP call for `geniuslink_link_click_trend` has the form:

```json
{"query":{"REPLACE_WITH_DOCUMENTED_PARAMETER":"REPLACE_WITH_VALUE"}}
```

This is deliberately **not** a working API example; we won't guess parameter names or date formats.

## Safety and compatibility

- Outbound requests are GET-only, sent to `https://api.geni.us` with redirects disabled.
- Built-in endpoints are exact, fixed paths. Additional GET paths can be explicitly allowlisted with `GENIUSLINK_ALLOWED_GET_PATHS`.
- No arbitrary hosts, arbitrary methods or credentials in query strings.
- Requests time out after 15 seconds; responses are limited to 1 MiB.
- API errors return HTTP status only, without logging response bodies that may contain sensitive information.
- The server is **local stdio**. It cannot be connected to ChatGPT as a remote MCP connector until a secure HTTPS transport, authentication and deployment are implemented.
- v1 is legacy. Do not assume it remains supported merely because its routes appear in Swagger.
- No pricing information should be published in Purpose in Practice buying guides; let readers choose what fits their budgets.

## Development roadmap

1. **Verify v1 routes** with your account in the API Explorer; capture parameter names and safe redacted example responses.
2. Add typed parameters, pagination and mocked contract tests to the reporting tools.
3. Confirm which data are actually available, including link clicks, referrers and conversion data.
4. Add secure, authenticated remote MCP transport and deployment instructions, if supported by the target ChatGPT connector.
5. Eventually switch the API adapter to supported v3 reporting routes if Geniuslink publishes them, while preserving the MCP tool names.

## References

- [Geniuslink API Explorer](https://api.geni.us/)
- [Geniuslink API documentation](https://intercom.geni.us/en/articles/1065234-geniuslink-api)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## License

MIT. Independent community project; not affiliated with Geniuslink.
