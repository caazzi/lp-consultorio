const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

console.log('\x1b[36m%s\x1b[0m', '=======================================================');
console.log('\x1b[36m%s\x1b[0m', ' 🔍 GOOGLE SEARCH CONSOLE REPORT (GSC APIs) ');
console.log('\x1b[36m%s\x1b[0m', '=======================================================\n');

// 1. Locate the Service Account credentials file
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '../ga-credentials.json');

if (!fs.existsSync(credPath)) {
  console.log('\x1b[33m%s\x1b[0m', '⚠️  Credentials file (ga-credentials.json) not found!');
  console.log('\nTo connect the terminal directly to Google Search Console:');
  console.log(' 1. Create a Service Account in Google Cloud Console (or reuse the GA4 one).');
  console.log(' 2. Download the JSON key and save it as ga-credentials.json in the repo root.');
  console.log(' 3. Enable the "Google Search Console API" for the project that owns the key.');
  console.log(' 4. In Search Console (Settings > Users and permissions), add the Service');
  console.log('    Account e-mail as a user of the property.');
  console.log(' 5. Export the property: export GSC_SITE_URL=sc-domain:example.com\n');
  process.exit(0);
}

let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
} catch (err) {
  console.error('\x1b[31m❌ Failed to read ga-credentials.json:\x1b[0m', err.message);
  process.exit(1);
}

const SITE_URL = process.env.GSC_SITE_URL;

if (!SITE_URL) {
  console.log('\x1b[33m%s\x1b[0m', '⚠️  GSC_SITE_URL is not set!');
  console.log('Set the Search Console property through an environment variable.');
  console.log('Use the exact string shown in Search Console, either a domain property');
  console.log('or a URL-prefix property:\n');
  console.log('  export GSC_SITE_URL=sc-domain:consultoriosalustiano.com.br');
  console.log('  export GSC_SITE_URL=https://consultoriosalustiano.com.br/\n');
  process.exit(0);
}

const DAYS = parsePositiveInt(process.env.GSC_DAYS, 90, 'GSC_DAYS');
const ROW_LIMIT = 20;

// Pages inspected by default. Absolute URLs, as required by the Inspection API.
const INSPECT_URLS = [
  'https://consultoriosalustiano.com.br/',
  'https://consultoriosalustiano.com.br/cardiologia/'
];

function parsePositiveInt(raw, fallback, name) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    console.log('\x1b[33m%s\x1b[0m', `⚠️  ${name}="${raw}" is not a positive integer, using ${fallback}.`);
    return fallback;
  }
  return n;
}

/**
 * Formats a Date as an absolute YYYY-MM-DD string (UTC).
 * Search Console rejects relative dates such as "90daysAgo".
 */
function isoDate(date) {
  return date.toISOString().slice(0, 10);
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
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
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
          reject(new ApiError(res.statusCode, extractErrorMessage(data)));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

class ApiError extends Error {
  constructor(statusCode, apiMessage) {
    super(apiMessage || `HTTP ${statusCode}`);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.apiMessage = apiMessage || '';
  }
}

/**
 * Extracts the human message from a Google API error body without leaking
 * request details or credentials.
 */
function extractErrorMessage(rawBody) {
  if (!rawBody) return '';
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed.error && parsed.error.message) return String(parsed.error.message);
    if (parsed.error_description) return String(parsed.error_description);
    return JSON.stringify(parsed).slice(0, 500);
  } catch (err) {
    return String(rawBody).slice(0, 500);
  }
}

/**
 * Performs an authenticated JSON request against a Google API endpoint.
 */
function apiRequest(method, url, accessToken, requestBody) {
  return new Promise((resolve, reject) => {
    const payload = requestBody === undefined ? null : JSON.stringify(requestBody);
    const headers = { 'Authorization': `Bearer ${accessToken}` };
    if (payload !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch (err) { parsed = null; }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed || {});
        } else {
          reject(new ApiError(res.statusCode, extractErrorMessage(data)));
        }
      });
    });

    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

/**
 * Turns an API failure into an actionable explanation for the operator.
 * Never includes the private key or the access token.
 */
