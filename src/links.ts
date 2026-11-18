import { LEGACY_GET_PATHS, readReport } from "./client.js";

export interface LinkListOptions {
  baseShortCodes?: string[];
  linkTypes?: string[];
  sortBy?: string;
  take?: number;
  skip?: number;
  groupid?: number;
  keyword?: string;
  includeArchived?: boolean;
  linksCreatedStart?: string;
  linksCreatedEnd?: string;
}

export interface GeniuslinkLink {
  id?: number;
  shortUrlCode?: string;
  domain?: string;
  destinationUrl?: string;
  productUrl?: string;
  totalClicks?: number;
  previousPeriodTotalClicks?: number;
  percentChangePeriodOverPeriod?: number;
  group?: string;
  advertiser?: string;
  trackingCode?: string;
  createdUtc?: string;
  isArchived?: number;
  [key: string]: unknown;
}

export interface LinkListResponse {
  results: GeniuslinkLink[];
  allLinksLoaded?: number | boolean;
  defaultNumberOfHistoricalLinksToShow?: number;
  errorMessage?: string;
  username?: string;
}

function positiveBounded(value: number, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${label} must be an integer from ${min} to ${max}`);
}

export function linkListQuery(options: LinkListOptions = {}): Record<string, string> {
  const query: Record<string, string> = {};
  if (options.take !== undefined) {
    positiveBounded(options.take, 1, 100, "take");
    query.take = String(options.take);
  }
  if (options.skip !== undefined) {
    positiveBounded(options.skip, 0, 1000000, "skip");
    query.skip = String(options.skip);
  }
  if (options.groupid !== undefined) {
    positiveBounded(options.groupid, 0, 1000000000, "groupid");
    query.groupid = String(options.groupid);
  }
  if (options.includeArchived !== undefined)
    query.includeArchived = String(options.includeArchived);
  for (const key of ["sortBy", "keyword", "linksCreatedStart", "linksCreatedEnd"] as const) {
    const value = options[key];
    if (value !== undefined) {
      if (value.length > 200) throw new Error(`${key} is too long`);
      query[key] = value;
    }
  }
  for (const key of ["baseShortCodes", "linkTypes"] as const) {
    const values = options[key];
    if (values !== undefined) {
      if (values.length > 30 || values.some(x => !x || x.length > 120))
        throw new Error(`Invalid ${key} list`);
      // Swagger lists these as query Array[string]. The array serialization
      // style has not yet been verified. Use one value only until confirmed.
      if (values.length > 1)
        throw new Error(`${key} array serialization needs API verification; use a single value for now`);
      if (values.length === 1) query[key] = values[0];
    }
  }
  return query;
}

export function parseLinkListResponse(data: unknown): LinkListResponse {
  if (!data || typeof data !== "object" || !("results" in data) ||
      !Array.isArray((data as { results: unknown }).results))
    throw new Error("Unexpected Geniuslink link-list response: results array missing");
  const value = data as LinkListResponse;
  if (value.errorMessage && value.errorMessage !== "string")
    throw new Error("Geniuslink returned an error in its link-list response");
  return value;
}

export async function listLinks(options: LinkListOptions = {}): Promise<LinkListResponse> {
  const data = await readReport(LEGACY_GET_PATHS.links, linkListQuery(options));
  return parseLinkListResponse(data);
}

/** Fetch a bounded number of pages; never loop until an undocumented completion flag. */
export async function listLinksPages(options: LinkListOptions = {}, maxPages = 5) {
  positiveBounded(maxPages, 1, 20, "maxPages");
  const take = options.take ?? 50;
  positiveBounded(take, 1, 100, "take");
  let skip = options.skip ?? 0;
  const results: GeniuslinkLink[] = [];
  let pagesFetched = 0;
  for (let i = 0; i < maxPages; i++) {
    const page = await listLinks({ ...options, take, skip });
    pagesFetched++;
    results.push(...page.results);
    if (page.results.length < take) break;
    skip += take;
  }
  return { results, pagesFetched, nextSkip: skip + (pagesFetched ? take : 0), truncated: pagesFetched === maxPages };
}
