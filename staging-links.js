// Staging-only link management. Production's tool list has no write handler.
const API = "https://api.geni.us";
const origin = "https://geniuslink-mcp-oauth-test.purposeinpractice5.workers.dev";
const codePattern = /^[A-Za-z0-9_-]{1,80}$/;
const string = { type: "string" };
const schema = (properties, required) => ({ type: "object", properties, required, additionalProperties: false });
const group = { type: "integer", minimum: 1 };
const action = { type: "string", enum: ["create", "edit"] };
const linkInput = { action, url: string, groupId: group, shortCode: string };
const choiceInput = {
  title: string,
  destinations: {
    type: "array", minItems: 2, maxItems: 8,
    items: schema({ retailer: string, url: string, productUrl: string }, ["retailer", "url", "productUrl"])
  }
};

export const stagingTools = [
  {
    name: "geniuslink_preview_simple_link", description: "Inspect inventory and prepare an exact Simple-link create or edit without changing Geniuslink.",
    inputSchema: schema(linkInput, ["action", "url", "groupId"]), annotations: { readOnlyHint: true }
  },
  {
    name: "geniuslink_apply_simple_link", description: "Apply the one reviewed Simple-link plan enabled by the staging operator. Reads back the result and makes no automatic mutation retries.",
    inputSchema: schema({ ...linkInput, approval: string }, ["action", "url", "groupId", "approval"]),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
  },
  {
    name: "geniuslink_prepare_choice_page", description: "Prepare retailer buttons and find matching existing links for a dashboard Choice Page. Does not create or change a page.",
    inputSchema: schema(choiceInput, ["title", "destinations"]), annotations: { readOnlyHint: true }
  }
];

const wrappers = {
  "target.georiot.com": { path: "/proxy.ashx", parameter: "GR_URL" },
  "www.awin1.com": { path: "/cread.php", parameter: "ued" }
};

function destination(value, env) {
  if (typeof value !== "string" || value.length > 2000 || value.trim() !== value) {
    throw new Error("Expected a reviewed HTTPS destination URL");
  }
  let url;
  try { url = new URL(value); }
  catch { throw new Error("Invalid destination URL"); }
  const hosts = (env.GENIUSLINK_STAGING_RETAILER_HOSTS || "").split(",").map(host => host.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
      !hosts.includes(url.hostname)) throw new Error("Destination host is outside the reviewed staging allowlist");
  return url;
}

function approvedUrl(value, env, { direct = false } = {}) {
  const url = destination(value, env);
  const wrapper = Object.hasOwn(wrappers, url.hostname) ? wrappers[url.hostname] : null;
  if (wrapper) {
    const targets = url.searchParams.getAll(wrapper.parameter);
    if (direct || url.pathname.toLowerCase() !== wrapper.path || targets.length !== 1) {
      throw new Error("Unsupported tracking wrapper");
    }
    const target = destination(targets[0], env);
    if (Object.hasOwn(wrappers, target.hostname)) throw new Error("Nested tracking wrapper is unsupported");
  }
  return url.href;
}

function identity(value) {
  try {
    const url = new URL(value);
    const embedded = url.hostname === "target.georiot.com" ? url.searchParams.get("GR_URL") :
      url.hostname === "www.awin1.com" ? url.searchParams.get("ued") : null;
    if (embedded) {
      const target = new URL(embedded);
      if (["target.georiot.com", "www.awin1.com"].includes(target.hostname)) return null;
      return identity(target.href);
    }
    const host = url.hostname.replace(/^www\./, "");
    const asin = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i);
    if (host === "amazon.com" && asin) return "amazon.com/dp/" + asin[1].toUpperCase();
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^(gclid|fbclid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return host + url.pathname.replace(/\/$/, "") + url.search;
  } catch { return null; }
}

