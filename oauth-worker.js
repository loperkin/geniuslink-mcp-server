import OAuthProvider, { AuthorizationError, CimdFetchError } from "@cloudflare/workers-oauth-provider";
import legacyWorker from "./worker.js";

const ORIGIN = "https://geniuslink-mcp-server.purposeinpractice5.workers.dev";
const RESOURCE = ORIGIN + "/mcp";
const OWNER_LOGIN = "loperkin";
const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
const textResponse = (message, status = 400) => new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

function consentHtml(details, handle) {
  const scopes = details.scope.map(s => '<label><input type="checkbox" name="scope" value="' + escapeHtml(s) + '" checked> ' + escapeHtml(s) + '</label>').join("<br>");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize Geniuslink MCP</title></head><body><main style="max-width:38rem;margin:3rem auto;font:16px system-ui;padding:1rem"><h1>Authorize Geniuslink MCP</h1><p><strong>${escapeHtml(details.clientName)}</strong> requests access to read your Geniuslink affiliate analytics.</p><p>${details.clientDomain ? "Published by " + escapeHtml(details.clientDomain) : "The requesting application's identity is not independently verified."}</p><p>Authorization will be sent to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>${details.redirectIsLoopback ? "<p><strong>This redirects to an app on your computer.</strong></p>" : ""}<form method="POST" action="/authorize"><input type="hidden" name="handle" value="${escapeHtml(handle)}"><p>${scopes}</p><button type="submit" name="decision" value="approve">Continue with GitHub</button> <button type="submit" name="decision" value="deny">Deny</button></form></main></body></html>`;
}

async function authorize(request, env) {
  const oauth = env.OAUTH_PROVIDER;
  if (request.method === "GET") {
    const authRequest = await oauth.parseAuthRequest(request);
    const details = await oauth.describeConsent(authRequest);
    const consent = await oauth.beginConsent(authRequest);
    consent.headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(consentHtml(details, consent.handle), { headers: consent.headers });
  }
  if (request.method !== "POST") return textResponse("Method not allowed", 405);
  const form = await request.formData();
  const handle = String(form.get("handle") || "");
  if (form.get("decision") !== "approve") {
    const denied = await oauth.denyConsent(request, handle);
    return new Response(null, { status: 302, headers: denied.headers });
  }
  const approved = await oauth.approveConsent(request, handle, { scope: form.getAll("scope").map(String) });
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return textResponse("GitHub OAuth credentials are not configured", 503);
  const { state, headers } = await oauth.beginUpstream(approved.request, { headers: approved.headers });
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", ORIGIN + "/callback");
  url.searchParams.set("state", state);
  // No GitHub API permissions are needed beyond the public /user identity endpoint.
  headers.set("Location", url.toString());
  return new Response(null, { status: 302, headers });
}

async function callback(request, env) {
  const oauth = env.OAUTH_PROVIDER;
  const { request: original, headers } = await oauth.finishUpstream(request);
  const url = new URL(request.url);
  if (url.searchParams.has("error")) return textResponse("GitHub sign-in was declined", 403);
  const code = url.searchParams.get("code");
  if (!code) return textResponse("Missing GitHub authorization code");
  const exchange = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: ORIGIN + "/callback" }),
    redirect: "manual"
  });
  if (!exchange.ok) return textResponse("GitHub token exchange failed", 502);
  const tokenData = await exchange.json();
  if (!tokenData.access_token) return textResponse("GitHub authorization failed", 403);
  const identity = await fetch("https://api.github.com/user", {
    headers: { "Authorization": "Bearer " + tokenData.access_token, "Accept": "application/vnd.github+json", "User-Agent": "purpose-in-practice-mcp" },
    redirect: "manual"
  });
  if (!identity.ok) return textResponse("Unable to verify GitHub identity", 502);
  const user = await identity.json();
  if (typeof user.login !== "string" || user.login.toLowerCase() !== OWNER_LOGIN || !Number.isInteger(user.id))
    return textResponse("This GitHub account is not authorized for Geniuslink analytics", 403);
  const completed = await oauth.completeAuthorization({
    request: original,
    userId: String(user.id),
    metadata: { label: user.login },
    scope: original.scope,
    props: { githubUserId: user.id, githubLogin: user.login }
  });
  headers.set("Location", completed.redirectTo);
  return new Response(null, { status: 302, headers });
}

const defaultHandler = {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (path === "/authorize") return await authorize(request, env);
      if (path === "/callback") return await callback(request, env);
      return textResponse("Not found", 404);
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
      if (error instanceof AuthorizationError || error instanceof CimdFetchError)
        return textResponse(error instanceof AuthorizationError ? error.description : "OAuth client verification failed");
      throw error;
    }
  }
};

const apiHandler = {
  async fetch(request, env, ctx) {
    if (ctx.props?.githubLogin?.toLowerCase() !== OWNER_LOGIN || !ctx.auth?.scope?.includes("mcp:read"))
      return textResponse("Forbidden", 403);
    // Preserve the tested read-only MCP JSON-RPC implementation. OAuth has already
    // authenticated this request; the legacy token is injected only server-side.
    if (!env.MCP_AUTH_TOKEN) return textResponse("Legacy MCP backend is not configured", 503);
    const headers = new Headers(request.headers);
    headers.set("Authorization", "Bearer " + env.MCP_AUTH_TOKEN);
    return legacyWorker.fetch(new Request(request, { headers }), env);
  }
};

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler,
  defaultHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: ["mcp:read"],
  requiredScopes: ["mcp:read"],
  resourceMetadata: { resource: RESOURCE, authorization_servers: [ORIGIN] },
  clientIdMetadataDocumentEnabled: true
});