function describeError(err, serviceAccountEmail) {
  const message = err.apiMessage || '';
  const status = err.statusCode;

  if (status === 401) {
    return [
      'Authentication failed (401): the access token was rejected or has expired.',
      'Re-run the script so a fresh token is issued.',
      'If it keeps failing, check that the service account key is still valid and that',
      `the OAuth scope is https://www.googleapis.com/auth/webmasters.readonly.`
    ].join('\n');
  }

  if (status === 429) {
    return [
      'Quota exceeded (429): the Search Console API rejected the request.',
      'Wait a few minutes before running the report again.'
    ].join('\n');
  }

  if (status === 403) {
    if (/has not been used in project|it is disabled/i.test(message)) {
      const projectId = (message.match(/project[= ]([0-9]{6,})/) || [])[1];
      const projectFlag = projectId ? ` --project=${projectId}` : '';
      return [
        'The Google Search Console API is not enabled for the Cloud project that owns',
        'this service account. Enable it and retry:',
        '',
        `  gcloud services enable searchconsole.googleapis.com${projectFlag}`,
        '',
        'Or open the Cloud Console, APIs & Services, and enable "Google Search Console API".',
        `Service account: ${serviceAccountEmail}`
      ].join('\n');
    }
    return [
      'Access denied (403) to this Search Console property.',
      'The service account is probably not a user of the property.',
      `Service account: ${serviceAccountEmail}`,
      'In Search Console, open Settings > Users and permissions and add that e-mail as',
      'a Full or Restricted user of the property, then retry.',
      `Property used: ${SITE_URL}`
    ].join('\n');
  }

  const detail = message ? `${status}: ${message}` : `${status}`;
  return `Request failed (${detail}).`;
}