async function digest(value) {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));
  return Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function api(path, env, options = {}) {
  const { method = "GET", data, query, fetcher = fetch } = options;
  if (!env.GENIUSLINK_API_KEY || !env.GENIUSLINK_API_SECRET) throw new Error("Geniuslink credentials unavailable");
  const url = new URL(path, API);
  for (const [name, value] of Object.entries(query || {})) url.searchParams.set(name, String(value));
  const headers = {
    "X-Api-Key": env.GENIUSLINK_API_KEY, "X-Api-Secret": env.GENIUSLINK_API_SECRET,
    "Accept": "application/json"
  };
  if (data) headers["Content-Type"] = "application/json";
  const response = await fetcher(url, {
    method, headers, redirect: "manual", signal: AbortSignal.timeout(15000),
    body: data ? JSON.stringify(data) : undefined
  });
  if (!response.ok) throw new Error("Geniuslink API returned HTTP " + response.status);
  if (Number(response.headers.get("content-length") || 0) > 1048576) throw new Error("Geniuslink response too large");
  const raw = await response.text();
  if (raw.length > 1048576) throw new Error("Geniuslink response too large");
  let result;
  try { result = JSON.parse(raw); }
  catch { throw new Error("Geniuslink returned invalid JSON"); }
  if (!result || typeof result !== "object" || result.errorMessage || result.ErrorMessage ||
      result.responseStatus?.errorCode || result.ResponseStatus?.ErrorCode) {
    throw new Error("Geniuslink reported a request failure");
  }
  return result;
}

function field(row, name) {
  return row[name] ?? row[name[0].toUpperCase() + name.slice(1)];
}

function link(row) {
  const shortCode = field(row, "shortUrlCode");
  const domain = field(row, "domain");
  if (typeof shortCode !== "string" || !codePattern.test(shortCode) || typeof domain !== "string") {
    throw new Error("Unrecognized existing link record");
  }
  return {
    shortCode, domain,
    productUrl: field(row, "productUrl") ?? null,
    destinationUrl: field(row, "destinationUrl") ?? null,
    groupId: field(row, "tsid") ?? null,
    mode: field(row, "linkCreatorSetting") ?? null,
    hasOverride: field(row, "hasOverride") ?? null,
    trackingCode: field(row, "trackingCode") ?? null,
    affiliationDisabled: field(row, "affiliationDisabled") ?? null,
    skipAffiliateRedirect: field(row, "skipAffiliateRedirect") ?? null,
    notes: field(row, "notes") ?? null,
    applePreference: field(row, "applePreference") ?? null,
    trackingPixels: field(row, "trackingPixels") ?? null,
    postProcessing: field(row, "jsonPostProcessingRules") ?? null,
    archived: Boolean(field(row, "isArchived"))
  };
}

async function inventory(env, account) {
  const rows = [];
  const seen = new Set();
  const take = 50;
  for (let skip = 0; skip < 1500; skip += take) {
    const response = await api("/v1/links/list", env, { query: { take, skip, includeArchived: true } });
    if (account && field(response, "username") !== account) {
      throw new Error("Scratch account identity could not be verified");
    }
    const page = field(response, "results");
    if (!Array.isArray(page) || page.length > take) throw new Error("Unexpected Geniuslink inventory response");
    for (const row of page.map(link)) {
      const key = row.domain + "/" + row.shortCode;
      if (seen.has(key)) throw new Error("Inventory paging was inconsistent");
      seen.add(key);
      rows.push(row);
    }
    if (page.length < take) return rows;
  }
  throw new Error("Duplicate check did not cover the full inventory");
}

function sameProduct(row, url) {
  const key = identity(url);
  return key && [row.productUrl, row.destinationUrl].some(candidate => candidate && identity(candidate) === key);
}

function findCode(rows, shortCode) {
  return rows.find(row => row.shortCode === shortCode && row.domain === "geni.us");
}

function candidate(row) {
  return { shortCode: row.shortCode, domain: row.domain, archived: row.archived, mode: row.mode };
}

