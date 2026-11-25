import assert from "node:assert/strict";
import { test } from "node:test";
import { createStagingOptions } from "../staging-links.js";
import { StagingApprovalLedger } from "../staging-approval-ledger.js";
import { createWorker } from "../worker.js";

const amazon = "https://www.amazon.com/dp/B0H6MDZC4R";
const govee = "https://us.govee.com/products/govee-cob-strip-light-2?variant=47772751298745";
const direct = "https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued=" + encodeURIComponent(govee);
const env = {
  GENIUSLINK_API_KEY: "synthetic", GENIUSLINK_API_SECRET: "synthetic", MCP_AUTH_TOKEN: "local-test",
  GENIUSLINK_STAGING_RETAILER_HOSTS: "www.amazon.com,us.govee.com,www.awin1.com",
  GENIUSLINK_STAGING_SCRATCH_ACCOUNT: "scratch"
};
const previews = "geniuslink_preview_simple_link";
const writes = "geniuslink_apply_simple_link";
const choices = "geniuslink_prepare_choice_page";
const create = { action: "create", url: amazon, groupId: 3 };
const record = (url, code = "hwrU", extra = {}) => ({
  ProductUrl: url, DestinationUrl: url, ShortUrlCode: code, Domain: "geni.us", Tsid: 3,
  AffiliationDisabled: false, HasOverride: false, LinkCreatorSetting: "Simple", ...extra
});

function fixture(t, startingRows, { timeout = false, editReadback = {}, username = "scratch" } = {}) {
  const rows = startingRows.slice();
  const mutations = [];
  const reads = [];
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url.origin, "https://api.geni.us");
    assert.equal(request.redirect, "manual");
    if (request.method === "GET") {
      assert.equal(url.pathname, "/v1/links/list");
      assert.equal(url.searchParams.get("includeArchived"), "true");
      reads.push(url);
      return Response.json({ Username: username, ErrorMessage: "", Results: rows.slice(+url.searchParams.get("skip"), +url.searchParams.get("skip") + 50) });
    }
    assert.equal(request.method, "POST");
    mutations.push(url);
    if (url.pathname === "/v3/shorturls") {
      const body = JSON.parse(request.body);
      assert.equal(body.groupId, 3);
      rows.push(record(body.url, body.vanityCode));
    } else {
      assert.equal(url.pathname, "/v1/links/update");
      assert.equal(url.searchParams.get("Domain"), "geni.us");
      assert.equal(url.searchParams.get("Tsid"), "3");
      const target = rows.find(row => row.ShortUrlCode === url.searchParams.get("ShortUrlCode"));
      target.ProductUrl = url.searchParams.get("NewUrl");
      target.DestinationUrl = target.ProductUrl;
      Object.assign(target, editReadback);
    }
    if (timeout) throw new Error("Response interrupted");
    return Response.json({});
  });
  return { mutations, reads, rows };
}

function authorize(plan) {
  const kv = new Map();
  const ledger = new StagingApprovalLedger({ storage: { kv: {
    get: key => kv.get(key), put: (key, value) => kv.set(key, value)
  }, transactionSync: operation => operation() } });
  return {
    ...env, GENIUSLINK_STAGING_APPROVAL: plan.approval,
    GENIUSLINK_STAGING_SCRATCH_ACCOUNT: "scratch", GENIUSLINK_STAGING_SCRATCH_GROUP: "3",
    GENIUSLINK_STAGING_APPROVAL_EXPIRES: new Date(Date.now() + 60_000).toISOString(),
    GENIUSLINK_STAGING_APPROVAL_LEDGER: {
      getByName: () => ({ fetch: (url, options) => ledger.fetch(new Request(url, options)) })
    }
  };
}

