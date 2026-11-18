const ORIGIN = "https://api.geni.us";
const MAX_BYTES = 1024 * 1024;

export function getConfig() {
  const key = process.env.GENIUSLINK_API_KEY?.trim();
  const secret = process.env.GENIUSLINK_API_SECRET?.trim();
  const paths = (process.env.GENIUSLINK_ALLOWED_GET_PATHS ?? "")
    .split(",").map(x => x.trim()).filter(Boolean);
  const allowed = paths.filter(x => /^\/v3\/[A-Za-z0-9/_-]+$/.test(x));
  return { key, secret, allowed };
}

export async function readReport(path: string, query: Record<string, string> = {}): Promise<unknown> {
  const { key, secret, allowed } = getConfig();
  if (!key || !secret) throw new Error("Geniuslink credentials are not configured");
  if (!allowed.includes(path)) throw new Error("GET path is not in the configured allowlist");
  const url = new URL(path, ORIGIN);
  if (url.origin !== ORIGIN || !url.pathname.startsWith("/v3/")) throw new Error("Invalid API path");
  for (const [name, value] of Object.entries(query)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name) || value.length > 512)
      throw new Error("Invalid query parameter");
    if (/key|secret|token|password|auth/i.test(name)) throw new Error("Credentials must not appear in query parameters");
    url.searchParams.set(name, value);
  }
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
  try { return JSON.parse(raw); } catch { throw new Error("API returned non-JSON content"); }
}
