> **Licensing change proposed (future releases only):** Commercial use of new versions requires separate written permission, subject to verified copyright ownership. This is source-available, **not** OSI-approved open source. Previously distributed MIT versions remain MIT-licensed and can still be commercially reused under their original terms. Review contributor rights, dependencies, package distribution, and custom license enforceability before merge or release. This proposal does not change production access.

# Geniuslink MCP Server

Community-built **read-only Geniuslink integration** for MCP clients, developed for Purpose in Practice and PIP Builds.

> **Status (November 2026):** The production Cloudflare Workers remote MCP has been deployed, authenticated with GitHub OAuth, and used successfully for read-only Geniuslink link inventory and click reporting. The **local stdio implementation** below is a separate interface and some of its older documentation still describes pre-deployment testing. Geniuslink v1 is a legacy API; specific endpoints and metric availability can change.

## Start here: remote MCP vs. local stdio

- **Production remote MCP:** `https://geniuslink-mcp-server.purposeinpractice5.workers.dev/mcp`, OAuth through GitHub. **Owner-only:** the current authorization code accepts only the `loperkin` GitHub identity; other users cannot connect their own Geniuslink accounts through this deployment.
- **Staging remote MCP:** `https://geniuslink-mcp-oauth-test.purposeinpractice5.workers.dev/mcp`; intended for testing, not customer use.
- **Local stdio MCP:** install and run from source with your own Geniuslink API credentials. Its tool set is not identical to the remote implementation.
- **Agent usage guide:** [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md) explains when to call each remote tool, pagination, analytics semantics, error handling, and safety.
- **Security:** no Geniuslink secrets should be put in a chat, public skill, or repository. The remote endpoint is read-only and is **not** a general-purpose public API for other users.

### Remote production tools

| Tool | Purpose |
|---|---|
| `geniuslink_api_status` | Verify server credential configuration without querying Geniuslink |
| `geniuslink_list_links` | Search and paginate short links; inspect link-list click totals |
| `geniuslink_link_click_trend` | Trend report for one short code |
| `geniuslink_account_click_trend` | Account-wide click trend |
| `geniuslink_link_clicks_by_country` | Country breakdown for a link |
| `geniuslink_account_clicks_by_country` | Country breakdown for the account |
| `geniuslink_groups` | List groups |

The following **local stdio** tools are not exposed by the remote Worker: `geniuslink_list_all_links`, `geniuslink_link_top_attributes`, and `geniuslink_read_report`. The local and remote schemas may differ. Refer to `worker.js` for the remote implementation.

### Reading click metrics correctly

- Link-list `totalClicks` is not necessarily a verified lifetime count; do not label it lifetime without confirmation of its reporting period.
- `clicks` (raw), `clicksMinusBot` (excluding bots), `clicksMinusSharedAndBot`, and `spider` are distinct fields; report the metric used.
- Clicks are not verified sales, conversions, or affiliate commissions.
- Account and per-link date reports can return fewer date buckets than requested; state coverage and don't invent zeroes.
- Shared short links cannot independently attribute traffic to YouTube versus GitHub versus the website.

## Local stdio implementation (separate from the remote Worker)

## Available local stdio MCP tools

| Tool | API route | Purpose |
|---|---|---|
| `geniuslink_api_status` | None | Check local credential configuration safely |
| `geniuslink_list_links` | `GET /v1/links/list` | Typed filtering, pagination and link click totals |
| `geniuslink_list_all_links` | `GET /v1/links/list` | Fetch bounded consecutive pages with continuation offset |
| `geniuslink_link_click_trend` | `GET /v1/reports/link-click-trend-by-resolution` | Link click trends |
| `geniuslink_link_clicks_by_country` | `GET /v1/reports/link-clicks-by-country` | Link geography |
| `geniuslink_link_top_attributes` | `GET /v1/reports/link-top-attributetype-for-range` | Link attribute breakdowns |
| `geniuslink_account_click_trend` | `GET /v1/reports/click-trend-by-resolution` | Account click trends |
| `geniuslink_account_clicks_by_country` | `GET /v1/reports/clicks-by-country` | Account geography |
| `geniuslink_read_report` | Exact allowlisted GET path | Advanced access to documented endpoints |

Other v1 GET endpoints visible in the API Explorer are included in the allowlist, including `/v1/affiliate/stats`, `/v1/conversion-tracking`, `/v1/exportdata` and group reporting. **Names alone do not establish which metrics or commission data these endpoints return.**

No POST, PUT, PATCH or DELETE operations are exposed. **We do not assume Amazon affiliate commission data is available.**

## Verified from the v1 link-list Swagger schema

