// netlify/functions/log-access.js
// Persists access & conversion events to a durable Netlify Blobs store.
// (The previous local fs.writeFileSync approach did NOT survive Netlify deploys.)
const { STORE_NAME, getStoreInstance, makeKey } = require('../access-store');

exports.handler = async function (event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: 'OK' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const logEntry = {
      timestamp: new Date().toISOString(),
      ip: event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'anonymous',
      user_agent: event.headers['user-agent'] || '',
      referer: event.headers['referer'] || '',
      event_type: payload.event_type || 'page_view',
      specialty: payload.specialty || 'Geral',
      path: payload.path || '/',
      button_location: payload.button_location || null,
      scroll_depth: payload.scroll_depth || null,
      time_on_page_sec: payload.time_on_page_sec || null,
      utms: payload.utms || {}
    };

    // Persiste no Netlify Blobs (durable, sobrevive a deploys)
    const key = makeKey(logEntry);
    await getStoreInstance(event).setJSON(key, logEntry);

    console.log(`[ACCESS LOG] ${logEntry.event_type} - ${logEntry.specialty} (${logEntry.path})`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, logged_at: logEntry.timestamp, store: STORE_NAME })
    };
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON payload' })
    };
  }
};
