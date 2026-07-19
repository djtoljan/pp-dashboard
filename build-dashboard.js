const fs = require('fs');
const path = require('path');

const DATA_FILES = [
  { file: 'data.json', label: 'Main' },
  { file: 'data_konstantin.json', label: 'ÐšÐ¾Ð½ÑÑ‚Ð°Ð½Ñ‚Ð¸Ð½' },
  { file: 'data_molodezh.json', label: 'ÐœÐ¾Ð»Ð¾Ð´Ñ‘Ð¶ÑŒ' },
  { file: 'data_dvizhenie78.json', label: 'Ð”Ð²Ð¸Ð¶ÐµÐ½Ð¸Ðµ 78' },
  { file: 'data_flowers.json', label: 'Ð¦Ð²ÐµÑ‚Ñ‹' },
];

const COLOR_MAP = {
  'FF92D050': 'green', 'FFFFFF00': 'yellow', 'FFFFFC00': 'yellow',
  'FFFF0000': 'red', 'FF4FC3F7': 'blue', 'FFFFFFFF': 'white',
  'FF00B050': 'green', 'FFE2EFDA': 'white',
};

function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
    return [];
  } catch (e) { return []; }
}

function mapColor(hex) { return COLOR_MAP[(hex||'').toUpperCase()] || 'white'; }
function getClient(row) { return row.clientName || row.extra || row.client || ''; }
function val(row, f) { const v = row[f]; return (v === null || v === undefined) ? '' : String(v); }

function buildDashboard() {
  const today = todayStr();
  const todayDeals = [];
  const pastDueGreen = [];    // â–¶Å‚ waiting for green
  const pastDuePP = [];       // Ã¼Å waiting for PP
  const pastDueNoCompany = []; // Ã­Å no company
  let totalRows = 0, totalGreen = 0;

  for (const df of DATA_FILES) {
    const rows = readJSON(path.join(__dirname, df.file));
    if (!rows.length) continue;
    totalRows += rows.length;

    for (const row of rows) {
      const color = mapColor(row.color);
      const date = val(row, 'date');
      const client = getClient(row);
      const company = val(row, 'company');
      const sum = val(row, 'sum');
      const sumF = sum ? Number(sum).toLocaleString('ru-RU') : '';
      const currency = val(row, 'currency');
      const costFormula = val(row, 'costFormula');
      const rub = val(row, 'rubles_received');
      const srv = val(row, 'sent_rubles_vdx');
      const usdtIn = val(row, 'received_usdt');
      const usdtOut = val(row, 'sent_usdt');
      const exch = val(row, 'exchange_to');
      const hasCompany = !!(company);
      const hasCost = !!(costFormula);

      if (color === 'green') totalGreen++;

      const entry = { date, client, company, sum: sumF, currency, rub, srv, usdtIn, usdtOut, exch, costFormula, table: df.label, color };

      if (date === today) {
        todayDeals.push(entry);
        continue;
      }

      if (!date) continue;

      if (color === 'red' && !hasCompany) {
        pastDueNoCompany.push(entry);
      } else if (color === 'yellow') {
        pastDueGreen.push(entry);
      } else if (color === 'white' && hasCompany && hasCost) {
        pastDuePP.push(entry);
      } else if (color === 'red' && hasCompany && hasCost) {
        pastDuePP.push(entry);
      }
    }
  }

  const sortAsc = (a,b) => {
    const p = (d) => { if (!d) return 0; const x = d.split('.'); return new Date(x[2],x[1]-1,x[0]); };
    return p(a.date) - p(b.date);
  };
  todayDeals.sort((a,b) => { const p = (d) => { if (!d) return 0; const x = d.split('.'); return new Date(x[2],x[1]-1,x[0]); }; return p(b.date) - p(a.date); });
  pastDueGreen.sort(sortAsc);
  pastDuePP.sort(sortAsc);
  pastDueNoCompany.sort(sortAsc);

  return { today, todayDeals, pastDueGreen, pastDuePP, pastDueNoCompany, totalRows, totalGreen };
}

