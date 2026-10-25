// scripts/lib/insights-api.js — cliente único da função `insights`.
//
// Fonte ÚNICA para os relatórios que leem o funil first-party (`weekly-report`,
// `product-report`). Centralizar aqui evita duas cópias do mesmo fetch e, mais
// importante, dá aos dois a mesma política de resiliência.
//
// POR QUE retry (regressão 2026-10): a função `insights` passou a estourar o
// timeout do Netlify (~30 s) e respondeu 504/502 para o job semanal, que morria
// sem enviar o email. A causa foi corrigida em `netlify/access-store.js`
// (coleta O(janela) + concorrência limitada), mas um 5xx transitório do provedor
// — deploy no meio do job, cold start lento — não deve custar a semana inteira
// de relatório. Erros 4xx (URL/param errado) NÃO são repetidos: repetir não
// conserta bug de chamada, só atrasa o diagnóstico.
//
// O timeout por tentativa é menor que o timeout de borda do Netlify de propósito:
// preferimos falhar rápido e tentar de novo a ficar 30 s pendurado por tentativa.

const DEFAULT_INSIGHTS_URL = process.env.ACCESS_INSIGHTS_URL
  || 'https://consultoriosalustiano.com.br/.netlify/functions/insights';

// Retentáveis: transitórios do provedor + throttling explícito.
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = [1000, 4000];
const DEFAULT_TIMEOUT_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET `${insights}?days=<days>` com retry exponencial em falhas transitórias.
 *
 * @param {number} days janela em dias (validada no servidor: 1..90)
 * @param {object} [options]
 * @param {string} [options.url] endpoint alternativo (default: produção)
 * @param {number} [options.attempts] tentativas totais (default 3)
 * @param {number[]} [options.backoffMs] espera entre tentativas
 * @param {number} [options.timeoutMs] timeout por tentativa
 * @returns {Promise<object>} payload JSON da função
 * @throws {Error} quando todas as tentativas falham, com `.status` e `.attempts`
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
      console.warn(`[insights] tentativa ${attempt}/${attempts} falhou (${err.message}); nova tentativa em ${wait}ms`);
      await sleep(wait);
    }
  }

  lastError.attempts = attempts;
  throw lastError;
}

module.exports = { fetchInsights, DEFAULT_INSIGHTS_URL };
