// scripts/lib/product-report-copy.pt.js
//
// PT-BR surfaces for the monthly product email. Same rule as the weekly copy
// module: every Portuguese string the owner reads lives here, and logic must NOT
// move in — only copy. `npm run lang:check` treats this file as an allowed
// surface (email) and the report script itself as English.

function fmt(n) { return Number(n).toLocaleString('pt-BR'); }

function plural(n, singular, pluralForm) {
  return `${fmt(n)} ${Number(n) === 1 ? singular : pluralForm}`;
}

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

function periodLabel(when) {
  return `Mês encerrado em ${when.split(',')[0]}`;
}

function renderText(p, when) {
  const L = [];
  L.push('COMPORTAMENTO NO SITE (MÊS) | Consultório Salustiano');
  L.push(periodLabel(when));
  L.push('');
  L.push('Uma leitura sobre COMO as pessoas usam o site. Não é sobre quantos clientes vieram (isso fica no email semanal).');
  L.push('');

  L.push('ATÉ ONDE AS PESSOAS ROLAM A PÁGINA');
  if (p.total.pageViews === 0) {
    L.push('- Sem dados de visualização no período.');
  } else {
    for (const depth of ['25', '50', '75', '100']) {
      const d = p.scroll[depth];
      L.push(`- Chegaram a ${depth}% da página: ${plural(d.count, 'visita', 'visitas')} (${d.pct}%)`);
    }
  }
  L.push('');

  if (Object.keys(p.buttons).length) {
    L.push('ONDE AS PESSOAS TOCAM NO WHATSAPP');
    Object.entries(p.buttons)
      .sort((a, b) => b[1] - a[1])
      .forEach(([b, n]) => L.push(`- ${friendlyButton(b)}: ${plural(n, 'toque', 'toques')}`));
    L.push('');
  }

  L.push('DE ONDE VEM A ATENÇÃO');
  Object.entries(p.sources)
    .sort((a, b) => b[1] - a[1])
    .forEach(([src, n]) => L.push(`- ${friendlySource(src)}: ${plural(n, 'visita', 'visitas')}`));
  L.push('');

  L.push('COMO USAR ISTO');
  L.push('- Pouca gente passando de 50%? O conteúdo/CTA importante pode estar baixo demais.');
  L.push('- Muitos toques no botão flutuante? Ele está funcionando como CTA principal.');
  L.push('- Isto orienta onde mexer na página. Resultado de conversão, veja no email semanal.');
  return L.join('\n');
}

function renderHtml(p, when) {
  const bar = (label, pct) => {
    const width = Math.max(2, Math.min(100, pct));
    return `
    <tr>
      <td style="padding:6px 8px 6px 0;white-space:nowrap;font-size:13px;color:#555">${label}</td>
      <td style="width:100%;padding:6px 0">
        <div style="background:#e5e7eb;border-radius:4px;height:16px;position:relative">
          <div style="background:#0f766e;width:${width}%;height:16px;border-radius:4px"></div>
        </div>
      </td>
      <td style="padding:6px 0 6px 8px;text-align:right;font-size:13px;font-weight:600;color:#0f766e;white-space:nowrap">${pct}%</td>
    </tr>`;
  };

  const scrollRows = p.total.pageViews === 0
    ? '<p style="color:#666">Sem dados de visualização no período.</p>'
    : `<table style="border-collapse:collapse;width:100%">
        ${bar('25%', p.scroll['25'].pct)}
        ${bar('50%', p.scroll['50'].pct)}
        ${bar('75%', p.scroll['75'].pct)}
        ${bar('100%', p.scroll['100'].pct)}
      </table>`;

  const buttonRows = Object.entries(p.buttons)
    .sort((a, b) => b[1] - a[1])
    .map(([b, n]) => `<tr><td style="padding:4px 0">${friendlyButton(b)}</td><td style="text-align:right;padding-left:12px"><b>${fmt(n)}</b></td></tr>`)
    .join('');

  const sourceRows = Object.entries(p.sources)
    .sort((a, b) => b[1] - a[1])
    .map(([src, n]) => `<tr><td style="padding:4px 0">${friendlySource(src)}</td><td style="text-align:right;padding-left:12px"><b>${fmt(n)}</b></td></tr>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;max-width:640px;margin:auto;padding:8px 16px">

  <h1 style="color:#0f766e;font-size:22px;margin-bottom:2px">Como as pessoas usam o site</h1>
  <p style="color:#666;margin-top:0;font-size:14px">Consultório Salustiano, ${periodLabel(when).toLowerCase()}</p>

  <p style="font-size:15px;line-height:1.5;color:#444">
    Uma leitura sobre <b>como</b> as pessoas navegam a página. Não é sobre quantos contatos chegaram
    (isso fica no relatório semanal de contatos).
  </p>

  <h3 style="margin-bottom:6px">Até onde as pessoas rolam a página</h3>
  ${scrollRows}

  ${buttonRows ? `<h3 style="margin-bottom:6px">Onde tocam no WhatsApp</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${buttonRows}</table>` : ''}

  ${sourceRows ? `<h3 style="margin-bottom:6px">De onde vem a atenção</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${sourceRows}</table>` : ''}

  <div style="background:#f0fdfa;padding:12px 16px;border-radius:6px;margin:16px 0;font-size:13px;color:#334155">
    <b>Como usar isto:</b> pouca gente passando de 50% sugere que o conteúdo ou o botão importante
    estão baixos demais. Muitos toques no botão flutuante indicam que ele virou o CTA principal.
    Isto orienta <i>onde mexer na página</i>; o resultado em contatos fica no email semanal.
  </div>

  <p style="color:#aaa;font-size:11px;margin-top:24px">
    Contagem do próprio site, não afetada por bloqueadores de anúncio. Acessos de teste ficam de fora.
  </p>
</body></html>`;
}

module.exports = { renderText, renderHtml };
