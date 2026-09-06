// netlify/functions/insights.js
// GET /.netlify/functions/insights?days=7
// Aggregates access & conversion events persisted on the Netlify Blobs store.
//
// Design notes (honest funnel):
//  - Attribution is resolved SERVER-SIDE via access-store canonical helpers so raw
//    referer/gclid/gad_campaignid URLs never leak into grouped stats, and so clicks
//    and their message_sent proxy are grouped identically no matter what the client
//    beacon happened to send.
//  - Netlify deploy-preview traffic (test/QA) is computed and reported SEPARATELY
//    and EXCLUDED from the production funnel denominators/rates, keeping numbers real.
const {
  STORE_NAME,
  KEY_PREFIX,
  getStoreInstance,
  resolveCampaignLabelFromEvent,
  canonicalSourceFromEvent,
  isPreviewEvent,
  deriveVisitorGroupKey
} = require('../access-store');

function parseIso(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.getTime();
}

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const days = Math.max(1, Math.min(90, parseInt((event.queryStringParameters || {}).days, 10) || 7));
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

  try {
    const store = getStoreInstance(event);
    const events = [];

    // In the 90-day window the event count is small (an early-stage medical landing
    // page), so listing all keys and filtering in-memory is simpler and sufficient.
    const { blobs } = await store.list({ prefix: KEY_PREFIX });
    for (const { key } of blobs) {
      const data = await store.get(key, { type: 'json' });
      if (data && parseIso(data.timestamp) >= sinceMs) events.push(data);
    }

    // Split honest production traffic from Netlify deploy-preview (test/QA) events.
    const previewEvents = events.filter(isPreviewEvent);
    const prodEvents = events.filter(e => !isPreviewEvent(e));

    // Helpers operating over a list, computing funnel in one pass.
    function funnel(list) {
      const pageViews = list.filter(e => e.event_type === 'page_view');
      const waClicks = list.filter(e => e.event_type === 'whatsapp_click');
      const messagesSent = list.filter(e => e.event_type === 'message_sent');
      const uniqueClients = new Set(list.map(e => e.client_id || 'anonymous'));
      // Raw `client_id` is a per-page-load UUID, so unique_users over-counts a
      // returning visitor. estimated_visitors instead groups events by a weak,
      // bounded server-side visitor key (ip + user_agent + 24h rolling window,
      // hashed/opaque) — see deriveVisitorGroupKey. Events with no usable key
      // (missing ip/user_agent) are EXCLUDED from the estimate (never collapsed).
      let estimatedVisitors = 0;
      const visitorKeys = new Set();
      list.forEach(e => {
        const key = deriveVisitorGroupKey(e);
        if (key !== null) visitorKeys.add(key);
      });
      estimatedVisitors = visitorKeys.size;
      const engagementRate = pageViews.length > 0
        ? Number(((waClicks.length / pageViews.length) * 100).toFixed(1))
        : 0;
      const leadProxyRate = pageViews.length > 0
        ? Number(((messagesSent.length / pageViews.length) * 100).toFixed(1))
        : 0;
      const conversionRate = waClicks.length > 0
        ? Number(((messagesSent.length / waClicks.length) * 100).toFixed(1))
        : 0;
      return { pageViews, waClicks, messagesSent, uniqueClients,
        totals: {
          events: list.length,
          unique_users: uniqueClients.size,
          estimated_visitors: estimatedVisitors,
          page_views: pageViews.length,
          whatsapp_clicks: waClicks.length,
          messages_sent: messagesSent.length,
          engagement_rate: engagementRate,
          lead_proxy_rate: leadProxyRate,
          conversion_rate: conversionRate,
          events_per_user: uniqueClients.size
            ? Number((list.length / uniqueClients.size).toFixed(1))
            : 0
        } };
    }

    function breakdowns(eventsList, waClicks, messagesSent) {
      const bySpecialty = {};
      const bySource = {};
      const byLocation = {};
      const byCampaign = { clicks: {}, leads: {} };
      eventsList.forEach(e => {
        const spec = e.specialty || 'Geral';
        bySpecialty[spec] = (bySpecialty[spec] || 0) + 1;
        const src = canonicalSourceFromEvent(e);
        bySource[src] = (bySource[src] || 0) + 1;
        if (e.event_type === 'whatsapp_click') {
          const loc = e.button_location || 'Desconhecido';
          byLocation[loc] = (byLocation[loc] || 0) + 1;
        }
      });

      const bucket = (subj) => {
        const lbl = subj.specialty || 'Geral';
        const campaign = resolveCampaignLabelFromEvent(subj);
        return `${campaign} :: ${lbl}`;
      };
      waClicks.forEach(c => { byCampaign.clicks[bucket(c)] = (byCampaign.clicks[bucket(c)] || 0) + 1; });
      messagesSent.forEach(m => { byCampaign.leads[bucket(m)] = (byCampaign.leads[bucket(m)] || 0) + 1; });

      return {
        specialties: bySpecialty,
        sources: bySource,
        button_location: byLocation,
        campaigns: {
          clicks_by_campaign: byCampaign.clicks,
          leads_by_campaign: byCampaign.leads
        }
      };
    }

    const prod = funnel(prodEvents);
    const breakdown = breakdowns(prodEvents, prod.waClicks, prod.messagesSent);

    // Preview (test/QA) is reported but NOT mixed into production funnel/rates.
    const previewSummary = funnel(previewEvents).totals;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        store: STORE_NAME,
        window_days: days,
        generated_at: new Date().toISOString(),
        summary: prod.totals,
        preview_traffic: previewSummary,
        sources: breakdown.sources,
        specialties: breakdown.specialties,
        button_location: breakdown.button_location,
        campaigns: breakdown.campaigns,
        events: prodEvents
      })
    };
  } catch (err) {
    console.error('[INSIGHTS] Error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to read access store', detail: err.message })
    };
  }
};
