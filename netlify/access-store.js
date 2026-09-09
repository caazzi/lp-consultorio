// netlify/access-store.js
// Shared helper to read/write access events on a durable Netlify Blobs store.
// Used by both the `log-access` function (write) and the `insights` function (read).
//
// ALSO the SERVER-SIDE source of truth for joining attribution metadata:
//  - CAMPAIGN_LABELS (known Google Ads campaign IDs -> human-readable names)
//  - canonical helpers that turn raw referer/UTM payloads into clean, predicate
//    buckets (source / preview classification) so reports are deterministic and
//    independent of what the loosely-typed client beacon happened to send.

const crypto = require('crypto');
const { connectLambda, getStore } = require('@netlify/blobs');

const STORE_NAME = 'access-events';
const KEY_PREFIX = 'event/';

// Weak visitor-grouping window (rolling hours) and a fixed opaque salt.
// The salt is not a secret (there is nothing meaningful to hide an IP digest
// from) — it only keeps derived keys from ever being read back to raw IP/UA and
// prevents accidental collision across other codebases reusing the same inputs.
const VISITOR_WINDOW_MS = 24 * 60 * 60 * 1000; // rolling ~day: bounded, non-durable by design
const VISITOR_SALT = 'lp-consultorio:visitor:v1';

// Mirror of the client-side map in public/assets/js/tracking.js (CAMPAIGN_LABELS).
// Keep both in sync — the server resolves canonical labels for reporting so raw
// gclid/gad_campaignid never leak into grouped stats.
const CAMPAIGN_LABELS = {
  '23071806673': 'Infectologia',
  '23747859815': 'Cardiologia'
};

// Netlify Functions inject the Blobs context in `event.blobs` + headers.
// `connectLambda` wires that into the SDK environment so getStore can auto-configure.
function connectBlobs(event) {
  if (event && event.blobs) {
    connectLambda(event);
  }
}

function getStoreInstance(event) {
  if (event) connectBlobs(event);
  return getStore(STORE_NAME);
}

