// netlify/access-store.js
// Shared helper to read/write access events on a durable Netlify Blobs store.
// Used by both the `log-access` function (write) and the `insights` function (read).
const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'access-events';
const KEY_PREFIX = 'event/';

function getStoreInstance() {
  return getStore(STORE_NAME);
}

// Timestamp-first key so `list` returns events in chronological order.
function makeKey(event) {
  const ts = event.timestamp || new Date().toISOString();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${KEY_PREFIX}${ts}_${rand}`;
}

module.exports = { STORE_NAME, KEY_PREFIX, getStoreInstance, makeKey };
