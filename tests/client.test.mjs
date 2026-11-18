import test from "node:test";
import assert from "node:assert/strict";
import { buildReportUrl, LEGACY_GET_PATHS, getConfig } from "../dist/client.js";

test("legacy link endpoints are explicitly registered", () => {
  assert.equal(LEGACY_GET_PATHS.links, "/v1/links/list");
  assert.equal(LEGACY_GET_PATHS.linkClickTrend, "/v1/reports/link-click-trend-by-resolution");
});

test("only known GET paths are permitted", () => {
  assert.equal(buildReportUrl(LEGACY_GET_PATHS.links).href, "https://api.geni.us/v1/links/list");
  assert.throws(() => buildReportUrl("/v1/links/delete"), /allowlist/);
  assert.throws(() => buildReportUrl("https://example.com/v1/links/list"), /allowlist/);
});

test("query parameters are encoded and credential names rejected", () => {
  const url = buildReportUrl(LEGACY_GET_PATHS.linkClickTrend, { sample: "a&b" });
  assert.equal(url.searchParams.get("sample"), "a&b");
  assert.throws(() => buildReportUrl(LEGACY_GET_PATHS.links, { api_key: "x" }), /Credentials/);
  assert.throws(() => buildReportUrl(LEGACY_GET_PATHS.links, { token: "x" }), /Credentials/);
});

test("additional verified GET paths require explicit configuration", () => {
  const before = process.env.GENIUSLINK_ALLOWED_GET_PATHS;
  try {
    process.env.GENIUSLINK_ALLOWED_GET_PATHS = "/v3/custom-domains";
    assert.ok(getConfig().allowed.includes("/v3/custom-domains"));
    assert.equal(buildReportUrl("/v3/custom-domains").pathname, "/v3/custom-domains");
  } finally {
    if (before === undefined) delete process.env.GENIUSLINK_ALLOWED_GET_PATHS;
    else process.env.GENIUSLINK_ALLOWED_GET_PATHS = before;
  }
});
