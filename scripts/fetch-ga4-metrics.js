const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

console.log('\x1b[36m%s\x1b[0m', '=======================================================');
console.log('\x1b[36m%s\x1b[0m', ' 📊 GOOGLE ANALYTICS 4 REPORT (GA4 DATA API) ');
console.log('\x1b[36m%s\x1b[0m', '=======================================================\n');

// 1. Locate the Service Account credentials file
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '../ga-credentials.json');

if (!fs.existsSync(credPath)) {
  console.log('\x1b[33m%s\x1b[0m', '⚠️  Credentials file (ga-credentials.json) not found!');
  console.log('\nTo connect the terminal directly to your Google Analytics 4:');
  console.log(' 1. Create a Service Account in Google Cloud Console.');
  console.log(' 2. Download the JSON key and save it as ga-credentials.json in the repo root.');
  console.log(' 3. In GA4 (Admin > Access Management), add the Service Account e-mail as Viewer.');
  console.log(' 4. Set the numeric Property ID in the environment or in GA4_PROPERTY_ID.\n');
  process.exit(0);
}

let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
} catch (err) {
  console.error('\x1b[31m❌ Failed to read ga-credentials.json:\x1b[0m', err.message);
  process.exit(1);
}

const PROPERTY_ID = process.env.GA4_PROPERTY_ID;

if (!PROPERTY_ID) {
  console.log('\x1b[33m%s\x1b[0m', '⚠️  GA4_PROPERTY_ID is not set!');
  console.log('Set the numeric GA4 Property ID through an environment variable:');
  console.log('  export GA4_PROPERTY_ID=123456789\n');
  process.exit(0);
}

/**
 * Utility: signs the JWT and obtains a Service Account access token.
 */
function getAccessToken(cred) {
  return new Promise((resolve, reject) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claimSet = Buffer.from(JSON.stringify({
      iss: cred.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    })).toString('base64url');

    const signatureInput = `${header}.${claimSet}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    const signature = signer.sign(cred.private_key, 'base64url');

    const jwt = `${signatureInput}.${signature}`;
    const postData = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString();

    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data).access_token);
        } else {
          reject(new Error(`OAuth authentication failed (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Queries the Google Analytics Data API v1beta.
 */
function runGaReport(accessToken, propertyId, requestBody) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(requestBody);

    const req = https.request(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GA4 API error (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  try {
    console.log(`🔑 Authenticating with the Service Account: \x1b[32m${credentials.client_email}\x1b[0m...`);
    const token = await getAccessToken(credentials);
    console.log('✅ OAuth token obtained.');

    console.log(`\n📈 Pulling GA4 metrics (Property: ${PROPERTY_ID})...\n`);

    // 1. Overall summary for the last 7 days
    const overviewReport = await runGaReport(token, PROPERTY_ID, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'eventCount' }
      ]
    });

    if (overviewReport.rows && overviewReport.rows[0]) {
      const vals = overviewReport.rows[0].metricValues;
      console.log('\x1b[33m%s\x1b[0m', '📊 1. OVERVIEW (LAST 7 DAYS)');
      console.log(` - Active users    : \x1b[36m${vals[0].value}\x1b[0m`);
      console.log(` - New users       : \x1b[36m${vals[1].value}\x1b[0m`);
      console.log(` - Total sessions  : \x1b[36m${vals[2].value}\x1b[0m`);
      console.log(` - Page views      : \x1b[32m${vals[3].value}\x1b[0m`);
      console.log(` - Events fired    : \x1b[35m${vals[4].value}\x1b[0m\n`);
    }

    // 2. Visits per page (last 7 days)
    const pagesReport = await runGaReport(token, PROPERTY_ID, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'screenPageViews' }
      ],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }]
    });

    console.log('\x1b[33m%s\x1b[0m', '📄 2. MOST-VISITED PAGES');
    if (pagesReport.rows && pagesReport.rows.length > 0) {
      pagesReport.rows.forEach(r => {
        const page = r.dimensionValues[0].value;
        const users = r.metricValues[0].value;
        const views = r.metricValues[1].value;
        console.log(` - ${page.padEnd(35)}: \x1b[32m${views} view(s)\x1b[0m (${users} user(s))`);
      });
    } else {
      console.log(' - No page data recorded in the last 7 days.');
    }

    // 3. Traffic source / channels (last 7 days)
    const trafficReport = await runGaReport(token, PROPERTY_ID, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'sessionSourceMedium' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
    });

    console.log('\n\x1b[33m%s\x1b[0m', '🌐 3. TRAFFIC SOURCE (CHANNEL / MEDIUM)');
    if (trafficReport.rows && trafficReport.rows.length > 0) {
      trafficReport.rows.forEach(r => {
        const source = r.dimensionValues[0].value;
        const sessions = r.metricValues[0].value;
        console.log(` - ${source.padEnd(35)}: \x1b[36m${sessions} session(s)\x1b[0m`);
      });
    } else {
      console.log(' - No source recorded.');
    }

    // 4. Events breakdown (last 7 days)
    const eventsReport = await runGaReport(token, PROPERTY_ID, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }]
    });

    console.log('\n\x1b[33m%s\x1b[0m', '🎯 4. EVENTS AND RECORDED CONVERSIONS');
    if (eventsReport.rows && eventsReport.rows.length > 0) {
      eventsReport.rows.forEach(r => {
        const eventName = r.dimensionValues[0].value;
        const count = r.metricValues[0].value;
        const color = eventName === 'generate_lead' ? '\x1b[32m' : '\x1b[37m';
        console.log(` - Event [${color}${eventName.padEnd(20)}\x1b[0m]: ${count} hit(s)`);
      });
    } else {
      console.log(' - No events recorded.');
    }

    console.log('\n\x1b[36m%s\x1b[0m', '-------------------------------------------------------');
    console.log('\x1b[36m%s\x1b[0m', ' Tip: run this report again at any time with:');
    console.log('\x1b[33m%s\x1b[0m', ' npm run ga-metrics');
    console.log('\x1b[36m%s\x1b[0m', '-------------------------------------------------------\n');

  } catch (err) {
    console.error('\x1b[31m❌ Error while running:\x1b[0m', err.message);
  }
}

main();
