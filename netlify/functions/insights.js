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
//  - Manual smoke tests that reached production (TESTGCLID) are likewise split into
//    their own `test_traffic` bucket and excluded from the funnel/rates.
const {
  STORE_NAME,
  getStoreInstance,
  collectEvents,
  resolveCampaignLabelFromEvent,
  canonicalSourceFromEvent,
  isPreviewEvent,
  isTestEvent,
  deriveVisitorGroupKey
} = require('../access-store');

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

    // Collection is windowed and parallel (see access-store.collectEvents): only
    // blobs inside the window are fetched, in bounded concurrent batches. The old
    // sequential full-history scan crossed Netlify's ~30 s timeout at ~700 events.
    const { events, scanned, fetched, failed, elapsedMs } =
      await collectEvents(store, sinceMs);
    console.log(`[INSIGHTS] days=${days} scanned=${scanned} fetched=${fetched} failed=${failed} ms=${elapsedMs}`);

    // Split honest production traffic from non-production buckets. Manual smoke
    // tests (TESTGCLID) are checked FIRST so a test event is never double-counted;
    // deploy-preview events are separated next; everything else is production.
    const testEvents = events.filter(isTestEvent);
    const previewEvents = events.filter(e => !isTestEvent(e) && isPreviewEvent(e));
    const prodEvents = events.filter(e => !isTestEvent(e) && !isPreviewEvent(e));

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
      // PRODUCT INSIGHT (not conversion): how many scroll events per depth
      // (25/50/75/100). Feeds the monthly product report.
      const byScrollDepth = {};
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
        if (e.event_type === 'scroll_depth') {
          const depth = String(e.scroll_depth != null ? e.scroll_depth : 'unknown');
          byScrollDepth[depth] = (byScrollDepth[depth] || 0) + 1;
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
        scroll_depth: byScrollDepth,
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
    // Manual smoke tests are reported separately too, never in the funnel.
    const testSummary = funnel(testEvents).totals;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        store: STORE_NAME,
        window_days: days,
        generated_at: new Date().toISOString(),
        summary: prod.totals,
        preview_traffic: previewSummary,
        test_traffic: testSummary,
        sources: breakdown.sources,
        specialties: breakdown.specialties,
        button_location: breakdown.button_location,
        scroll_depth: breakdown.scroll_depth,
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
