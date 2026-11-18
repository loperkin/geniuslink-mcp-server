import test from "node:test";
import assert from "node:assert/strict";
import { trendQuery, parseTrendResponse } from "../dist/trends.js";

const sample = { shortcode: "eS1fw", start: "2026-11-01", end: "2026-11-18", resolution: "day" };

test("trend query uses documented parameter names", () => {
  assert.deepEqual(trendQuery({ ...sample, retailerid: "AMAZON", dopreviousperiod: 1 }), {
    shortcode: "eS1fw", start: "2026-11-01", end: "2026-11-18",
    resolution: "day", retailerid: "AMAZON", dopreviousperiod: "1"
  });
});

test("dates and shortcode are validated", () => {
  assert.throws(() => trendQuery({ ...sample, start: "2026-02-30" }), /YYYY-MM-DD/);
  assert.throws(() => trendQuery({ ...sample, start: "2026-11-19" }), /start must/);
  assert.throws(() => trendQuery({ ...sample, shortcode: "https://geni.us/eS1fw" }), /shortcode/);
  assert.throws(() => trendQuery({ ...sample, dopreviousperiod: 2 }), /0 or 1/);
});

test("documented response fields are preserved", () => {
  const response = parseTrendResponse({
    clicksByDate: [{ Key: { dateTime: "2026-11-18T00:00:00Z" },
      Value: { clicks: 15, clicksMinusBot: 12, commissionForConsolidated: 0 } }],
    clicksByDatePP: [],
    resolutionOverride: "day"
  });
  assert.equal(response.clicksByDate[0].Value?.clicksMinusBot, 12);
  assert.throws(() => parseTrendResponse({ data: [] }), /clicksByDate/);
});
