import { LEGACY_GET_PATHS, readReport } from "./client.js";

export type ClickResolution = "hour" | "day" | "month" | "lifetime";

export interface LinkTrendOptions {
  shortcode: string;
  start: string;
  end: string;
  retailerid?: string;
  resolution: ClickResolution;
  dopreviousperiod?: number;
}

export interface ClickMetrics {
  clicks?: number;
  clicksMinusBot?: number;
  clicksMinusSharedAndBot?: number;
  baseClicks?: number;
  clientAffiliated?: number;
  spider?: number;
  commissionForConsolidated?: number;
  valueForConsolidated?: number;
  itemsForConsolidated?: number;
  epcNoBots?: number;
  epcWithBots?: number;
  convForConsolidated?: number;
  convPercent?: number;
  [key: string]: unknown;
}

export interface TrendPoint {
  Key?: { dateTime?: string; jsDate?: number };
  Value?: ClickMetrics;
}

export interface LinkTrendResponse {
  clicksByDate: TrendPoint[];
  clicksByDatePP?: TrendPoint[];
  request?: { retailerId?: string; resolution?: string; doPreviousPeriod?: string };
  resolutionOverride?: string;
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function trendQuery(options: LinkTrendOptions): Record<string, string> {
  if (!options.shortcode || options.shortcode.length > 120 ||
      !/^[A-Za-z0-9_-]+$/.test(options.shortcode))
    throw new Error("shortcode must be a valid short link code (not a URL)");
  if (!validDate(options.start) || !validDate(options.end))
    throw new Error("start and end must use YYYY-MM-DD");
  if (options.start > options.end) throw new Error("start must be on or before end");
  if (!["hour", "day", "month", "lifetime"].includes(options.resolution))
    throw new Error("Unsupported resolution");
  if (options.dopreviousperiod !== undefined &&
      (!Number.isInteger(options.dopreviousperiod) || ![0, 1].includes(options.dopreviousperiod)))
    throw new Error("dopreviousperiod must be 0 or 1");
  if (options.retailerid && options.retailerid.length > 120)
    throw new Error("retailerid is too long");
  return {
    shortcode: options.shortcode,
    start: options.start,
    end: options.end,
    resolution: options.resolution,
    ...(options.retailerid ? { retailerid: options.retailerid } : {}),
    ...(options.dopreviousperiod === undefined ? {} :
      { dopreviousperiod: String(options.dopreviousperiod) })
  };
}

export function parseTrendResponse(value: unknown): LinkTrendResponse {
  if (!value || typeof value !== "object" ||
      !("clicksByDate" in value) ||
      !Array.isArray((value as { clicksByDate: unknown }).clicksByDate))
    throw new Error("Unexpected click-trend response: clicksByDate array missing");
  return value as LinkTrendResponse;
}

export async function linkClickTrend(options: LinkTrendOptions): Promise<LinkTrendResponse> {
  return parseTrendResponse(await readReport(LEGACY_GET_PATHS.linkClickTrend, trendQuery(options)));
}
