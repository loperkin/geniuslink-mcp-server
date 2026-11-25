# Issue #79 Geniuslink staging candidate

The existing Geniuslink production and staging connectors expose the same seven
read-only analytics and inventory tools. The GitHub source exports a dedicated
production OAuth entrypoint. No checked-in staging entrypoint, staging binding
manifest, or staging branch was found. This patch adds an owner-only staging
entrypoint and preserves the production entrypoint byte for byte. The production
backend still registers its original seven tools. No Worker was deployed and no
Geniuslink links were created, edited, followed through a short URL, or removed.

## Supported operations

The founder's November 24, 2026 API Explorer snapshot had 103 pages and 58
enumerated HTTP operations across v1, v2 and v3. Its SHA-256 begins
`51216b3845697ada1`. Current vendor help independently identifies v3 as the
latest API, describes programmatic links as Simple, and lists Choice Pages as
dashboard-only in its integration comparison. The v1 and v2 routes remain
visible in the explorer with a legacy deprecation notice.

| Other reviewed API surface | Decision |
|---|---|
| Pages 11–12, POST `/v1/links/add`; pages 31–32, POST `/v2/shorturl` | Prefer documented v3 Simple creation. The older inputs do not establish a Choice Page contract. |
| Pages 60–74, v3 link tracking-pixel and UTM endpoints | These control tracking metadata. Leave them out of link creation, retailer routing, and editing. |
| Page 1, GET `/v1/affiliate/stats` | The schema lists program names and enrollment/status counts. It does not show the configured tag for a product or a redirect. |
| Page 3, GET `/v1/exportdata`; pages 15–17, POST `/v1/reportdata` | Account export and click/report examples. Their presence does not verify account entitlement, commerce revenue or affiliate tag ownership. Excluded from this staging change. |
| Pages 9–10, GET `/v1/invoices`, GET `/v1/invoices/current-period`; page 15, GET `/v1/payments` | Potential billing and payment evidence. Current staging tools do not expose these routes. Verify current click allowance and invoice in the dashboard. |

The candidate uses these documented routes.

| Operation | Basis | Candidate |
|---|---|---|
| Find and preserve existing links | Page 12, GET `/v1/links/list` | Bounded all-group scan including archived links. Amazon links are compared by ASIN. Awin and Geniuslink product wrappers are unwrapped locally. Repeated pages, unknown response shapes and an incomplete scan block writes. |
| Create Simple link | Pages 77–78, POST `/v3/shorturls` | One reviewed product URL, group ID, deterministic unique vanity code, and readback. The route explicitly supports Simple links only. |
| Edit Simple link | Pages 13–14, POST `/v1/links/update` | Candidate calls the documented query-only destination update, keeps the short code and group and requires a matching prior-state digest. The reference lists `overrides` and `linkCreatorSetting` but supplies no Choice Page enum or usable multi-destination schema. It does not promise what happens to omitted settings. Restrict the tool to apparently plain, staged-format Simple links and verify scratch-link readback before real use. Existing links with overrides, custom tracking, notes or postprocessing use dashboard review. |
| Prepare Choice Page | Current Geniuslink help documents a dashboard editor. No Choice Page mutation appeared in the supplied API reference. | Returns reviewed retailer buttons and any matching existing short links for manual dashboard review. Supports exact-product Amazon URLs and full Awin deep links with the same underlying URL. A separate dashboard action can be requested once eligible links, billing and publication are approved. |
| Retailer analytics | Pages 20–21, GET `/v1/reports/link-click-trend-by-resolution` with `retailerid`; pages 22–23, GET `/v1/reports/link-top-attributetype-for-range` by advertiser and attribute | The original staging connector exposes retailer-filtered trends. Attribute reports are documented separately. Clicks support traffic comparison. Affiliate-network sales reports are the source for orders and commissions. |

