const BASE_URL = 'https://a.klaviyo.com/api';
const REVISION = '2024-10-15';

function headers(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'revision': REVISION,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

// Parse a retry-after header (seconds) or fall back to a default
function parseRetryAfter(res: Response, fallbackMs: number): number {
  const h = res.headers.get('retry-after');
  if (h) {
    const n = parseFloat(h);
    if (!isNaN(n)) return Math.min(n * 1000, 10_000); // cap at 10s
  }
  return fallbackMs;
}

async function doFetch(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    // Retry on 429 (rate limit) and 503 (service unavailable) with backoff
    if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
      const wait = parseRetryAfter(res, 500 * Math.pow(2, attempt)); // 500ms → 1s → 2s
      await new Promise((r) => setTimeout(r, wait));
      attempt += 1;
      continue;
    }
    return res;
  }
}

async function klaviyoGet(apiKey: string, path: string, params?: Record<string, string>) {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await doFetch(url.toString(), { headers: headers(apiKey) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Klaviyo API error ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function klaviyoPost(apiKey: string, path: string, body: unknown) {
  const res = await doFetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Klaviyo API error ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

// ─── Public API functions ───

export async function getAccountDetails(apiKey: string) {
  return klaviyoGet(apiKey, '/accounts');
}

interface ReportTimeframe {
  key?: string;
  start?: string;
  end?: string;
}

interface ReportInput {
  conversionMetricId: string;
  statistics: string[];
  valueStatistics?: string[];
  timeframe?: ReportTimeframe;
  filter?: string;
  groupBy?: string[];
}

// Reporting API: campaign values report
export async function getCampaignReport(apiKey: string, input: ReportInput) {
  const body = {
    data: {
      type: 'campaign-values-report',
      attributes: {
        statistics: input.statistics,
        timeframe: input.timeframe || { key: 'last_30_days' },
        conversion_metric_id: input.conversionMetricId,
        ...(input.valueStatistics?.length ? { value_statistics: input.valueStatistics } : {}),
        ...(input.filter ? { filter: input.filter } : {}),
        ...(input.groupBy?.length ? { group_by: input.groupBy } : {}),
      },
    },
  };
  return klaviyoPost(apiKey, '/campaign-values-reports', body);
}

// Reporting API: flow values report
export async function getFlowReport(apiKey: string, input: ReportInput) {
  const body = {
    data: {
      type: 'flow-values-report',
      attributes: {
        statistics: input.statistics,
        timeframe: input.timeframe || { key: 'last_30_days' },
        conversion_metric_id: input.conversionMetricId,
        ...(input.valueStatistics?.length ? { value_statistics: input.valueStatistics } : {}),
        ...(input.filter ? { filter: input.filter } : {}),
        ...(input.groupBy?.length ? { group_by: input.groupBy } : {}),
      },
    },
  };
  return klaviyoPost(apiKey, '/flow-values-reports', body);
}

export async function getCampaigns(apiKey: string, filter?: string) {
  const params: Record<string, string> = {
    'fields[campaign]': 'name,status,send_time,archived',
  };
  if (filter) params['filter'] = filter;
  return klaviyoGet(apiKey, '/campaigns', params);
}

export async function getCampaignMessages(apiKey: string, campaignId: string) {
  return klaviyoGet(apiKey, `/campaigns/${campaignId}/campaign-messages`);
}

export async function getFlows(apiKey: string) {
  return klaviyoGet(apiKey, '/flows', {
    'fields[flow]': 'name,status,archived,trigger_type,created,updated',
  });
}

// Klaviyo does NOT allow `include=flow-messages` on the /flows/{id}/flow-actions
// endpoint, so we fetch actions first, then for each SEND_EMAIL action fetch
// its flow-messages via /flow-actions/{actionId}/flow-messages.
export async function getFlowActions(apiKey: string, flowId: string) {
  return klaviyoGet(apiKey, `/flows/${flowId}/flow-actions`);
}

export async function getFlowMessagesForAction(apiKey: string, actionId: string) {
  return klaviyoGet(apiKey, `/flow-actions/${actionId}/flow-messages`);
}

// High-level helper used by /api/klaviyo/live-flows. Returns a normalized
// array of live flows with their email subject lines and preview texts.
export async function getLiveFlowsWithMessages(
  apiKey: string
): Promise<
  Array<{
    flowId: string;
    flowName: string;
    status: string;
    triggerType: string;
    emails: Array<{
      position: number;
      messageId: string;
      messageLabel: string | null;
      subject: string;
      previewText: string;
    }>;
  }>
> {
  // 1. Pull all flows, keep live + not archived
  const flowsRes = await getFlows(apiKey);
  const flows = (flowsRes?.data || []).filter((f: {
    attributes?: { status?: string; archived?: boolean };
  }) => {
    const status = f?.attributes?.status;
    const archived = f?.attributes?.archived;
    return status === 'live' && !archived;
  });

  const results: Array<{
    flowId: string;
    flowName: string;
    status: string;
    triggerType: string;
    emails: Array<{
      position: number;
      messageId: string;
      messageLabel: string | null;
      subject: string;
      previewText: string;
    }>;
  }> = [];

  // 2. For each live flow, fetch its actions, then for each SEND_EMAIL action,
  //    fetch its flow-messages separately.
  for (const flow of flows) {
    const flowId = flow.id as string;
    const flowName = (flow.attributes?.name as string) || 'Untitled Flow';
    const status = (flow.attributes?.status as string) || 'live';
    const triggerType = (flow.attributes?.trigger_type as string) || 'unknown';

    let actionsRes;
    try {
      actionsRes = await getFlowActions(apiKey, flowId);
    } catch {
      continue;
    }

    const actions = (actionsRes?.data || []) as Array<{
      id: string;
      attributes?: { action_type?: string };
    }>;

    const sendEmailActions = actions.filter((a) => a.attributes?.action_type === 'SEND_EMAIL');

    const emails: Array<{
      position: number;
      messageId: string;
      messageLabel: string | null;
      subject: string;
      previewText: string;
    }> = [];

    let position = 0;
    for (const action of sendEmailActions) {
      let msgRes;
      try {
        msgRes = await getFlowMessagesForAction(apiKey, action.id);
      } catch {
        continue;
      }
      const messages = (msgRes?.data || []) as Array<{
        id: string;
        attributes?: {
          name?: string;
          channel?: string;
          content?: { subject?: string; preview_text?: string };
        };
      }>;
      for (const msg of messages) {
        if (msg.attributes?.channel && msg.attributes.channel !== 'Email') continue;
        const content = msg.attributes?.content;
        const subject = (content?.subject || '').trim();
        if (!subject) continue;
        position += 1;
        emails.push({
          position,
          messageId: msg.id,
          messageLabel: msg.attributes?.name || null,
          subject,
          previewText: (content?.preview_text || '').trim(),
        });
      }
    }

    if (emails.length > 0) {
      results.push({ flowId, flowName, status, triggerType, emails });
    }
  }

  return results;
}

export async function getLists(apiKey: string) {
  return klaviyoGet(apiKey, '/lists', {
    'fields[list]': 'name,created,updated,opt_in_process',
  });
}

export async function getSegments(apiKey: string) {
  return klaviyoGet(apiKey, '/segments', {
    'fields[segment]': 'name,created,updated,is_active,is_starred',
  });
}

export async function getMetrics(apiKey: string) {
  return klaviyoGet(apiKey, '/metrics', {
    'fields[metric]': 'name,created,updated,integration',
  });
}

export async function getProfiles(apiKey: string, filter?: string) {
  const params: Record<string, string> = {
    'fields[profile]': 'email,first_name,last_name,created,updated,last_event_date',
    'page[size]': '20',
  };
  if (filter) params['filter'] = filter;
  return klaviyoGet(apiKey, '/profiles', params);
}

export async function queryMetricAggregates(apiKey: string, body: {
  metric_id: string;
  measurements: string[];
  interval: string;
  filter: string | string[];
  group_by?: string[];
}) {
  // Klaviyo's /metric-aggregates endpoint wants:
  //   - filter as an array of filter strings (not a single string)
  //   - `by` (array) as the grouping dimension, NOT `group_by`
  //   - Omit `by` entirely when empty; the API rejects `by: []`
  const filterArray = Array.isArray(body.filter) ? body.filter : [body.filter];
  const attributes: Record<string, unknown> = {
    metric_id: body.metric_id,
    measurements: body.measurements,
    interval: body.interval,
    page_size: 500,
    filter: filterArray,
  };
  if (body.group_by && body.group_by.length > 0) {
    attributes.by = body.group_by;
  }
  return klaviyoPost(apiKey, '/metric-aggregates', {
    data: {
      type: 'metric-aggregate',
      attributes,
    },
  });
}

// ─── Tool executor ───
// Called by the chat API route when Claude requests a tool

export async function executeKlaviyoTool(
  apiKey: string,
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string> {
  try {
    let result: unknown;

    switch (toolName) {
      case 'get_account_details': {
        result = await getAccountDetails(apiKey);
        break;
      }
      case 'get_campaigns': {
        result = await getCampaigns(apiKey, toolInput.filter as string | undefined);
        break;
      }
      case 'get_campaign_report': {
        result = await getCampaignReport(apiKey, toolInput as unknown as ReportInput);
        break;
      }
      case 'get_flow_report': {
        result = await getFlowReport(apiKey, toolInput as unknown as ReportInput);
        break;
      }
      case 'get_flows': {
        result = await getFlows(apiKey);
        break;
      }
      case 'get_lists': {
        result = await getLists(apiKey);
        break;
      }
      case 'get_segments': {
        result = await getSegments(apiKey);
        break;
      }
      case 'get_metrics': {
        result = await getMetrics(apiKey);
        break;
      }
      case 'get_profiles': {
        result = await getProfiles(apiKey, toolInput.filter as string | undefined);
        break;
      }
      case 'query_metric_aggregates': {
        result = await queryMetricAggregates(apiKey, {
          metric_id: toolInput.metric_id as string,
          measurements: toolInput.measurements as string[],
          interval: toolInput.interval as string || 'day',
          filter: toolInput.filter as string,
          group_by: toolInput.group_by as string[] | undefined,
        });
        break;
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }

    // Truncate large responses to avoid token limits
    const json = JSON.stringify(result);
    if (json.length > 15000) {
      return json.slice(0, 15000) + '\n...[truncated]';
    }
    return json;
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : 'Klaviyo API call failed' });
  }
}
