import { createSign } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ga4PercentageChange,
  normalizeGa4PropertyId,
  previousGa4Range,
  type Ga4DateRange,
} from "./google-analytics.shared";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API_ROOT = "https://analyticsdata.googleapis.com/v1beta";
const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

type ServiceAccountCredentials = {
  type: "service_account";
  client_email: string;
  private_key: string;
  private_key_id?: string;
  token_uri?: string;
};

type Ga4ConnectionRow = {
  id: number;
  property_id: string;
  service_account_email: string;
  service_account_json: string;
  connected_at: string | null;
  last_tested_at: string | null;
  last_error: string | null;
};

type Ga4ApiValue = { value?: string };
type Ga4ApiRow = {
  dimensionValues?: Ga4ApiValue[];
  metricValues?: Ga4ApiValue[];
};
type Ga4ApiReport = {
  dimensionHeaders?: Array<{ name: string }>;
  metricHeaders?: Array<{ name: string; type?: string }>;
  rows?: Ga4ApiRow[];
  rowCount?: number;
  metadata?: {
    subjectToThresholding?: boolean;
    timeZone?: string;
    currencyCode?: string;
  };
  dataLossFromOtherRow?: boolean;
};

export type Ga4Record = Record<string, string | number>;

export type Ga4HistoricalDashboard = {
  range: Ga4DateRange;
  previousRange: Ga4DateRange;
  summary: Ga4Record;
  previousSummary: Ga4Record;
  changes: Record<string, number | null>;
  trend: Ga4Record[];
  pages: Ga4Record[];
  channels: Ga4Record[];
  sources: Ga4Record[];
  campaigns: Ga4Record[];
  products: Ga4Record[];
  devices: Ga4Record[];
  geography: Ga4Record[];
  warnings: string[];
};

export type Ga4RealtimeDashboard = {
  generatedAt: string;
  summary: Ga4Record;
  pages: Ga4Record[];
  devices: Ga4Record[];
  countries: Ga4Record[];
  events: Ga4Record[];
  warnings: string[];
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

// The generated Database type is refreshed only after this migration reaches Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ga4SettingsTable = () => supabaseAdmin.from("ga4_settings" as any) as any;

function base64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function parseServiceAccount(raw: string): ServiceAccountCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("O arquivo da conta de serviço não contém um JSON válido.");
  }

  const value = parsed as Partial<ServiceAccountCredentials>;
  if (
    value.type !== "service_account" ||
    !value.client_email ||
    !value.private_key
  ) {
    throw new Error(
      "Use um JSON de conta de serviço do Google Cloud com client_email e private_key.",
    );
  }

  return {
    type: "service_account",
    client_email: value.client_email,
    private_key: value.private_key.replace(/\\n/g, "\n"),
    private_key_id: value.private_key_id,
    token_uri: value.token_uri || TOKEN_URL,
  };
}

async function getAccessToken(
  credentials: ServiceAccountCredentials,
): Promise<string> {
  const cacheKey = `${credentials.client_email}:${credentials.private_key_id || "default"}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: ANALYTICS_SCOPE,
      aud: credentials.token_uri || TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .end()
    .sign(credentials.private_key);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(credentials.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Falha ao autenticar no Google (${response.status}).`,
    );
  }

  tokenCache.set(cacheKey, {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(300, json.expires_in || 3600) * 1000,
  });
  return json.access_token;
}

async function googleRequest<T>(
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${DATA_API_ROOT}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      json.error?.message ||
        `Google Analytics respondeu com HTTP ${response.status}.`,
    );
  }
  return json;
}