function renderHTML(data) {
  const { today, todayDeals, pastDueGreen, pastDuePP, pastDueNoCompany, totalRows, totalGreen } = data;
  const totalActive = totalRows - totalGreen;
  const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function todayRow(d) {
    const ri = [];
    if (d.rub) ri.push(`ðŸ’° +${esc(d.rub)} â‚½`);
    if (d.srv) ri.push(`ðŸ“¤ â†’${esc(d.exch||'VDX')}: ${esc(d.srv)} â‚½`);
    if (d.usdtIn) ri.push(`ðŸª™ +${esc(d.usdtIn)} USDT`);
    if (d.usdtOut) ri.push(`ðŸ“¤ -${esc(d.usdtOut)} USDT`);
    const rs = ri.length ? ri.join('<br>') : '-';
    const em = { red:'ðŸ”´',blue:'ðŸ”µ',white:'â¬œ',yellow:'ðŸŸ¡',green:'ðŸŸ¢' }[d.color] || 'â¬œ';
    return `<tr><td>${esc(d.date)}</td><td class="n">${d.sum||''}</td><td>${esc(d.currency)}</td><td class="c">${esc(d.client||'-')}</td><td class="co">${esc(d.company||'-')}</td><td class="r">${rs}</td><td class="st">${em}</td></tr>`;
  }

  function dealsTable(deals, emoji) {
    return `<table><thead><tr><th>Ð”Ð°Ñ‚Ð°</th><th>Ð¡ÑƒÐ¼Ð¼Ð°</th><th>Ð’Ð°Ð»</th><th>ÐšÐ»Ð¸ÐµÐ½Ñ‚</th><th>ÐšÐ¾Ð¼Ð¿Ð°Ð½Ð¸Ñ</th><th>Ð¡Ñ‚Ð°Ñ‚ÑƒÑ</th></tr></thead><tbody>${
      deals.map(d => `<tr class="r-${d.color}"><td>${esc(d.date)}</td><td class="n">${d.sum||''}</td><td>${esc(d.currency)}</td><td class="c">${esc(d.client||'-')}</td><td class="co">${esc(d.company||'-')}</td><td class="sc"><span class="sb">${emoji}</span></td></tr>`).join('')
    }</tbody></table>`;
  }

  function section(title, emoji, deals, emptyText) {
    return `<h2>${title} <span class="t">${deals.length}</span></h2>${
      deals.length ? dealsTable(deals, emoji)
      : `<div class="e"><div class="ee">âœ…</div><div>${emptyText}</div></div>`
    }`;
  }

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PP-ÃÂ´ÃÂ°Ã‘Ë†ÃÂ±ÃÂ¾Ã‘â‚¬ÃÂ´ | ${today}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;color:#e6edf3;padding:16px}
.c{max-width:1440px;margin:0 auto}
h1{font-size:22px;color:#58a6ff;display:inline}
.m{color:#8b949e;font-size:13px}
.hd{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:24px}
.ts{color:#484f58;font-size:12px}
.sg{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:24px}
.s{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px 16px}
.s .v{font-size:26px;font-weight:700}
.s .l{color:#8b949e;font-size:11px;text-transform:uppercase;margin-top:2px}
.s.t .v{color:#58a6ff}.s.g .v{color:#3fb950}.s.a .v{color:#d29922}.s.p .v{color:#f85149}.s.nc .v{color:#8b949e}
h2{font-size:17px;margin:24px 0 10px;color:#f0f6fc;display:flex;align-items:center;gap:8px}
h2 .t{background:#21262d;color:#8b949e;font-size:11px;padding:2px 10px;border-radius:10px}
.n{color:#8b949e;font-size:13px;margin-bottom:10px}
table{width:100%;border-collapse:collapse;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden;margin-bottom:4px}
th{background:#21262d;padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#8b949e;border-bottom:1px solid #30363d;white-space:nowrap}
td{padding:9px 10px;border-bottom:1px solid #21262d;font-size:13px;vertical-align:middle}
tr:last-child td{border-bottom:none}
.r-r{border-left:3px solid #f85149}.r-b{border-left:3px solid #58a6ff}.r-w{border-left:3px solid #8b949e}.r-y{border-left:3px solid #d29922}.r-g{border-left:3px solid #3fb950}
.n{font-family:'JetBrains Mono',monospace;white-space:nowrap;text-align:right;font-size:13px}
.c{font-weight:500;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.co{color:#8b949e;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.r{font-size:12px;color:#8b949e;white-space:nowrap}
.st{font-size:18px;text-align:center}
.sc{text-align:center}.sb{display:inline-block;font-size:28px;line-height:1}
.e{text-align:center;padding:32px;color:#8b949e;background:#161b22;border:1px solid #30363d;border-radius:8px}
.ee{font-size:28px;margin-bottom:6px}
.ft{margin-top:40px;text-align:center;color:#484f58;font-size:12px}
tr:hover td{background:#1c2128}
</style>
</head>
<body>
<div class="c">
<div class="hd">
<div><h1>ðŸ“Š ÃÅ¸ÃÅ¸-ÃÂ´ÃÂ°Ã‘Ë†ÃÂ±ÃÂ¾Ã‘â‚¬ÃÂ´</h1><div class="m">ÃÅ“ÃÂ¾ÃÂ½ÃÂ¸Ã‘â€šÃÂ¾Ã‘â‚¬ÃÂ¸ÃÂ½ÃÂ³ ÃÂ¿ÃÂ»ÃÂ°Ã‘â€šÃÂµÃÂ¶ÃÂµÃÂ¹ â€¢ ÃÂ¾ÃÂ±ÃÂ½ÃÂ¾ÃÂ²ÃÂ»ÃÂµÃÂ½ÃÂ¸ÃÂµ ÃÂºÃÂ°ÃÂ¶ÃÂ´Ã‘â€¹ÃÂµ 30 ÃÂ¼ÃÂ¸ÃÂ½</div></div>
<div class="ts">ðŸ”„ ${now} ÃÅ“ÃÂ¡ÃÅ¡</div>
</div>

<div class="sg">
<div class="s t"><div class="v">${todayDeals.length}</div><div class="l">ðŸ“‹ ÃÂ¡ÃÂµÃÂ³ÃÂ¾ÃÂ´ÃÂ½Ã‘Â</div></div>
<div class="s g"><div class="v">${totalGreen}</div><div class="l">âœ… ÃËœÃ‘ÂÃÂ¿ÃÂ¾ÃÂ»ÃÂ½ÃÂµÃÂ½ÃÂ¾</div></div>
<div class="s a"><div class="v">${pastDueGreen.length}</div><div class="l">ðŸŸ¡ Ãâ€“ÃÂ´Ã‘Æ’Ã‘â€š ÃÂ·ÃÂµÃÂ»Ã‘â€˜ÃÂ½ÃÂºÃ‘Æ’</div></div>
<div class="s p"><div class="v">${pastDuePP.length}</div><div class="l">ðŸ”´ Ãâ€“ÃÂ´Ã‘Æ’Ã‘â€š ÃÅ¸ÃÅ¸</div></div>
<div class="s nc"><div class="v">${pastDueNoCompany.length}</div><div class="l">âšª Ãâ€˜ÃÂµÃÂ· ÃÂ·ÃÂ°Ã‘ÂÃÂ²ÃÂºÃÂ¸</div></div>
</div>

${section('ðŸ“‹ ÃÂ¡ÃÂ´ÃÂµÃÂ»ÃÂºÃÂ¸ ÃÂ·ÃÂ° Ã‘ÂÃÂµÃÂ³ÃÂ¾ÃÂ´ÃÂ½Ã‘Â', '', todayDeals, 'ðŸŒ™ ÃÂ¡ÃÂµÃÂ³ÃÂ¾ÃÂ´ÃÂ½Ã‘Â Ã‘ÂÃÂ´ÃÂµÃÂ»ÃÂ¾ÃÂº ÃÂ½ÃÂµÃ‘â€š')}

<h2>âš ï¸ ÃÂ¡ÃÂ´ÃÂµÃÂ»ÃÂºÃÂ¸ ÃÂ¿Ã‘â‚¬ÃÂ¾Ã‘Ë†ÃÂ»Ã‘â€¹Ã‘â€¦ ÃÂ´ÃÂ½ÃÂµÃÂ¹ <span class="t">${pastDueGreen.length + pastDuePP.length + pastDueNoCompany.length}</span></h2>
<div class="n">ÃÂ¢Ã‘â‚¬ÃÂµÃÂ±Ã‘Æ’Ã‘Å½Ã‘â€š ÃÂ²ÃÂ½ÃÂ¸ÃÂ¼ÃÂ°ÃÂ½ÃÂ¸Ã‘Â ÃÂ¼ÃÂ°Ã‘â‚¬Ã‘Ë†Ã‘â‚¬Ã‘Æ’Ã‘â€šÃÂ¸ÃÂ·ÃÂ°Ã‘â€šÃÂ¾Ã‘â‚¬ÃÂ¾ÃÂ²</div>

${pastDueNoCompany.length ? `<h3 style="font-size:14px;margin:14px 0 8px;color:#e6edf3;display:flex;align-items:center;gap:6px"><span style="font-size:18px">âšª</span> ÃÅ¾ÃÂ¶ÃÂ¸ÃÂ´ÃÂ°Ã‘Å½Ã‘â€š ÃÂ·ÃÂ°Ã‘ÂÃÂ²ÃÂºÃ‘Æ’ (ÃÂ½ÃÂµÃ‘â€š ÃÂºÃÂ¾ÃÂ¼ÃÂ¿ÃÂ°ÃÂ½ÃÂ¸ÃÂ¸)</h3><table><thead><tr><th>Ð”Ð°Ñ‚Ð°</th><th>Ð¡ÑƒÐ¼Ð¼Ð°</th><th>Ð’Ð°Ð»</th><th>ÐšÐ»Ð¸ÐµÐ½Ñ‚</th><th>ÐšÐ¾Ð¼Ð¿Ð°Ð½Ð¸Ñ</th><th>Ð¡Ñ‚Ð°Ñ‚ÑƒÑ</th></tr></thead><tbody>${
  pastDueNoCompany.map(d => `<tr class="r-${d.color}"><td>${esc(d.date)}</td><td class="n">${d.sum||''}</td><td>${esc(d.currency)}</td><td class="c">${esc(d.client||'-')}</td><td class="co">${esc(d.company||'-')}</td><td class="sc"><span class="sb">âšª</span></td></tr>`).join('')
}</tbody></table>` : ''}

${pastDuePP.length ? `<h3 style="font-size:14px;margin:14px 0 8px;color:#e6edf3;display:flex;align-items:center;gap:6px"><span style="font-size:18px">ðŸ”´</span> ÃÅ¾Ã‘â€šÃ‘ÂÃ‘Æ’Ã‘â€šÃ‘ÂÃ‘â€šÃÂ²Ã‘Æ’ÃÂµÃ‘â€š ÃÂ¿ÃÂ¾ÃÂ´ÃÂ²ÃÂµÃ‘Ë†ÃÂµÃÂ½ÃÂ½ÃÂ°Ã‘Â ÃÅ¸ÃÅ¸</h3><table><thead><tr><th>Ð”Ð°Ñ‚Ð°</th><th>Ð¡ÑƒÐ¼Ð¼Ð°</th><th>Ð’Ð°Ð»</th><th>ÐšÐ»Ð¸ÐµÐ½Ñ‚</th><th>ÐšÐ¾Ð¼Ð¿Ð°Ð½Ð¸Ñ</th><th>Ð¡Ñ‚Ð°Ñ‚ÑƒÑ</th></tr></thead><tbody>${
  pastDuePP.map(d => `<tr class="r-${d.color}"><td>${esc(d.date)}</td><td class="n">${d.sum||''}</td><td>${esc(d.currency)}</td><td class="c">${esc(d.client||'-')}</td><td class="co">${esc(d.company||'-')}</td><td class="sc"><span class="sb">ðŸ”´</span></td></tr>`).join('')
}</tbody></table>` : ''}

${pastDueGreen.length ? `<h3 style="font-size:14px;margin:14px 0 8px;color:#e6edf3;display:flex;align-items:center;gap:6px"><span style="font-size:18px">ðŸŸ¡</span> ÃÅ¾Ã‘â€šÃ‘ÂÃ‘Æ’Ã‘â€šÃ‘ÂÃ‘â€šÃÂ²Ã‘Æ’ÃÂµÃ‘â€š ÃÂ·ÃÂµÃÂ»Ã‘â€˜ÃÂ½ÃÂºÃÂ°</h3><table><thead><tr><th>Ð”Ð°Ñ‚Ð°</th><th>Ð¡ÑƒÐ¼Ð¼Ð°</th><th>Ð’Ð°Ð»</th><th>ÐšÐ»Ð¸ÐµÐ½Ñ‚</th><th>ÐšÐ¾Ð¼Ð¿Ð°Ð½Ð¸Ñ</th><th>Ð¡Ñ‚Ð°Ñ‚ÑƒÑ</th></tr></thead><tbody>${
  pastDueGreen.map(d => `<tr class="r-${d.color}"><td>${esc(d.date)}</td><td class="n">${d.sum||''}</td><td>${esc(d.currency)}</td><td class="c">${esc(d.client||'-')}</td><td class="co">${esc(d.company||'-')}</td><td class="sc"><span class="sb">ðŸŸ¡</span></td></tr>`).join('')
}</tbody></table>` : ''}

${!pastDueGreen.length && !pastDuePP.length && !pastDueNoCompany.length ? `<div class="e"><div class="ee">âœ…</div><div>Ãâ€™Ã‘ÂÃÂµ Ã‘ÂÃÂ´ÃÂµÃÂ»ÃÂºÃÂ¸ ÃÂ² ÃÂ¿ÃÂ¾Ã‘â‚¬Ã‘ÂÃÂ´ÃÂºÃÂµ</div></div>` : ''}

<div class="ft">ðŸ“Š ÃÅ¸ÃÅ¸-ÃÂ´ÃÂ°Ã‘Ë†ÃÂ±ÃÂ¾Ã‘â‚¬ÃÂ´ â€¢ ${totalRows} Ã‘ÂÃÂ´ÃÂµÃÂ»ÃÂ¾ÃÂº ÃÂ² 5 Ã‘â€šÃÂ°ÃÂ±ÃÂ»ÃÂ¸Ã‘â€ ÃÂ°Ã‘â€¦ â€¢ ${totalGreen} âœ… ÃÂ¸Ã‘ÂÃÂ¿ÃÂ¾ÃÂ»ÃÂ½ÃÂµÃÂ½ÃÂ¾ â€¢ ÃÂÃÂ²Ã‘â€šÃÂ¾ÃÂ¾ÃÂ±ÃÂ½ÃÂ¾ÃÂ²ÃÂ»ÃÂµÃÂ½ÃÂ¸ÃÂµ ÃÂºÃÂ°ÃÂ¶ÃÂ´Ã‘â€¹ÃÂµ 30 ÃÂ¼ÃÂ¸ÃÂ½ (ÃÂ±Ã‘Æ’ÃÂ´ÃÂ½ÃÂ¸)</div>
</div>
</body>
</html>`;
}

const data = buildDashboard();
const html = renderHTML(data);
fs.writeFileSync(path.join(__dirname, 'index.html'), html, 'utf8');
console.log(`Today: ${data.todayDeals.length} | Green wait: ${data.pastDueGreen.length} | PP wait: ${data.pastDuePP.length} | No company: ${data.pastDueNoCompany.length} | Total rows: ${data.totalRows}`);