// netlify/functions/insights.js
// GET /.netlify/functions/insights?days=7
// Aggregates access & conversion events persisted on the Netlify Blobs store.
const { STORE_NAME, KEY_PREFIX, getStoreInstance } = require('../access-store');

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

    // No 90-day window the event count is small (an early-stage medical landing page),
    // so listing all keys and filtering in-memory is simpler and sufficient.
    const { blobs } = await store.list({ prefix: KEY_PREFIX });
    for (const { key } of blobs) {
      const data = await store.get(key, { type: 'json' });
      if (data && parseIso(data.timestamp) >= sinceMs) events.push(data);
    }

    const pageViews = events.filter(e => e.event_type === 'page_view');
    const waClicks = events.filter(e => e.event_type === 'whatsapp_click');
    const messagesSent = events.filter(e => e.event_type === 'message_sent');
    const conversionRate = pageViews.length > 0
      ? Number(((waClicks.length / pageViews.length) * 100).toFixed(1))
      : 0;

    const bySpecialty = {};
    const bySource = {};
    const byLocation = {};
    events.forEach(e => {
      const spec = e.specialty || 'Geral';
      const src = e.utms?.source || e.referer || 'Direto / Orgânico';
      bySpecialty[spec] = (bySpecialty[spec] || 0) + 1;
      bySource[src] = (bySource[src] || 0) + 1;
      if (e.event_type === 'whatsapp_click') {
        const loc = e.button_location || 'Desconhecido';
        byLocation[loc] = (byLocation[loc] || 0) + 1;
      }
    });

    // CVR por campanha (google Ads / cpc): lead = clique no WhatsApp.
    const byCampaign = {};
    const campaignClicks = {};
    events.forEach(e => {
      const campaign = e.utms?.campaign || e.utms?.source || 'Direto / Orgânico';
      const spec = e.specialty || 'Geral';
      const key = `${campaign} :: ${spec}`;
      if (e.event_type === 'whatsapp_click') {
        byCampaign[key] = (byCampaign[key] || 0) + 1;
        campaignClicks[key] = true;
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        store: STORE_NAME,
        window_days: days,
        generated_at: new Date().toISOString(),
        summary: {
          total_events: events.length,
          page_views: pageViews.length,
          whatsapp_clicks: waClicks.length,
          messages_sent: messagesSent.length,
          conversion_rate: conversionRate
        },
        by_specialty: bySpecialty,
        by_source: bySource,
        by_button_location: byLocation,
        campaigns: { clicks_by_campaign: byCampaign, campaigns_with_clicks: Object.keys(campaignClicks) },
        events: events
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
