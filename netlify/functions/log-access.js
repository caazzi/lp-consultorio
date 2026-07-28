// netlify/functions/log-access.js
const fs = require('fs');
const path = require('path');

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

    // Salva no registro de logs para análise CLI
    const logsDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logsDir)) {
      try { fs.mkdirSync(logsDir, { recursive: true }); } catch (e) {}
    }
    const logFile = path.join(logsDir, 'access-events.json');
    let logs = [];
    if (fs.existsSync(logFile)) {
      try {
        logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      } catch (e) { logs = []; }
    }
    logs.push(logEntry);
    if (logs.length > 1000) logs = logs.slice(-1000); // Mantém últimos 1000 eventos
    try {
      fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
    } catch (e) {}

    console.log(`[ACCESS LOG] ${logEntry.event_type} - ${logEntry.specialty} (${logEntry.path})`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, logged_at: logEntry.timestamp })
    };
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON payload' })
    };
  }
};
