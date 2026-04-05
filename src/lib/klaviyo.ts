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

async function klaviyoGet(apiKey: string, path: string, params?: Record<string, string>) {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), { headers: headers(apiKey) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Klaviyo API error ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function klaviyoPost(apiKey: string, path: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
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
  filter: string;
  group_by?: string[];
}) {
  return klaviyoPost(apiKey, '/metric-aggregates', {
    data: {
      type: 'metric-aggregate',
      attributes: {
        metric_id: body.metric_id,
        measurements: body.measurements,
        interval: body.interval,
        page_size: 500,
        filter: body.filter,
        group_by: body.group_by || [],
      },
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
      case 'get_campaigns': {
        result = await getCampaigns(apiKey, toolInput.filter as string | undefined);
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
