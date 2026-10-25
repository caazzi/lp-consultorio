// scripts/lib/weekly-report-copy.pt.js
//
// PT-BR surfaces for the weekly email: every string the doctor reads lives HERE,
// and nowhere else in the pipeline. This module is the only file (besides the
// monthly counterpart and `public/`) allowed to contain Portuguese.
//
// Why a separate module (2026-10): the repo rule is "PT-BR only in the user UI or
// in emails". Keeping the copy isolated makes that rule mechanically checkable
// (`npm run lang:check`) instead of a per-line judgement call, and it keeps the
// report script itself in English. Logic must NOT move here — only copy.
//
// Everything exported by this file is rendered verbatim into `body.txt`/`body.html`,
// so editing any string changes what the owner receives.

// Thresholds for the "worth your attention" box. They describe copy behaviour
// (when to speak up), so they travel with the copy instead of the data layer.
const NOTICE_MIN_BASE = 4;      // ignore small bases (last week < 4)
const NOTICE_DROP_PCT = 40;     // a >= 40% drop raises the notice
const NOTICE_ZERO = true;       // dropping a metric that existed also raises it

function fmt(n) { return Number(n).toLocaleString('pt-BR'); }

/**
 * Natural agreement: "1 pessoa" / "3 pessoas". Used across the owner-facing copy
 * to avoid the ugly "3 pessoa(s)".
 */
function plural(n, singular, pluralForm) {
  return `${fmt(n)} ${Number(n) === 1 ? singular : pluralForm}`;
}

/**
 * Turns a campaign/source key into a human label. Internal names
 * ('Infectologia', 'Direct / Organic', 'Hero Main') mean nothing to a lay reader.
 */
function friendlySource(name) {
  const n = String(name || '').trim();
  // Matches the current label ('Direct / Organic') and the legacy PT-BR one, so
  // historical payloads and older CLI output still map to the same sentence.
  if (/direct|organic|direto|org[âa]nico/i.test(n)) return 'Quem já conhece o site (busca no Google ou digita o endereço)';
  if (/infectolog/i.test(n)) return 'Anúncios pagos no Google (Infectologia)';
  if (/cardio/i.test(n)) return 'Página de Cardiologia';
  return n || 'Outras origens';
}

function friendlyButton(name) {
  const n = String(name || '').trim();
  const map = {
    'Hero Main': 'Botão principal do topo da página',
    'Header': 'Botão no cabeçalho',
    'Floating_Sticky': 'Botão flutuante (fixo na tela)',
    'Floating Button': 'Botão flutuante'
  };
  return map[n] || n;
}

function friendlyGA4Source(name) {
  const n = String(name || '').trim();
  if (/google\s*\/\s*cpc/i.test(n)) return 'Anúncios do Google (pagos)';
  if (/google\s*\/\s*organic/i.test(n)) return 'Busca do Google (sem pagar)';
  if (/direct/i.test(n)) return 'Acesso direto';
  return n;
}

/** Comparison text: "9 (▲ +2 vs. semana passada)". */
function withTrend(current, previous) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (previous === undefined || previous === null) return fmt(cur);
  const diff = cur - prev;
  if (diff === 0) return `${fmt(cur)} <span class="flat">(igual à semana passada)</span>`;
  const arrow = diff > 0 ? '▲' : '▼';
  const cls = diff > 0 ? 'up' : 'down';
  const sign = diff > 0 ? '+' : '';
  return `${fmt(cur)} <span class="${cls}">(${arrow} ${sign}${fmt(diff)} em relação à semana passada)</span>`;
}

/** Plain-text comparison (email text fallback). */
function withTrendText(current, previous) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (previous === undefined || previous === null) return fmt(cur);
  const diff = cur - prev;
  if (diff === 0) return `${fmt(cur)} (igual à semana passada)`;
  const direction = diff > 0 ? 'a mais' : 'a menos';
  const sign = diff > 0 ? '+' : '';
  return `${fmt(cur)} (${sign}${fmt(diff)} ${direction} que na semana passada)`;
}

/**
 * Raises notices only when the change is big enough for the owner to act on.
 * Silent when nothing relevant happened: the email must not sound alarming
 * every week.
 */