function numericValue(value: string | undefined): string | number {
  if (value == null || value === "") return "";
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function reportRows(report: Ga4ApiReport): Ga4Record[] {
  const dimensions =
    report.dimensionHeaders?.map((header) => header.name) ?? [];
  const metrics = report.metricHeaders?.map((header) => header.name) ?? [];
  return (report.rows ?? []).map((row) => {
    const record: Ga4Record = {};
    dimensions.forEach((name, index) => {
      record[name] = row.dimensionValues?.[index]?.value ?? "";
    });
    metrics.forEach((name, index) => {
      record[name] = numericValue(row.metricValues?.[index]?.value);
    });
    return record;
  });
}

function summaryRow(report: Ga4ApiReport): Ga4Record {
  return reportRows(report)[0] ?? {};
}

function reportWarnings(reports: Ga4ApiReport[]): string[] {
  const warnings = new Set<string>();
  if (reports.some((report) => report.metadata?.subjectToThresholding)) {
    warnings.add(
      "O Google aplicou limiares de privacidade em parte dos dados deste período.",
    );
  }
  if (reports.some((report) => report.dataLossFromOtherRow)) {
    warnings.add(
      "Algumas dimensões de baixa frequência foram agrupadas pelo Google em “outros”.",
    );
  }
  return [...warnings];
}

async function loadConnection(): Promise<{
  row: Ga4ConnectionRow;
  credentials: ServiceAccountCredentials;
}> {
  const { data, error } = await ga4SettingsTable()
    .select(
      "id, property_id, service_account_email, service_account_json, connected_at, last_tested_at, last_error",
    )
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data)
    throw new Error(
      "GA4 ainda não conectado. Configure a propriedade em Ferramentas > Google Analytics.",
    );
  return {
    row: data as Ga4ConnectionRow,
    credentials: parseServiceAccount(
      (data as Ga4ConnectionRow).service_account_json,
    ),
  };
}