The API Explorer confirms these optional query parameters for `GET /v1/links/list`:

| Parameter | Type | Meaning |
|---|---|---|
| `baseShortCodes` | array of strings | Filter short codes; multi-value encoding still needs verification |
| `linkTypes` | array of strings | Filter link types; valid values still need verification |
| `sortBy` | string | Sort expression; valid values still need verification |
| `take` | integer | Number of links requested |
| `skip` | integer | Pagination offset |
| `groupid` | integer | Group identifier; Swagger says 0 for all |
| `keyword` | string | Keyword filter |
| `includeArchived` | boolean | Include archived links |
| `linksCreatedStart` | date-time | Created-date start |
| `linksCreatedEnd` | date-time | Created-date end |

The documented response has a `results` array, with fields including `shortUrlCode`, `domain`, `destinationUrl`, `productUrl`, `group`, `trackingCode`, `advertiser`, `totalClicks`, `previousPeriodTotalClicks`, and `percentChangePeriodOverPeriod`. It also includes `allLinksLoaded` and `errorMessage`, whose runtime semantics have not yet been verified.

Example MCP arguments for `geniuslink_list_links`:

```json
{"take":25,"skip":0,"groupid":0,"includeArchived":false}
```

Example MCP arguments for `geniuslink_list_all_links`:

```json
{"take":50,"skip":0,"maxPages":3}
```

The pagination tool stops after a short page or the configured page limit and returns a `nextSkip` value. A full final page does **not** prove there are more links. To avoid inventing behavior, array filters currently accept at most one value, until their Swagger query serialization is verified.

**Important:** `totalClicks` is a click count, not a verified conversion or commission figure. Its reporting period is not specified by the example schema, so do not label it lifetime or monthly without confirmation.

## Verified link click-trend parameters

The API Explorer's `GET /v1/reports/link-click-trend-by-resolution` operation documents:

- `shortcode` (required): link short code (not a full URL)
- `start`, `end` (required): `YYYY-MM-DD`
- `retailerid` (optional): retailer filter, e.g. `AMAZON`; omit for all
- `resolution`: `hour`, `day`, `month` or `lifetime`
- `dopreviousperiod`: integer flag, 0 or 1, for previous-period comparison

Example MCP tool arguments:

```json
{
  "shortcode": "eS1fw",
  "start": "2026-11-01",
  "end": "2026-11-18",
  "resolution": "day",
  "dopreviousperiod": 1
}
```

The documented response contains `clicksByDate` and `clicksByDatePP`, with timestamped `Key` and metric-bearing `Value` objects. Metrics include `clicks`, `clicksMinusBot`, `clicksMinusSharedAndBot`, `clientAffiliated`, `spider`, and potential consolidated commission/conversion fields. **The existence of these fields in the schema does not mean your account receives populated commission data.** We preserve the original response rather than treating example zeros as real performance.

The remote production link and account trend tools have been used successfully; the local stdio interface and every optional v1 endpoint have not all been independently verified. In the copied Swagger parameter text, `shortcode` appears as a query parameter; confirm its placement in the expanded explorer if the live API rejects it.

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

The client uses the documented `X-Api-Key` and `X-Api-Secret` HTTP headers. The remote Worker has been used with a live account; local stdio setup must be configured and verified independently.

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

For the **local stdio implementation**, some less-common report endpoints may still require consulting the Geniuslink API Explorer for documented parameter definitions. The remote Worker instead exposes typed parameters for its seven tools. Before calling a report, expand that specific operation in [the Geniuslink API Explorer](https://api.geni.us/) and read its parameter names, required fields and response examples.

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
- The **local server** uses stdio; the separately deployed Cloudflare Worker provides an authenticated HTTPS MCP endpoint restricted to the owner's GitHub account.
- v1 is legacy. Do not assume it remains supported merely because its routes appear in Swagger.
- No pricing information should be published in Purpose in Practice buying guides; let readers choose what fits their budgets.

## Development roadmap

1. Keep remote tool schemas and documentation aligned, with mocked tests for paging and reporting edge cases.
2. Validate the reporting period and semantics of `totalClicks` and verify date-bucket coverage.
3. Confirm which additional v1 or supported v3 reporting endpoints are reliable, including any actual conversion data.
4. If offering third-party access, design per-user Geniuslink authentication and isolation rather than sharing the owner's credentials.
5. Consider an optional agent skill after confirming that purchasers can actually connect to the required tools.

## References

- [Geniuslink API Explorer](https://api.geni.us/)
- [Geniuslink API documentation](https://intercom.geni.us/en/articles/1065234-geniuslink-api)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## License

MIT. Independent community project; not affiliated with Geniuslink.