async function main() {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime());
  startDate.setUTCDate(startDate.getUTCDate() - (DAYS - 1));

  const range = { startDate: isoDate(startDate), endDate: isoDate(endDate) };
  const encodedSite = encodeURIComponent(SITE_URL);

  try {
    console.log(`🔑 Authenticating with the Service Account: \x1b[32m${credentials.client_email}\x1b[0m...`);
    const token = await getAccessToken(credentials);
    console.log('✅ OAuth token obtained.\n');

    // 1. Properties visible to the service account
    console.log('\x1b[33m%s\x1b[0m', '🗂️  1. SEARCH CONSOLE PROPERTIES');
    const sites = await apiRequest('GET', 'https://www.googleapis.com/webmasters/v3/sites', token);
    const entries = Array.isArray(sites.siteEntry) ? sites.siteEntry : [];
    if (entries.length === 0) {
      console.log(' - No properties visible to this service account.');
      console.log(`   Add ${credentials.client_email} in Search Console > Settings > Users and permissions.`);
    } else {
      entries.forEach(entry => {
        const marker = entry.siteUrl === SITE_URL ? '\x1b[32m*\x1b[0m' : ' ';
        console.log(` ${marker} ${entry.siteUrl.padEnd(48)} \x1b[36m${entry.permissionLevel || 'unknown'}\x1b[0m`);
      });
      console.log(`\n Using property: \x1b[32m${SITE_URL}\x1b[0m`);
    }

    // 2. URL inspection (index status)
    console.log('\n\x1b[33m%s\x1b[0m', '📌 2. INDEX STATUS (URL INSPECTION API)');
    for (const inspectionUrl of INSPECT_URLS) {
      const result = await apiRequest(
        'POST',
        'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
        token,
        { inspectionUrl, siteUrl: SITE_URL }
      );

      const status = result.inspectionResult && result.inspectionResult.indexStatusResult;
      console.log(`\n - \x1b[1m${inspectionUrl}\x1b[0m`);

      if (!status) {
        console.log('   No indexStatusResult returned for this URL.');
        console.log('   This usually means the URL is outside the property or was excluded');
        console.log('   from indexing, so there is no index status to report.');
        continue;
      }

      const verdict = status.verdict || 'VERDICT_UNSPECIFIED';
      const color = verdict === 'PASS' ? '\x1b[32m' : '\x1b[33m';
      console.log(`   Verdict        : ${color}${verdict}\x1b[0m`);
      console.log(`   Coverage state : ${status.coverageState || 'unknown'}`);
      console.log(`   Indexing state : ${status.indexingState || 'unknown'}`);
      console.log(`   Page fetch     : ${status.pageFetchState || 'unknown'}`);
      console.log(`   robots.txt     : ${status.robotsTxtState || 'unknown'}`);
      console.log(`   Crawled as     : ${status.crawledAs || 'unknown'}`);
      console.log(`   Last crawl     : ${status.lastCrawlTime || 'never'}`);
      if (status.sitemap && status.sitemap.length) {
        console.log(`   Sitemaps       : ${status.sitemap.join(', ')}`);
      }
    }

    // 3. Top queries
    console.log('\n\x1b[33m%s\x1b[0m', `🔎 3. TOP ${ROW_LIMIT} QUERIES (${range.startDate} to ${range.endDate})`);
    const queryReport = await apiRequest(
      'POST',
      `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
      token,
      { ...range, dimensions: ['query'], rowLimit: ROW_LIMIT }
    );

    const queryRows = Array.isArray(queryReport.rows) ? queryReport.rows : [];
    if (queryRows.length === 0) {
      console.log(' - No query data for this window.');
    } else {
      console.log(` ${'Query'.padEnd(40)} ${'Clicks'.padStart(7)} ${'Impr.'.padStart(8)} ${'CTR'.padStart(8)} ${'Pos.'.padStart(6)}`);
      queryRows.forEach(row => {
        const query = truncate(row.keys[0], 40).padEnd(40);
        const clicks = String(row.clicks || 0).padStart(7);
        const impressions = String(row.impressions || 0).padStart(8);
        const ctr = `${((row.ctr || 0) * 100).toFixed(1)}%`.padStart(8);
        const position = (row.position || 0).toFixed(1).padStart(6);
        console.log(` ${query} \x1b[32m${clicks}\x1b[0m ${impressions} ${ctr} ${position}`);
      });
    }

    // 4. Top pages
    console.log('\n\x1b[33m%s\x1b[0m', `📄 4. TOP ${ROW_LIMIT} PAGES (${range.startDate} to ${range.endDate})`);
    const pageReport = await apiRequest(
      'POST',
      `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
      token,
      { ...range, dimensions: ['page'], rowLimit: ROW_LIMIT }
    );

    const pageRows = Array.isArray(pageReport.rows) ? pageReport.rows : [];
    if (pageRows.length === 0) {
      console.log(' - No page data for this window.');
    } else {
      console.log(` ${'Page'.padEnd(58)} ${'Clicks'.padStart(7)} ${'Impr.'.padStart(8)}`);
      pageRows.forEach(row => {
        const page = truncate(row.keys[0], 58).padEnd(58);
        const clicks = String(row.clicks || 0).padStart(7);
        const impressions = String(row.impressions || 0).padStart(8);
        console.log(` ${page} \x1b[32m${clicks}\x1b[0m ${impressions}`);
      });
    }

    console.log('\n\x1b[36m%s\x1b[0m', '-------------------------------------------------------');
    console.log('\x1b[36m%s\x1b[0m', ' Tip: run this report again at any time with:');
    console.log('\x1b[33m%s\x1b[0m', ' npm run gsc-metrics');
    console.log('\x1b[36m%s\x1b[0m', ' Set GSC_DAYS to change the window (default 90).');
    console.log('\x1b[36m%s\x1b[0m', '-------------------------------------------------------\n');
  } catch (err) {
    if (err instanceof ApiError) {
      console.error('\n\x1b[31m❌ Search Console request failed.\x1b[0m');
      console.error(describeError(err, credentials.client_email));
      process.exit(1);
    }
    console.error('\x1b[31m❌ Error while running:\x1b[0m', err.message);
    process.exit(1);
  }
}

function truncate(value, max) {
  const text = String(value === undefined || value === null ? '' : value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

main();