async function markConnectionTest(error: string | null) {
  await ga4SettingsTable()
    .update({
      last_tested_at: new Date().toISOString(),
      last_error: error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
}

function dateRange(range: Ga4DateRange) {
  return [{ startDate: range.startDate, endDate: range.endDate }];
}

function metricOrder(metricName: string) {
  return [{ metric: { metricName }, desc: true }];
}

async function batchReports(
  propertyId: string,
  token: string,
  requests: unknown[],
): Promise<Ga4ApiReport[]> {
  const result = await googleRequest<{ reports?: Ga4ApiReport[] }>(
    `/properties/${propertyId}:batchRunReports`,
    token,
    { requests },
  );
  return result.reports ?? [];
}

export async function getGa4ConnectionStatus() {
  const { data, error } = await ga4SettingsTable()
    .select(
      "property_id, service_account_email, connected_at, last_tested_at, last_error",
    )
    .eq("id", 1)
    .maybeSingle();
  if (error) return { connected: false as const, error: error.message };
  if (!data) return { connected: false as const, error: null };
  return {
    connected: true as const,
    propertyId: data.property_id as string,
    serviceAccountEmail: data.service_account_email as string,
    connectedAt: data.connected_at as string | null,
    lastTestedAt: data.last_tested_at as string | null,
    lastError: data.last_error as string | null,
  };
}

export async function saveAndTestGa4Connection(
  propertyIdInput: string,
  serviceAccountJson: string,
) {
  const propertyId = normalizeGa4PropertyId(propertyIdInput);
  const credentials = parseServiceAccount(serviceAccountJson);
  const token = await getAccessToken(credentials);

  await googleRequest(`/properties/${propertyId}:runReport`, token, {
    dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
    metrics: [{ name: "sessions" }],
    limit: "1",
  });

  const now = new Date().toISOString();
  const { error } = await ga4SettingsTable().upsert(
    {
      id: 1,
      property_id: propertyId,
      service_account_email: credentials.client_email,
      service_account_json: serviceAccountJson,
      connected_at: now,
      last_tested_at: now,
      last_error: null,
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);

  return {
    success: true as const,
    propertyId,
    serviceAccountEmail: credentials.client_email,
  };
}

export async function testSavedGa4Connection() {
  const { row, credentials } = await loadConnection();
  try {
    const token = await getAccessToken(credentials);
    await googleRequest(`/properties/${row.property_id}:runReport`, token, {
      dateRanges: [{ startDate: "yesterday", endDate: "today" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      limit: "1",
    });
    await markConnectionTest(null);
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha desconhecida ao testar o GA4.";
    await markConnectionTest(message);
    return { success: false as const, error: message };
  }
}

export async function disconnectGa4() {
  const { error } = await ga4SettingsTable().delete().eq("id", 1);
  if (error) throw new Error(error.message);
  tokenCache.clear();
  return { success: true as const };
}

export async function getGa4HistoricalDashboard(
  range: Ga4DateRange,
): Promise<Ga4HistoricalDashboard> {
  const { row, credentials } = await loadConnection();
  const token = await getAccessToken(credentials);
  const previousRange = previousGa4Range(range);

  const summaryMetrics = [
    "totalUsers",
    "activeUsers",
    "newUsers",
    "sessions",
    "screenPageViews",
    "engagementRate",
    "averageSessionDuration",
    "keyEvents",
    "ecommercePurchases",
    "purchaseRevenue",
  ].map((name) => ({ name }));

  const firstBatch = await batchReports(row.property_id, token, [
    { dateRanges: dateRange(range), metrics: summaryMetrics },
    { dateRanges: dateRange(previousRange), metrics: summaryMetrics },
    {
      dateRanges: dateRange(range),
      dimensions: [{ name: "date" }],
      metrics: [
        "activeUsers",
        "sessions",
        "screenPageViews",
        "keyEvents",
        "purchaseRevenue",
      ].map((name) => ({ name })),
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: "10000",
    },
    {
      dateRanges: dateRange(range),
      dimensions: [{ name: "pagePathPlusQueryString" }, { name: "pageTitle" }],
      metrics: [
        "screenPageViews",
        "activeUsers",
        "engagementRate",
        "averageSessionDuration",
      ].map((name) => ({ name })),
      orderBys: metricOrder("screenPageViews"),
      limit: "50",
    },
    {
      dateRanges: dateRange(range),
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [
        "sessions",
        "activeUsers",
        "engagedSessions",
        "keyEvents",
        "purchaseRevenue",
      ].map((name) => ({ name })),
      orderBys: metricOrder("sessions"),
      limit: "25",
    },
  ]);

  const secondBatch = await batchReports(row.property_id, token, [
    {
      dateRanges: dateRange(range),
      dimensions: [{ name: "sessionSourceMedium" }],
      metrics: [
        "sessions",
        "activeUsers",
        "engagedSessions",
        "keyEvents",
        "purchaseRevenue",
      ].map((name) => ({ name })),
      orderBys: metricOrder("sessions"),
      limit: "50",
    },
    {
      dateRanges: dateRange(range),
      dimensions: [
        { name: "sessionCampaignName" },
        { name: "sessionSourceMedium" },
      ],
      metrics: ["sessions", "activeUsers", "keyEvents", "purchaseRevenue"].map(
        (name) => ({ name }),
      ),
      orderBys: metricOrder("sessions"),
      limit: "50",
    },
    {
      dateRanges: dateRange(range),
      dimensions: [{ name: "itemId" }, { name: "itemName" }],
      metrics: [
        "itemsViewed",
        "itemsAddedToCart",
        "itemsCheckedOut",
        "itemsPurchased",
        "itemRevenue",
        "cartToViewRate",
        "purchaseToViewRate",
      ].map((name) => ({ name })),
      orderBys: metricOrder("itemsViewed"),
      limit: "50",
    },
    {
      dateRanges: dateRange(range),
      dimensions: [
        { name: "deviceCategory" },
        { name: "browser" },
        { name: "operatingSystem" },
      ],
      metrics: ["activeUsers", "sessions", "engagementRate"].map((name) => ({
        name,
      })),
      orderBys: metricOrder("sessions"),
      limit: "50",
    },
    {
      dateRanges: dateRange(range),
      dimensions: [{ name: "country" }, { name: "region" }, { name: "city" }],
      metrics: ["activeUsers", "sessions", "engagementRate"].map((name) => ({
        name,
      })),
      orderBys: metricOrder("activeUsers"),
      limit: "50",
    },
  ]);

  const reports = [...firstBatch, ...secondBatch];
  if (reports.length < 10)
    throw new Error("O GA4 retornou um conjunto incompleto de relatórios.");
  const summary = summaryRow(reports[0]);
  const previousSummary = summaryRow(reports[1]);
  const changes = Object.fromEntries(
    summaryMetrics.map(({ name }) => [
      name,
      ga4PercentageChange(
        Number(summary[name] ?? 0),
        Number(previousSummary[name] ?? 0),
      ),
    ]),
  );

  await markConnectionTest(null);
  return {
    range,
    previousRange,
    summary,
    previousSummary,
    changes,
    trend: reportRows(reports[2]),
    pages: reportRows(reports[3]),
    channels: reportRows(reports[4]),
    sources: reportRows(reports[5]),
    campaigns: reportRows(reports[6]),
    products: reportRows(reports[7]),
    devices: reportRows(reports[8]),
    geography: reportRows(reports[9]),
    warnings: reportWarnings(reports),
  };
}

async function realtimeReport(
  propertyId: string,
  token: string,
  body: unknown,
): Promise<Ga4ApiReport> {
  return googleRequest<Ga4ApiReport>(
    `/properties/${propertyId}:runRealtimeReport`,
    token,
    body,
  );
}

export async function getGa4RealtimeDashboard(): Promise<Ga4RealtimeDashboard> {
  const { row, credentials } = await loadConnection();
  const token = await getAccessToken(credentials);
  const metrics = [
    "activeUsers",
    "screenPageViews",
    "eventCount",
    "keyEvents",
  ].map((name) => ({ name }));

  const [summaryReport, pageReport, deviceReport, countryReport, eventReport] =
    await Promise.all([
      realtimeReport(row.property_id, token, { metrics }),
      realtimeReport(row.property_id, token, {
        dimensions: [{ name: "unifiedScreenName" }],
        metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
        orderBys: metricOrder("activeUsers"),
        limit: "30",
      }),
      realtimeReport(row.property_id, token, {
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: metricOrder("activeUsers"),
        limit: "10",
      }),
      realtimeReport(row.property_id, token, {
        dimensions: [{ name: "country" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: metricOrder("activeUsers"),
        limit: "20",
      }),
      realtimeReport(row.property_id, token, {
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }, { name: "activeUsers" }],
        orderBys: metricOrder("eventCount"),
        limit: "30",
      }),
    ]);

  const reports = [
    summaryReport,
    pageReport,
    deviceReport,
    countryReport,
    eventReport,
  ];
  return {
    generatedAt: new Date().toISOString(),
    summary: summaryRow(summaryReport),
    pages: reportRows(pageReport),
    devices: reportRows(deviceReport),
    countries: reportRows(countryReport),
    events: reportRows(eventReport),
    warnings: reportWarnings(reports),
  };
}

export async function getGa4MostViewedProducts(
  range: Ga4DateRange,
  excludedProductIds: string[] = [],
) {
  const { row, credentials } = await loadConnection();
  const token = await getAccessToken(credentials);
  const report = await googleRequest<Ga4ApiReport>(
    `/properties/${row.property_id}:runReport`,
    token,
    {
      dateRanges: dateRange(range),
      dimensions: [{ name: "itemId" }, { name: "itemName" }],
      metrics: [{ name: "itemsViewed" }, { name: "itemViewEvents" }],
      orderBys: metricOrder("itemsViewed"),
      limit: "100",
    },
  );
  const excluded = new Set(
    excludedProductIds.map((id) =>
      id.replace(/^gid:\/\/shopify\/Product\//, ""),
    ),
  );
  return reportRows(report).filter((product) => {
    const id = String(product.itemId || "").replace(
      /^gid:\/\/shopify\/Product\//,
      "",
    );
    return id && !excluded.has(id);
  });
}