function buildNotices(cur, prev) {
  const flag = (now, before) => {
    if (before === undefined || before === null) return false;
    if (before < NOTICE_MIN_BASE) return false;   // small base = noise
    if (NOTICE_ZERO && now === 0) return true;     // dropped something that existed
    return ((before - now) / before) * 100 >= NOTICE_DROP_PCT;
  };

  const droppedClicks = flag(cur.whatsappClicks, prev.whatsappClicks);
  const droppedConvos = flag(cur.messagesSent, prev.messagesSent);

  // Clicks and opened conversations move together (the conversation follows the
  // click). When both drop we show a single notice: repeating it would look like
  // two different problems.
  if (droppedClicks) {
    if (cur.whatsappClicks === 0 && prev.whatsappClicks >= NOTICE_MIN_BASE) {
      return [`Ninguém chamou no WhatsApp esta semana. Na semana passada foram ${fmt(prev.whatsappClicks)}.`];
    }
    const drop = Math.round(((prev.whatsappClicks - cur.whatsappClicks) / prev.whatsappClicks) * 100);
    return [`Menos gente chamou no WhatsApp: ${fmt(cur.whatsappClicks)} nesta semana contra ${fmt(prev.whatsappClicks)} na semana passada, uma queda de ${drop}%.`];
  }
  if (droppedConvos) {
    return [`Menos conversas foram abertas: ${fmt(cur.messagesSent)} nesta semana contra ${fmt(prev.messagesSent)} na semana passada.`];
  }
  return [];
}

function periodLabel(when) {
  return `Semana encerrada em ${when.split(',')[0]}`;
}

function periodLabelNatural(when) {
  return `semana encerrada em ${when.split(',')[0]}`;
}

// ---------------------------------------------------------------------------
// Render: plain text fallback
// ---------------------------------------------------------------------------