test("production remains read-only; staging read scope exposes two previews", async () => {
  const request = () => new Request("https://example.com/mcp", {
    method: "POST", headers: { Authorization: "Bearer local-test" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
  });
  const listed = async worker => (await (await worker.fetch(request(), env)).json()).result.tools.map(tool => tool.name);
  const prod = await listed(createWorker());
  assert.equal(prod.length, 7);
  assert.equal(prod.includes(writes), false);
  assert.deepEqual(await listed(createWorker(createStagingOptions(false))), [...prod, previews, choices]);
});

test("preserves existing product URL and disallows editing its Interstitial", async t => {
  const { mutations } = fixture(t, [record(amazon + "?linkCode=ogi&th=1", "hwrU", {
    HasOverride: true, LinkCreatorSetting: "Interstitial"
  })]);
  const options = createStagingOptions(false);
  const result = await options.call(previews, create, env);
  assert.equal(result.status, "reuse_existing");
  assert.equal(result.matchingLinks[0].shortCode, "hwrU");
  await assert.rejects(options.call(previews, { ...create, action: "edit", shortCode: "hwrU" }, env),
    /dashboard review/);
  await assert.rejects(options.call(writes, { ...create, approval: "a".repeat(64) }, env), /operator approval/);
  assert.equal(mutations.length, 0);
});

test("prepares a two-retailer page and rejects mismatched buttons", async t => {
  const { mutations } = fixture(t, [record(amazon)]);
  const options = createStagingOptions(false);
  const destinations = [
    { retailer: "Amazon", url: amazon + "?tag=example-20", productUrl: amazon },
    { retailer: "Govee", url: direct, productUrl: govee }
  ];
  const result = await options.call(choices, { title: "Cabinet lighting", destinations }, env);
  assert.equal(result.status, "dashboard_review_required");
  assert.equal(result.destinations[0].existingLinks[0].shortCode, "hwrU");
  assert.equal(result.destinations[1].url, direct);
  destinations[1].url = amazon;
  await assert.rejects(options.call(choices, { title: "Wrong SKU", destinations }, env), /does not match/);
  assert.equal(mutations.length, 0);
});

test("exact create approval, deterministic vacancy and ambiguous response readback", async t => {
  const { mutations } = fixture(t, [], { timeout: true });
  const options = createStagingOptions(true);
  const plan = await options.call(previews, create, env);
  assert.match(plan.plan.shortCode, /^pip[0-9a-f]{20}$/);
  assert.equal((await options.call(previews, { ...create, url: amazon + "?tag=other-20" }, env)).plan.shortCode, plan.plan.shortCode);
  await assert.rejects(options.call(writes, { ...create, approval: plan.approval }, env), /operator approval/);
  const enabled = authorize(plan);
  await assert.rejects(options.call(writes, { ...create, url: govee, approval: plan.approval }, enabled), /changed/);
  assert.equal((await options.call(writes, { ...create, approval: plan.approval }, enabled)).status, "readback_verified");
  assert.equal((await options.call(writes, { ...create, approval: plan.approval }, enabled)).status, "reuse_existing");
  assert.equal(mutations.length, 1);
});

test("edit approval binds prior metadata and only the chosen Simple link changes", async t => {
  const shortCode = "pip00000000000000000000";
  const { mutations, rows } = fixture(t, [record(amazon, shortCode), record(amazon + "/not-the-target", "stable")]);
  const options = createStagingOptions(true);
  const edit = { action: "edit", shortCode, url: govee, groupId: 3 };
  const plan = await options.call(previews, edit, env);
  const enabled = authorize(plan);
  rows[0].Notes = "changed";
  await assert.rejects(options.call(writes, { ...edit, approval: plan.approval }, enabled), /dashboard review/);
  delete rows[0].Notes;
  assert.equal((await options.call(writes, { ...edit, approval: plan.approval }, enabled)).status, "readback_verified");
  assert.equal(rows[1].ProductUrl, amazon + "/not-the-target");
  assert.equal(mutations.length, 1);
});

test("validates the embedded destination before returning a write plan", async t => {
  const { mutations } = fixture(t, []);
  const options = createStagingOptions(false);
  const prefix = direct.split("ued=")[0] + "ued=";
  for (const target of ["https://elsewhere.invalid/product", "http://us.govee.com/product", direct]) {
    await assert.rejects(options.call(previews, { ...create, url: prefix + encodeURIComponent(target) }, env),
      /allowlist|Nested/);
  }
  await assert.rejects(options.call(previews, { ...create, url: direct + "&ued=" + encodeURIComponent(govee) }, env),
    /Unsupported tracking wrapper/);
  assert.equal(mutations.length, 0);
});

test("edit readback rejects protected metadata changes and cannot replay approval", async t => {
  const shortCode = "pip00000000000000000000";
  const { mutations, rows } = fixture(t, [record(amazon, shortCode)],
    { editReadback: { AffiliationDisabled: true } });
  const options = createStagingOptions(true);
  const edit = { action: "edit", shortCode, url: govee, groupId: 3 };
  const plan = await options.call(previews, edit, env);
  const enabled = authorize(plan);
  const request = { ...edit, approval: plan.approval };
  await assert.rejects(options.call(writes, request, { ...enabled, GENIUSLINK_STAGING_SCRATCH_ACCOUNT: "wrong" }),
    /identity/);
  await assert.rejects(options.call(writes, request, enabled), /outcome unverified/);
  rows[0] = record(amazon, shortCode);
  await assert.rejects(options.call(writes, request, enabled), /already consumed/);
  assert.equal(mutations.length, 1);
});

test("one approval admits at most one concurrent scratch edit", async t => {
  const shortCode = "pip00000000000000000000";
  const { mutations } = fixture(t, [record(amazon, shortCode)]);
  const options = createStagingOptions(true);
  const edit = { action: "edit", shortCode, url: govee, groupId: 3 };
  const plan = await options.call(previews, edit, env);
  const enabled = authorize(plan);
  const request = { ...edit, approval: plan.approval };
  const results = await Promise.allSettled([
    options.call(writes, request, enabled),
    createStagingOptions(true).call(writes, request, enabled)
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.match(results.find(result => result.status === "rejected").reason.message, /already consumed/);
  assert.equal(mutations.length, 1);
});

test("approval digest differs between a shared preview and the verified scratch account", async t => {
  const { mutations } = fixture(t, []);
  const options = createStagingOptions(true);
  const shared = { ...env, GENIUSLINK_STAGING_SCRATCH_ACCOUNT: undefined };
  const publicPlan = await options.call(previews, create, shared);
  const scratchPlan = await options.call(previews, create, env);
  assert.notEqual(publicPlan.approval, scratchPlan.approval);
  await assert.rejects(options.call(writes, { ...create, approval: publicPlan.approval }, authorize(publicPlan)),
    /changed/);
  assert.equal(mutations.length, 0);
});

test("an explicitly supplied retailer tag must survive saved-route readback", async t => {
  const shortCode = "pip00000000000000000000";
  const tagged = amazon + "?tag=expected-20";
  fixture(t, [record(govee, shortCode)],
    { editReadback: { DestinationUrl: amazon + "?tag=other-20" } });
  const options = createStagingOptions(true);
  const edit = { action: "edit", shortCode, url: tagged, groupId: 3 };
  const plan = await options.call(previews, edit, env);
  await assert.rejects(options.call(writes, { ...edit, approval: plan.approval }, authorize(plan)),
    /outcome unverified/);
});
