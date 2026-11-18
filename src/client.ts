const ORIGIN = "https://api.geni.us";
const MAX_BYTES = 1024 * 1024;

/** Documented in the user's Geniuslink API explorer (v1); legacy support is not guaranteed. */
export const LEGACY_GET_PATHS = {
  links: "/v1/links/list",
  affiliateStats: "/v1/affiliate/stats",
  conversionTracking: "/v1/conversion-tracking",
  exportData: "/v1/exportdata",
  clickTrend: "/v1/reports/click-trend-by-resolution",
  clicksByCountry: "/v1/reports/clicks-by-country",
  linkClickTrend: "/v1/reports/link-click-trend-by-resolution",
  linkClicksByCountry: "/v1/reports/link-clicks-by-country",
  linkTopAttributes: "/v1/reports/link-top-attributetype-for-range",
  groupTopAttributes: "/v1/reports/group-top-attributetype-for-range",
  groups: "/v1/groups/list",
  groupsWithDetails: "/v1/groups/get-all-with-details",
} as const;

const builtInPaths = Object.values(LEGACY_GET_PATHS);
const PATH_PATTERN = /^\/(?:v1|v2|v3)\/[A-Za-z0-9/_-]+$/;
const PARAM_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function getConfig() {
  const key = process.env.GENIUSLINK_API_KEY?.trim();
  const secret = process.env.GENIUSLINK_API_SECRET?.trim();
  const extra = (process.env.GENIUSLINK_ALLOWED_GET_PATHS ?? "")
    .split(",").map(x => x.trim()).filter(x => PATH_PATTERN.test(x));
  return { key, secret, allowed: [...new Set([...builtInPaths, ...extra])] };
}

export function buildReportUrl(path: string, query: Record<string, string> = {}): URL {
  const { allowed } = getConfig();
  if (!allowed.includes(path) || !PATH_PATTERN.test(path))
    throw new Error("GET path is not in the configured allowlist");
  const url = new URL(path, ORIGIN);
  if (url.origin !== ORIGIN || url.pathname !== path) throw new Error("Invalid API path");
  if (Object.keys(query).length > 30) throw new Error("Too many query parameters");
  for (const [name, value] of Object.entries(query)) {
    if (!PARAM_PATTERN.test(name) || typeof value !== "string" || value.length > 512)
      throw new Error("Invalid query parameter");
    if (/key|secret|token|password|auth/i.test(name))
      throw new Error("Credentials must not appear in query parameters");
    url.searchParams.set(name, value);
  }
  return url;
}

export async function readReport(path: string, query: Record<string, string> = {}): Promise<unknown> {
  const { key, secret } = getConfig();
  if (!key || !secret) throw new Error("Geniuslink credentials are not configured");
  const url = buildReportUrl(path, query);
  const response = await fetch(url, {
    method: "GET",
    headers: { "X-Api-Key": key, "X-Api-Secret": secret, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Geniuslink API returned HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) throw new Error("API response exceeds size limit");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("API returned an empty response");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new Error("API response exceeds size limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const raw = Buffer.concat(chunks.map(x => Buffer.from(x))).toString("utf8");
  try { return JSON.parse(raw); }
  catch { throw new Error("API returned non-JSON content"); }
}