[API help](https://intercom.geni.us/en/articles/1065234-geniuslink-api) ·
[API Explorer](https://api.geni.us/) ·
[Choice Page editor](https://intercom.geni.us/en/articles/1821911-choice-pages) ·
[Methods matrix](https://geniuslink.com/integrations/methods) ·
[Simple Links](https://intercom.geni.us/en/articles/1065258-simple-links) ·
[Vanity characters](https://intercom.geni.us/en/articles/1821909-vanity-codes-custom-url-short-links) ·
[Affiliate destinations](https://intercom.geni.us/en/articles/3503202-affiliation-with-geniuslink)

## Govee H1AB3 candidate

Production inventory matched `https://geni.us/hwrU` to Amazon US ASIN
`B0H6MDZC4R` and described the 32.8-ft Govee COB Strip Light 2. The Amazon
product listing and Govee's product page independently match model H1AB3.
The live Geniuslink record is an Interstitial with overrides and postprocessing
and already appears in the website guide. Keep the short link and behavior.
The product match and affiliation-enabled flag establish the configured
destination and link setting. The tracking-code field was blank in the inventory response, so
resolved Associates tag ownership remains unverified. Compare the provider's
dashboard routing preview to the registered US Associates account and verified
approved website and YouTube placements before amplifying the link. Keep the
Amazon Associate statement and disclose affiliate links near each placement.

Govee's US direct store supplies the exact second product destination. Govee
advertises affiliate management through Impact/Awin and does not appear in the
11 current active PIP Awin advertisers. PIP Impact or other aggregator
entitlement and an attributed exact-SKU alternative were unavailable. Keep a
second retailer button on hold until that program relationship and link can be
verified. The Choice Page fixture uses a synthetic, nonproduction Awin link.

[Existing guide](https://pipbuilds.com/guides/smart-lighting/#govee) ·
[Amazon product](https://www.amazon.com/dp/B0H6MDZC4R) ·
[Govee exact variant](https://us.govee.com/products/govee-cob-strip-light-2?variant=47772751298745) ·
[Govee affiliate terms](https://us.govee.com/pages/affiliate) ·
[Amazon disclosure requirements](https://affiliate-program.amazon.com/help/node/topic/GPXFHVYZMTGPUMPE)

## Review, staging rollout and write approval

The original source blobs were recovered through the GitHub connector from
main at `f9a9d10e35e8af6e541e7cb490c49772f9147d21`. Apply this patch to that
complete checkout and run `npm test` with its existing Node 22 toolchain.
Five focused cases plus an OAuth gateway scope scenario passed a V8 check
with mocked Worker APIs and upstream replies.
Node and npm were absent from the builder and dependency download failed DNS,
so the actual repository test runner, Worker packaging and OAuth integration
remain unverified here. The focused native suite needs Node 22 and no package
install. Run `node --test tests/staging-links.test.mjs`.

The existing, unchanged staging connection answered authenticated read-only
status, group inventory (five groups), and Govee link inventory calls. Staging
returned the same Govee short codes as production. It can read the same link
inventory, so a staging endpoint name provides no isolation from account
writes. These reads establish baseline connector access. Candidate staging
OAuth and routing still need verification after approved staging deployment.

After exact-revision deployment approval, confirm the existing **staging**
Worker's OAuth app and storage bindings with the operator. Point only that
Worker to `oauth-staging.js`. Provision the reviewed comma-separated retailer
and tracking host allowlist as `GENIUSLINK_STAGING_RETAILER_HOSTS`. Keep
`GENIUSLINK_STAGING_WRITE_ENABLED` and `GENIUSLINK_STAGING_APPROVAL` unset for
the first stage. Through staging owner OAuth, verify the old tools, the two
new read-only tools and the absence of the write tool. Existing production
bindings and OAuth grants stay out of this deployment.

For a separately approved scratch test only, capture the preview's exact
approval digest, use a verified isolated test account and an existing
test group, set the staging approval binding for that operation, and
enable the write flag briefly. The caller needs both OAuth read and write
scopes. Compare returned state and dashboard state immediately, then unset
both write bindings and verify their absence. The create path uses the
vendor's unique, alphanumeric vanity slot to reduce duplicates across isolates. Inventory
checks cover known direct links, Geniuslink wrappers and Awin deep URLs.
Opaque wrappers and undocumented nested Choice Page routes still need a
dashboard inventory check. The legacy edit endpoint lacks compare-and-swap.
Use a single operator and no simultaneous dashboard edits. A timeout triggers
readback, never an automatic second mutation.

Choice Pages are included with Geniuslink accounts, and retailer-button
clicks can count toward billing. Confirm this account's allocation, current
billable clicks and whether the operator can cap exposure before approving any
new placement. No upgrade or incremental charge is authorized. Approve
website and YouTube changes separately and preserve the existing short link.

[Choice Pages feature](https://geniuslink.com/features/choice-pages/) ·
[Geniuslink billing and click thresholds](https://intercom.geni.us/en/articles/1821917-pricing-faq)