function renderText(fp, ga, prev, when) {
  const L = [];
  const s = fp.summary;
  const leads = s.whatsappClicks;

  L.push('RESUMO DA SEMANA | Consultório Salustiano');
  L.push(periodLabel(when));
  L.push('');
  const clicaram = Number(leads) === 1 ? 'clicou' : 'clicaram';
  L.push(`Nesta semana, ${plural(leads, 'pessoa', 'pessoas')} ${clicaram} para falar no WhatsApp a partir do site.`);
  if (s.messagesSent > 0 && s.messagesSent < leads) {
    const abriram = Number(s.messagesSent) === 1 ? 'abriu' : 'abriram';
    L.push(`Ao todo, ${plural(s.messagesSent, 'pessoa', 'pessoas')} ${abriram} a conversa no WhatsApp.`);
  } else if (s.messagesSent > 0) {
    L.push(`O site também registrou ${plural(s.messagesSent, 'conversa aberta', 'conversas abertas')} no WhatsApp.`);
  }
  L.push('');

  L.push('O QUE MAIS IMPORTA');
  L.push(`- Pessoas que chamaram no WhatsApp: ${withTrendText(leads, prev.whatsappClicks)}`);
  L.push(`- Conversas abertas: ${withTrendText(s.messagesSent, prev.messagesSent)}`);
  L.push(`- Visitas à página: ${withTrendText(s.pageViews, prev.pageViews)}`);
  L.push('');

  const notices = buildNotices(
    { whatsappClicks: leads, messagesSent: s.messagesSent },
    { whatsappClicks: prev.whatsappClicks, messagesSent: prev.messagesSent }
  );
  if (notices.length) {
    L.push('VALE A ATENÇÃO');
    notices.forEach((n) => L.push(`- ${n}`));
    L.push('');
  }

  L.push('DE ONDE VEIO O CONTATO');
  Object.entries(fp.sources).forEach(([src, n]) => L.push(`- ${friendlySource(src)}: ${fmt(n)}`));
  L.push('');

  if (ga.ok) {
    const lead = ga.events.find((e) => e.name === 'generate_lead');
    if (lead) {
      L.push('O GOOGLE TAMBÉM REGISTROU');
      L.push(`- Contatos de WhatsApp para o Google: ${fmt(lead.count)}`);
      L.push('  (é só uma conferência. O número do site acima é o mais confiável.)');
      L.push('');
    }
  }

  L.push('DETALHES TÉCNICOS (pode ignorar esta parte)');
  L.push(`Visitantes estimados: ${s.estimatedVisitors != null ? fmt(s.estimatedVisitors) : 'n/d'}`);
  L.push(`Taxa de clique no WhatsApp: ${s.engagementRate}%`);
  if (fp.perCampaign.length) {
    L.push('Por campanha:');
    fp.perCampaign.forEach((c) => L.push(`  - ${friendlySource(c.campaign)}: ${plural(c.clicks, 'clique', 'cliques')}, ${plural(c.leads, 'conversa', 'conversas')}`));
  }
  if (fp.buttons && Object.keys(fp.buttons).length) {
    L.push('Botões mais clicados:');
    Object.entries(fp.buttons).forEach(([b, n]) => L.push(`  - ${friendlyButton(b)}: ${n}`));
  }
  if (ga.ok) {
    L.push(`GA4: sessões ${fmt(ga.overview.sessions)}, usuários ${fmt(ga.overview.activeUsers)}, páginas ${fmt(ga.overview.pageViews)}`);
    ga.traffic.forEach((t) => L.push(`  - ${friendlyGA4Source(t.source)}: ${plural(t.sessions, 'sessão', 'sessões')}`));
  } else {
    L.push(`GA4 indisponível (${ga.reason})`);
  }
  if (fp.test && fp.test.events > 0) L.push(`Eventos de teste (ignorados): ${fp.test.events}`);
  if (fp.preview && fp.preview.events > 0) L.push(`Acessos de teste e pré-visualização (ignorados): ${fp.preview.events}`);
  L.push('');
  L.push(`Relatório detalhado para o técnico: npm run access-logs`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Render: HTML
// ---------------------------------------------------------------------------

function renderHtml(fp, ga, prev, when) {
  const s = fp.summary;
  const leads = s.whatsappClicks;

  const notices = buildNotices(
    { whatsappClicks: leads, messagesSent: s.messagesSent },
    { whatsappClicks: prev.whatsappClicks, messagesSent: prev.messagesSent }
  );

  const kpi = (label, valueHtml, hint) =>
    `<td style="padding:10px 14px;vertical-align:top">
       <div style="font-size:12px;color:#555">${label}</div>
       <div style="font-size:22px;font-weight:700;color:#0f766e;line-height:1.2">${valueHtml}</div>
       ${hint ? `<div style="font-size:11px;color:#888;margin-top:2px">${hint}</div>` : ''}
     </td>`;

  const sourceRows = Object.entries(fp.sources).map(([src, n]) =>
    `<tr><td style="padding:4px 0">${friendlySource(src)}</td><td style="text-align:right;padding-left:12px"><b>${fmt(n)}</b></td></tr>`).join('');

  const noticeHtml = notices.length
    ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:10px 14px;border-radius:4px;margin:16px 0">
         <div style="font-weight:700;color:#92400e;margin-bottom:4px">Vale a atenção</div>
         ${notices.map((n) => `<div style="color:#78350f;font-size:14px">${n}</div>`).join('')}
       </div>`
    : '';

  const details = [];
  details.push(`<li>Visitantes estimados: <b>${s.estimatedVisitors != null ? fmt(s.estimatedVisitors) : 'n/d'}</b></li>`);
  details.push(`<li>Taxa de clique no WhatsApp: <b>${s.engagementRate}%</b></li>`);
  if (fp.perCampaign.length) {
    details.push(`<li>Por campanha:<ul>${fp.perCampaign.map((c) => `<li>${friendlySource(c.campaign)}: ${plural(c.clicks, 'clique', 'cliques')}, ${plural(c.leads, 'conversa', 'conversas')}</li>`).join('')}</ul></li>`);
  }
  if (fp.buttons && Object.keys(fp.buttons).length) {
    details.push(`<li>Botões mais clicados:<ul>${Object.entries(fp.buttons).map(([b, n]) => `<li>${friendlyButton(b)}: ${n}</li>`).join('')}</ul></li>`);
  }
  if (ga.ok) {
    details.push(`<li>GA4: sessões <b>${fmt(ga.overview.sessions)}</b>, usuários <b>${fmt(ga.overview.activeUsers)}</b>, páginas <b>${fmt(ga.overview.pageViews)}</b>
      <ul>${ga.traffic.map((t) => `<li>${friendlyGA4Source(t.source)}: ${plural(t.sessions, 'sessão', 'sessões')}</li>`).join('')}</ul></li>`);
  } else {
    details.push(`<li>GA4 indisponível (${ga.reason})</li>`);
  }
  if (fp.test && fp.test.events > 0) details.push(`<li>Eventos de teste (ignorados): ${fp.test.events}</li>`);
  if (fp.preview && fp.preview.events > 0) details.push(`<li>Acessos de teste e pré-visualização (ignorados): ${fp.preview.events}</li>`);

  let googleBlock = '';
  if (ga.ok) {
    const lead = ga.events.find((e) => e.name === 'generate_lead');
    if (lead) {
      googleBlock = `
      <div style="background:#f0fdfa;padding:12px 16px;border-radius:6px;margin:16px 0;font-size:14px">
        <b>O Google também registrou ${plural(lead.count, 'contato', 'contatos')}</b> pelo WhatsApp.<br>
        <span style="color:#666;font-size:12px">É apenas uma conferência. O número do site acima é o mais confiável, porque não é afetado por bloqueadores de anúncio.</span>
      </div>`;
    }
  }

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  a{color:#0f766e}
  .up{color:#15803d;font-size:12px;font-weight:600}
  .down{color:#b91c1c;font-size:12px;font-weight:600}
  .flat{color:#888;font-size:12px}
  details summary{cursor:pointer;color:#0f766e;font-weight:600}
</style></head>
<body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;max-width:640px;margin:auto;padding:8px 16px">

  <h1 style="color:#0f766e;font-size:22px;margin-bottom:2px">Como foi a semana do site</h1>
  <p style="color:#666;margin-top:0;font-size:14px">Consultório Salustiano, ${periodLabelNatural(when)}</p>

  <p style="font-size:16px;line-height:1.5">
    Nesta semana, <b>${plural(leads, 'pessoa', 'pessoas')} ${Number(leads) === 1 ? 'clicou' : 'clicaram'} para falar no WhatsApp</b> a partir do site.
    ${s.messagesSent > 0 && s.messagesSent < leads
      ? `Ao todo, <b>${plural(s.messagesSent, 'pessoa', 'pessoas')} ${Number(s.messagesSent) === 1 ? 'abriu' : 'abriram'} a conversa</b>.`
      : s.messagesSent > 0
        ? `O site também registrou <b>${plural(s.messagesSent, 'conversa aberta', 'conversas abertas')}</b>.`
        : ''}
  </p>

  <table style="border-collapse:collapse;background:#f0fdfa;border-radius:8px;width:100%;margin-top:12px">
    <tr>
      ${kpi('Pessoas que chamaram no WhatsApp', withTrend(leads, prev.whatsappClicks), 'tocaram no botão do WhatsApp')}
      ${kpi('Conversas abertas', withTrend(s.messagesSent, prev.messagesSent), 'saíram do site para o WhatsApp')}
    </tr>
    <tr>
      ${kpi('Visitas à página', withTrend(s.pageViews, prev.pageViews), '')}
      ${kpi('Taxa de clique', s.engagementRate + '%', 'de cada 100 visitas, quantas chamam no WhatsApp')}
    </tr>
  </table>

  ${noticeHtml}

  <h3 style="margin-bottom:6px">De onde veio o contato</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${sourceRows}</table>

  ${googleBlock}

  <details style="margin-top:20px;border-top:1px solid #eee;padding-top:10px">
    <summary>Ver detalhes técnicos</summary>
    <ul style="font-size:13px;color:#444;line-height:1.6">${details.join('')}</ul>
    <p style="font-size:12px;color:#888">Para o relatório completo, rode <code>npm run access-logs</code>.
    Os custos de anúncios não entram neste email.</p>
  </details>

  <p style="color:#aaa;font-size:11px;margin-top:24px">
    A contagem vem do próprio site, então não é afetada por bloqueadores de anúncio. Acessos de teste ficam de fora.
  </p>
</body></html>`;
}

module.exports = {
  NOTICE_MIN_BASE,
  NOTICE_DROP_PCT,
  NOTICE_ZERO,
  fmt,
  plural,
  friendlySource,
  friendlyButton,
  friendlyGA4Source,
  withTrend,
  withTrendText,
  buildNotices,
  periodLabel,
  periodLabelNatural,
  renderText,
  renderHtml
};