// Timestamp-first key so `list` returns events in chronological order.
function makeKey(event) {
  const ts = event.timestamp || new Date().toISOString();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${KEY_PREFIX}${ts}_${rand}`;
}

/**
 * Returns true when a raw referer/host indicates Netlify deploy-preview (test/QA)
 * traffic that must be excluded from honest production funnel metrics.
 */
function isPreviewReferer(referer) {
  if (!referer) return false;
  try {
    const host = new URL(referer).hostname;
    // Preview URLs look like `<commit-hash>--<project-name>.netlify.app`.
    return /[0-9a-f]{7}--/.test(host) && host.endsWith('.netlify.app');
  } catch {
    return false;
  }
}

/**
 * Recovers a KNOWN Google Ads campaign id from a raw referer URL, if present.
 *
 * WHY: on first landing from a click the browser sends the page's own URL as the
 * referer, carrying `?gad_source=1&gad_campaignid=<id>&gclid=...`. The client beacon
 * does capture `gad_campaignid` into `utms` (see tracking.js collectUtmPayload), but
 * only when the campaign param is still in the live URL at beacon time — which is
 * not guaranteed on downstream events (clicks/message_sent) fired after internal
 * navigations strip the query. The referer on the other hand is captured at ingress
 * by log-access.js for EVERY event (`event.headers.referer`), so it is a reliable,
 * attribution-complete fallback source.
 *
 * Guard: an id is returned ONLY when it maps to a label in CAMPAIGN_LABELS. A bare
 * gclid or an unrecognized campaign id never leaks here — consistent with the rule
 * that raw Google Ads ids never appear in grouped stats. Preview/test traffic carries
 * its own host pattern and is handled separately by isPreviewReferer, so it never
 * reaches a campaign label here.
 *
 * @param {string} referer raw referer URL (may be empty/'null'/unparseable)
 * @returns {string} known campaign id, or '' when absent/unrecognized/unparseable
 */
function knownCampaignIdFromReferer(referer) {
  if (!referer) return '';
  let u;
  try {
    u = new URL(referer);
  } catch {
    return '';
  }
  const id = u.searchParams.get('gad_campaignid');
  return id && CAMPAIGN_LABELS[id] ? id : '';
}

/**
 * Derives a human-readable campaign label from a stored event.
 * Resolution order matches the client (tracking.js resolveCampaignLabel), extended
 * server-side with a referer fallback so attribution survives client events whose
 * `utms.gad_campaignid` was not populated (e.g. WhatsApp clicks/message_sent that
 * fire after the landing query string has been lost). Order:
 *   1. known campaign id from utms (gad_campaignid or utm campaign)
 *   2. known campaign id recovered from the referer querystring (gad_campaignid)
 *   3. utms.campaign
 *   4. utms.source
 *   5. 'Direto / Orgânico'
 */
function resolveCampaignLabelFromEvent(e) {
  const utms = e.utms || {};
  const campaignId = utms.gad_campaignid || utms.campaign;
  if (campaignId && CAMPAIGN_LABELS[campaignId]) return CAMPAIGN_LABELS[campaignId];
  const refererCampaignId = knownCampaignIdFromReferer(e && e.referer);
  if (refererCampaignId) return CAMPAIGN_LABELS[refererCampaignId];
  if (utms.campaign) return utms.campaign;
  if (utms.source) return utms.source;
  return 'Direto / Orgânico';
}

/**
 * Derives a canonical source string for a stored event, preferring a normalized
 * UTM source and otherwise falling back to a cleaned referer rather than the raw
 * full URL (which is polluted with gclid/gad_campaignid and must never be bucketed
 * verbatim). Preview/test referers collapse to a single `Preview / Teste` bucket.
 *
 * Paid-click nuance: an explicit Google Ads first-landing arrives with the page's own
 * URL as referer (`consultoriosalustiano.com.br/?gad_source=1&gad_campaignid=<id>&gclid=...`).
 * When that referer carries a KNOWN campaign id we surface the readable campaign label
 * (e.g. "Infectologia") as the source rather than collapsing to "Direto / Orgânico" —
 * otherwise paid volume is measured as direct. A bare `gclid` with no KNOWN campaign id
 * stays "Direto / Orgânico" (genuinely ambiguous: the id alone encodes no readable source,
 * and raw gclid must never leak).
 */
function canonicalSourceFromEvent(e) {
  const utms = e.utms || {};
  const rawSource = (utms.source || '').trim();
  if (rawSource) return rawSource;

  const referer = e.referer || '';
  if (isPreviewReferer(referer)) return '__preview__';

  if (!referer) return 'Direto / Orgânico';

  try {
    const host = new URL(referer).hostname.replace(/^www\./, '');
    // Own domain or empty host = direct navigation, NOT an external referrer —
    // unless the referer is a paid first-landing carrying a known campaign id.
    if (!host || host === 'consultoriosalustiano.com.br') {
      const refCampaignId = knownCampaignIdFromReferer(referer);
      if (refCampaignId) return CAMPAIGN_LABELS[refCampaignId];
      return 'Direto / Orgânico';
    }
    return host;
  } catch {
    // Unparseable referer (rare). Fall back to the path root, stripped of query.
    const noQuery = referer.split(/[?#]/)[0];
    if (!noQuery) return 'Direto / Orgânico';
    const bare = noQuery.replace(/^https?:\/\//, '').split('/')[0] || '';
    return bare || 'Direto / Orgânico';
  }
}

/**
 * Classifies whether an event belongs to non-production (preview/test) traffic,
 * based on its referer host (deploy previews share a `<sha>--…`.netlify.app
 * pattern), regardless of the UTM fields the client may have attached.
 */
function isPreviewEvent(e) {
  const referer = (e && e.referer) || '';
  if (isPreviewReferer(referer)) return true;
  const path = (e && typeof e.path === 'string' && e.path) || '';
  if (/^https?:\/\/[0-9a-f]{7}--/.test(path)) return true;
  return false;
}

// Normalizes a User-Agent string for hashing: trims and collapses internal
// whitespace so byte-identical browsers do not split into separate keys just
// because of cosmetic spacing/casing differences.
function normalizeUserAgent(ua) {
  return String(ua || '')
    .trim()
    .replace(/\s+/g, ' ').toLowerCase();
}

// Rounds a timestamp down to its rolling window slot. Using a fixed-width
// rolling window (relative to the epoch) rather than a local calendar day avoids
// splitting one return visit that happens to straddle a local midnight.
function windowSlot(tsMs, windowMs) {
  return Math.floor(tsMs / windowMs);
}

// Converts an event's timestamp (ISO string or ms) to epoch ms.
function eventTimeMs(e) {
  const raw = (e && (e.timestamp || e.ts)) || '';
  if (typeof raw === 'number') return raw;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Weak, BOUNDED, non-durable server-side visitor-grouping key derived ONLY from
 * request metadata already captured at write time (ip + normalized user_agent +
 * coarse rolling time window). It is NOT a durable identifier and nothing about
 * it touches the browser, cookies, or any third party (Google included).
 *
 * WHY: `client_id` on this site is an ephemeral per-page-load UUID (the
 * "consent-light" design keeps no cookies), so naive unique-user accounting
 * over-counts a returning visitor (e.g. reads /cardiologia today, returns and
 * clicks WhatsApp tomorrow) as multiple distinct people. This key lets READ-ONLY
 * aggregation group events that plausibly came from the same browser/person
 * within a short rolling window — without adding any JS, cookie, CSP host,
 * persistent storage, or durable identity, matching the zero-consent-friction
 * privacy posture of the site.
 *
 * The output is an opaque salted SHA-256 digest so derived data can never be read
 * back to the raw IP/UA. The rolling window keeps it intentionally weak: after
 * VISITOR_WINDOW_MS the same browser keys DIFFERENTLY, so it never becomes a
 * stable device/browser fingerprint.
 *
 * Degrades gracefully: any missing/unparseable input yields `null`, which callers
 * should EXCLUDE from estimated-unique-visitor math (never over-collapse on null).
 *
 * @param {object} e a stored event with ip / user_agent / timestamp
 * @returns {string|null} opaque grouping key, or null when inputs are unusable
 */
function deriveVisitorGroupKey(e) {
  const ip = (e && e.ip) || '';
  const ua = normalizeUserAgent((e && e.user_agent) || '');
  const tsMs = eventTimeMs(e);
  if (!ip || !ua || tsMs === null) return null;

  const slot = windowSlot(tsMs, VISITOR_WINDOW_MS);
  // Digest of "salt | slot | ip | ua" — HMAC-style length-safe, deterministic.
  const digest = crypto.createHash('sha256')
    .update(`${VISITOR_SALT}|${slot}|${ip}|${ua}`)
    .digest('hex')
    .slice(0, 32); // 128-bit: enough for grouping, short enough for reports
  return digest;
}

module.exports = {
  STORE_NAME,
  KEY_PREFIX,
  CAMPAIGN_LABELS,
  connectBlobs,
  getStoreInstance,
  makeKey,
  isPreviewReferer,
  isPreviewEvent,
  deriveVisitorGroupKey,
  knownCampaignIdFromReferer,
  canonicalSourceFromEvent,
  resolveCampaignLabelFromEvent
};
