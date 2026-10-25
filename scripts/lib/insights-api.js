// scripts/lib/insights-api.js — single client for the `insights` function.
//
// Single source of truth for the reports that read the first-party funnel
// (`weekly-report`, `product-report`). One fetch implementation and, more
// importantly, one resilience policy for both.
//
// WHY retry (2026-10 regression): `insights` started hitting Netlify's timeout
// (~30s) and answered 504/502 to the weekly job, which then died without sending
// the email. The cause was fixed in `netlify/access-store.js` (O(window)
// collection + bounded concurrency), but a transient 5xx from the provider — a
// deploy mid-run, a slow cold start — must not cost a whole week of reporting.
// 4xx errors (wrong URL/param) are NOT retried: retrying does not fix a call-site
// bug, it only delays the diagnosis.
//
// The per-attempt timeout is deliberately shorter than Netlify's edge timeout:
// better to fail fast and try again than to hang for 30s per attempt.

const DEFAULT_INSIGHTS_URL = process.env.ACCESS_INSIGHTS_URL
  || 'https://consultoriosalustiano.com.br/.netlify/functions/insights';

// Retryable: transient provider failures + explicit throttling.
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = [1000, 4000];
const DEFAULT_TIMEOUT_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET `${insights}?days=<days>` with exponential backoff on transient failures.
 *
 * @param {number} days window in days (server validates 1..90)
 * @param {object} [options]
 * @param {string} [options.url] alternative endpoint (default: production)
 * @param {number} [options.attempts] total attempts (default 3)
 * @param {number[]} [options.backoffMs] wait between attempts
 * @param {number} [options.timeoutMs] timeout per attempt
 * @returns {Promise<object>} JSON payload from the function
 * @throws {Error} when every attempt fails, carrying `.status` and `.attempts`
 */
async function fetchInsights(days, options = {}) {
  const url = options.url || DEFAULT_INSIGHTS_URL;
  const attempts = Math.max(1, options.attempts || DEFAULT_ATTEMPTS);
  const backoff = options.backoffMs || DEFAULT_BACKOFF_MS;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(`${url}?days=${days}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (res.ok) return await res.json();

      const detail = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      const err = new Error(`insights ${res.status}${detail ? `: ${detail}` : ''}`);
      err.status = res.status;
      err.retryable = RETRYABLE_STATUS.has(res.status);
      throw err;
    } catch (err) {
      // Network errors and per-attempt timeouts arrive with no status -> transient.
      if (err.retryable === undefined) err.retryable = true;
      lastError = err;
      if (!err.retryable || attempt === attempts) break;
      const wait = backoff[Math.min(attempt - 1, backoff.length - 1)];
      console.warn(`[insights] attempt ${attempt}/${attempts} failed (${err.message}); retrying in ${wait}ms`);
      await sleep(wait);
    }
  }

  lastError.attempts = attempts;
  throw lastError;
}

module.exports = { fetchInsights, DEFAULT_INSIGHTS_URL };