function editMetadata(row) {
  const { productUrl, destinationUrl, ...metadata } = row;
  return metadata;
}

async function preview(args, env, rows, account = null) {
  const { action, groupId } = args;
  if (!["create", "edit"].includes(action) || !Number.isSafeInteger(groupId) || groupId < 1 ||
      (action === "create" && args.shortCode !== undefined) ||
      (action === "edit" && (typeof args.shortCode !== "string" || !codePattern.test(args.shortCode)))) {
    throw new Error("Invalid Simple-link action, group or short code");
  }
  const url = approvedUrl(args.url, env);
  const product = identity(url);
  if (!product) throw new Error("Destination could not be identified safely");
  const shortCode = action === "edit" ? args.shortCode : "pip" + (await digest(product)).slice(0, 20);
  const existing = findCode(rows, shortCode);
  const duplicates = rows.filter(row => sameProduct(row, url) && (action === "create" || row !== existing));
  if (duplicates.length) return { status: "reuse_existing", matchingLinks: duplicates.map(candidate) };
  if (action === "create" && existing) throw new Error("The deterministic short code already exists");
  if (action === "edit") {
    if (!existing || existing.archived || existing.mode?.toLowerCase() !== "simple" ||
        existing.hasOverride !== false || existing.groupId !== groupId ||
        existing.affiliationDisabled !== false || existing.trackingCode || existing.skipAffiliateRedirect ||
        existing.notes || existing.applePreference || existing.trackingPixels ||
        existing.postProcessing || !existing.destinationUrl ||
        !routesTo(existing.destinationUrl, existing.productUrl) || !/^pip[a-f0-9]{20}$/.test(shortCode)) throw new Error("This link needs dashboard review to preserve its existing settings");
    if (existing.productUrl === url) return { status: "already_current", ...candidate(existing) };
  }
  const plan = { action, shortCode, url, groupId, prior: existing ? await digest(existing) : null };
  return { status: "approval_required", plan, approval: await digest({ account, plan }) };
}

async function prepareChoice(args, env, rows) {
  if (typeof args.title !== "string" || !args.title.trim() || args.title.length > 120 ||
      !Array.isArray(args.destinations) || args.destinations.length < 2 || args.destinations.length > 8) {
    throw new Error("Expected a title and two to eight reviewed retailer destinations");
  }
  const products = new Set();
  const retailers = new Set();
  const destinations = args.destinations.map(item => {
    if (!item || typeof item.retailer !== "string" || !item.retailer.trim() || item.retailer.length > 80 ||
        Object.keys(item).some(key => !["retailer", "url", "productUrl"].includes(key))) {
      throw new Error("Invalid retailer button");
    }
    const retailer = item.retailer.trim();
    const url = approvedUrl(item.url, env);
    const productUrl = approvedUrl(item.productUrl, env, { direct: true });
    const product = identity(productUrl);
    if (!product || identity(url) !== product) throw new Error("Retailer button does not match its product URL");
    const host = new URL(productUrl).hostname.replace(/^www\./, "");
    if (products.has(product) || retailers.has(host) || retailers.has(retailer.toLowerCase())) {
      throw new Error("Duplicate retailer or product in Choice Page plan");
    }
    products.add(product);
    retailers.add(host);
    retailers.add(retailer.toLowerCase());
    return { retailer, url, productUrl, existingLinks: rows.filter(row => sameProduct(row, productUrl)).map(candidate) };
  });
  return { status: "dashboard_review_required", title: args.title.trim(), destinations };
}

