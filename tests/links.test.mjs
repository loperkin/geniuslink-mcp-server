import test from "node:test";
import assert from "node:assert/strict";
import { linkListQuery, parseLinkListResponse } from "../dist/links.js";

test("documented filters use exact Geniuslink query names", () => {
  assert.deepEqual(linkListQuery({
    take: 25, skip: 50, groupid: 0, keyword: "smart vent",
    includeArchived: false, linksCreatedStart: "2026-01-01T00:00:00Z"
  }), {
    take: "25", skip: "50", groupid: "0", keyword: "smart vent",
    includeArchived: "false", linksCreatedStart: "2026-01-01T00:00:00Z"
  });
});

test("link list response follows documented results shape", () => {
  const value = parseLinkListResponse({ results: [
    { id: 1, shortUrlCode: "example", totalClicks: 42, destinationUrl: "https://example.org" }
  ], allLinksLoaded: 1 });
  assert.equal(value.results[0].totalClicks, 42);
  assert.throws(() => parseLinkListResponse({ links: [] }), /results array/);
});

test("pagination is bounded", () => {
  assert.throws(() => linkListQuery({ take: 0 }), /take/);
  assert.throws(() => linkListQuery({ take: 101 }), /take/);
  assert.throws(() => linkListQuery({ skip: -1 }), /skip/);
});

test("array query serialization must be verified before multiple values", () => {
  assert.throws(() => linkListQuery({ baseShortCodes: ["a", "b"] }), /Invalid|verification/);
});
