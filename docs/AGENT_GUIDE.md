# Agent instructions: Geniuslink MCP

These instructions describe the **Cloudflare Workers remote MCP implementation** in `worker.js` and `oauth-production.js`. The repository also contains a separate local stdio implementation; do not assume their tool lists and deployment methods are identical.

## Purpose and limits

Use this integration to inspect a **connected, authorized Geniuslink account**: short-link inventory, click trends, geography and groups. It is **read-only**. It cannot create or modify links, publish content, authorize new users, purchase products or establish affiliate sales/commissions from clicks.

The production endpoint is `https://geniuslink-mcp-server.purposeinpractice5.workers.dev/mcp`. It uses GitHub OAuth and currently authorizes **only the repository owner's GitHub identity**. It is not a public multi-tenant Geniuslink integration. Never promise access to other users, share the owner's analytics, or ask users to paste API keys into chat. Staging is for testing only.

## Tools in the remote server

| Tool | Use when | Key inputs |
|---|---|---|
| `geniuslink_api_status` | Check configuration, not live Geniuslink health | None |
| `geniuslink_list_links` | Find short links, sort locally, identify products, inspect link click totals | `take` 1–100, `skip` >=0, optional `keyword`, `groupid`, `includeArchived` |
| `geniuslink_link_click_trend` | Click activity for one link during a period | `shortcode`, `start`, `end`, `resolution`; optional `retailerid`, `dopreviousperiod` |
| `geniuslink_account_click_trend` | Account-wide click activity during a period | `start`, `end`, `resolution`; optional `retailerid`, `dopreviousperiod` |
| `geniuslink_link_clicks_by_country` | Country breakdown for one link | `shortcode`, `start`, `end`; optional `dataresolution` |
| `geniuslink_account_clicks_by_country` | Account-wide country breakdown | `start`, `end`; optional `dataresolution` |
| `geniuslink_groups` | List groups for organization/filtering | None |

Date arguments are `YYYY-MM-DD`; resolutions for trend tools: `hour`, `day`, `month`, `lifetime`. For per-link reports, pass the short **code** (e.g. `eS1fw`), not `https://geni.us/eS1fw`. Never invent tool names, parameters or missing dates.

## Reliable analysis workflow

1. **Identify scope.** Ask whether the user means the whole account, one short link, a product/group, or a date range when genuinely ambiguous.
2. **Inventory:** call `geniuslink_list_links` with `take:100,skip:0`. If completeness matters, paginate with `skip:100`, `skip:200`, etc. until a short page, an API indication of completion, or a reasonable user-approved limit. The remote tool does not implement `geniuslink_list_all_links`. Sort the returned records by a verified created-date field for 'most recent'; don't treat API order as creation order without evidence.
3. **Traffic:** call the appropriate trend tool for the requested date range. Distinguish raw `clicks`, `clicksMinusBot`, `clicksMinusSharedAndBot`, and `spider` when available. State which counter is being reported. For a date range, report the number of returned date buckets and note missing buckets rather than assuming zero.
4. **Rankings:** link-list `totalClicks` and date-range trend totals may use different time scopes. Do not compare or add them as though equivalent. If the reporting period of `totalClicks` is not explicitly confirmed, label it **link-list totalClicks**, not lifetime or last-30-day clicks.
5. **Attribution:** the same Geniuslink short URL can be placed on YouTube, GitHub, and a website. Its click total alone cannot identify the referring placement. Recommend dedicated placement-specific tracking only when the provider supports it.
6. **Sales:** clicks are **not** orders, conversions, revenue, or commissions. Do not calculate earnings or conversion rates without actual transaction data from a verified source.
7. **Errors:** explain that access may be unavailable or that the API returned an error; do not treat failure as zero clicks. Never echo tokens, headers, credential values or private authentication details.

## Example requests and tool arguments

- “Show my newest 10 links”: retrieve enough inventory pages to cover the account, verify a creation timestamp field exists, sort descending and display ten; otherwise state that newest order cannot be verified.
- “How many non-bot clicks did I get last week?”: `geniuslink_account_click_trend({start:"2026-11-09",end:"2026-11-15",resolution:"day"})`; sum the actual `clicksMinusBot` values returned and state the checked dates. These dates are illustrative, not dynamically calculated.
- “How is the ESP32 link doing?”: locate the link with `geniuslink_list_links`, extract its short code, then call `geniuslink_link_click_trend` for the requested window.
- “Where do my clicks come from?”: `geniuslink_account_clicks_by_country` with explicit start/end. Country distribution is not website/referrer attribution.

## Deployment and security

The remote OAuth gateway in `oauth-production.js` authenticates a single GitHub account and forwards authorized requests to the read-only Worker with its bearer token injected server-side. `MCP_AUTH_TOKEN`, `GENIUSLINK_API_KEY`, `GENIUSLINK_API_SECRET`, and OAuth secrets must remain in Cloudflare Worker secrets, never committed to GitHub or included in an agent skill.

The repository's local stdio server and remote Worker have different supported tools. See `README.md` for both, and `worker.js` for the authoritative remote input schemas. The production connection is **not** currently suitable for listing as a universally usable third-party skill without a separate secure per-user authorization and credential strategy.

## Skill marketplace packaging

A `SKILL.md` file can teach agents these workflows, but **does not automatically deploy or grant access to this MCP server**. Before publishing any marketplace listing, verify the marketplace's current supported connection method, whether external MCP endpoints are supported, the audience's authentication path, and what data a purchaser would actually access. Do not claim that the marketplace's own tool catalog includes Geniuslink unless verified. Do not bundle credentials or owner's private analytics.
