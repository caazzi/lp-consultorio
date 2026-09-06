// netlify/access-store.js
// Shared helper to read/write access events on a durable Netlify Blobs store.
// Used by both the `log-access` function (write) and the `insights` function (read).
//
// ALSO the SERVER-SIDE source of truth for joining attribution metadata:
//  - CAMPAIGN_LABELS (known Google Ads campaign IDs -> human-readable names)
//  - canonical helpers that turn raw referer/UTM payloads into clean, predicate
//    buckets (source / preview classification) so reports are deterministic and
//    independent of what the loosely-typed client beacon happened to send.

const { connectLambda, getStore } = require('@netlify/blobs');

const STORE_NAME = 'access-events';
const KEY_PREFIX = 'event/';

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
 * Derives a human-readable campaign label from a stored event.
 * Resolution order matches the client (tracking.js resolveCampaignLabel):
 *   1. known campaign id (gad_campaignid or utm campaign)  -> readable label
 *   2. utms.campaign
 *   3. utms.source
 *   4. 'Direto / Orgânico'
 */
function resolveCampaignLabelFromEvent(e) {
  const utms = e.utms || {};
  const campaignId = utms.gad_campaignid || utms.campaign;
  if (campaignId && CAMPAIGN_LABELS[campaignId]) return CAMPAIGN_LABELS[campaignId];
  if (utms.campaign) return utms.campaign;
  if (utms.source) return utms.source;
  return 'Direto / Orgânico';
}

/**
 * Derives a canonical source string for a stored event, preferring a normalized
 * UTM source and otherwise falling back to a cleaned referer rather than the raw
 * full URL (which is polluted with gclid/gad_campaignid and must never be bucketed
 * verbatim). Preview/test referers collapse to a single `Preview / Teste` bucket.
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
    // Own domain or empty host = direct navigation, not an external referrer.
    if (!host || host === 'consultoriosalustiano.com.br') return 'Direto / Orgânico';
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

module.exports = {
  STORE_NAME,
  KEY_PREFIX,
  CAMPAIGN_LABELS,
  connectBlobs,
  getStoreInstance,
  makeKey,
  isPreviewReferer,
  isPreviewEvent,
  canonicalSourceFromEvent,
  resolveCampaignLabelFromEvent
};