function routesTo(actual, expected) {
  try {
    const url = new URL(actual);
    const target = new URL(expected);
    if (target.hostname === "www.awin1.com") {
      // Preserve the full affiliate deep link, even when Geniuslink wraps it.
      const routed = url.hostname === "target.georiot.com" ? new URL(url.searchParams.get("GR_URL")) : url;
      return routed.href === target.href;
    }
    const expectedTag = target.searchParams.get("tag");
    if (target.hostname.replace(/^www\./, "") === "amazon.com" && expectedTag) {
      const routed = url.hostname === "target.georiot.com" ? new URL(url.searchParams.get("GR_URL")) : url;
      if (routed.searchParams.get("tag") !== expectedTag) return false;
    }
    return identity(actual) === identity(expected);
  } catch {
    return false;
  }
}

async function apply(plan, env, account, original) {
  const { action, groupId, shortCode, url } = plan;
  try {
    if (action === "create") {
      await api("/v3/shorturls", env, { method: "POST", data: { url, groupId, vanityCode: shortCode } });
    } else {
      await api("/v1/links/update", env, {
        method: "POST", query: { ShortUrlCode: shortCode, Domain: "geni.us", Tsid: groupId, NewUrl: url }
      });
    }
  } catch {
    // A timeout or conflict may be the response from a successful or concurrent
    // write. A readback is safe, whereas a second mutation could overwrite it.
  }
  const row = findCode(await inventory(env, account), shortCode);
  if (!row || row.groupId !== groupId || row.archived || row.productUrl !== url ||
      row.mode?.toLowerCase() !== "simple" || row.hasOverride !== false ||
      !routesTo(row.destinationUrl, url) ||
      (original && await digest(editMetadata(row)) !== await digest(editMetadata(original)))) {
    throw new Error("Write outcome unverified. Inspect the dashboard before any further write");
  }
  return { status: "readback_verified", scope: "saved_link_configuration", ...candidate(row) };
}

export function createStagingOptions(canWrite) {
  return {
    tools: canWrite ? stagingTools : stagingTools.filter(tool => tool.annotations.readOnlyHint),
    async call(name, args, env) {
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Arguments must be an object");
      const tool = stagingTools.find(item => item.name === name);
      if (!tool || Object.keys(args).some(key => !Object.hasOwn(tool.inputSchema.properties, key))) {
        throw new Error("Invalid staging arguments");
      }
      if (name === "geniuslink_prepare_choice_page") return prepareChoice(args, env, await inventory(env));
      const wantsWrite = name === "geniuslink_apply_simple_link";
      if (wantsWrite && (!canWrite || !/^[a-f0-9]{64}$/.test(args.approval || "") ||
          args.approval !== env.GENIUSLINK_STAGING_APPROVAL)) throw new Error("Staging write requires exact operator approval");
      const account = env.GENIUSLINK_STAGING_SCRATCH_ACCOUNT || null;
      if (!wantsWrite) return preview(args, env, await inventory(env, account), account);
      const expires = Date.parse(env.GENIUSLINK_STAGING_APPROVAL_EXPIRES);
      const now = Date.now();
      if (typeof account !== "string" || !account ||
          String(args.groupId) !== env.GENIUSLINK_STAGING_SCRATCH_GROUP ||
          !Number.isFinite(expires) || expires <= now || expires > now + 15 * 60_000 ||
          !env.GENIUSLINK_STAGING_APPROVAL_LEDGER) {
        throw new Error("An isolated account, scratch group, and expiring one-use approval are required");
      }
      const rows = await inventory(env, account);
      const result = await preview(args, env, rows, account);
      if (result.status !== "approval_required") return result;
      if (result.approval !== args.approval) throw new Error("The destination or inventory changed after review");
      if (Date.now() >= expires) throw new Error("Operator approval expired");
      const claim = await env.GENIUSLINK_STAGING_APPROVAL_LEDGER.getByName(account)
        .fetch("https://approval.internal/consume", { method: "POST", body: args.approval });
      if (claim.status !== 201) throw new Error("Operator approval was already consumed or unavailable");
      if (Date.now() >= expires) throw new Error("Operator approval expired after claim");
      return apply(result.plan, env, account, findCode(rows, result.plan.shortCode));
    }
  };
}

export { origin as stagingOrigin };
