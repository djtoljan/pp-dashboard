const fs = require('fs');
const path = require('path');

const FILES = [
  { f: 'data.json', label: 'Main' },
  { f: 'data_konstantin.json', label: 'Константин' },
  { f: 'data_molodezh.json', label: 'Молодёжь' },
  { f: 'data_dvizhenie78.json', label: 'Движение 78' },
  { f: 'data_flowers.json', label: 'Цветы' },
];

const COLOR_MAP = {
  'FF92D050': 'green', 'FFFFFF00': 'yellow', 'FFFFFC00': 'yellow',
  'FFFF0000': 'red', 'FF4FC3F7': 'blue', 'FFFFFFFF': 'white',
  'FF00B050': 'green', 'FFE2EFDA': 'white',
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function ts() {
  return new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}

function readData(fn) {
  try {
    if (!fs.existsSync(fn)) return [];
    const p = JSON.parse(fs.readFileSync(fn, 'utf8'));
    return Array.isArray(p) ? p : (p.rows || []);
  } catch { return []; }
}

function getColor(hex) {
  const c = COLOR_MAP[(hex || '').toUpperCase()];
  return c || 'white';
}

function getClient(r) {
  return r.clientName || r.extra || r.client || '';
}

function gv(r, f) {
  const x = r[f];
  return (x === null || x === undefined) ? '' : String(x);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n) {
  const v = parseFloat(n);
  if (isNaN(v)) return n;
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const EMOJI = { red: '🔴', blue: '🔵', white: '⬜', yellow: '🟡', green: '🟢' };
const BAR_COLORS = { green: '#92D050', yellow: '#FFD700', red: '#e74c3c', blue: '#4FC3F7', white: '#ccc' };

function build() {
  const td = today();
  const todayRows = [];
  const pendingYellow = [];
  const pendingRed = [];
  const pendingNoCompany = [];
  let total = 0, green = 0, yellow = 0, blue = 0, white = 0, red = 0;
  const companyCount = {};
  const currencyCount = {};
  const groupStats = {};
  let totalUsdtSent = 0, totalUsdtRecv = 0, totalRubRecv = 0, totalRubWith = 0;
  let totalVdx = 0, withoutCalc = 0, companies = new Set();
  const volumes = {};

  for (const f of FILES) {
    const rows = readData(path.join(__dirname, f.f));
    for (const r of rows) {
      const col = getColor(r.color);
      total++;
      if (col === 'green') green++;
      else if (col === 'yellow') yellow++;
      else if (col === 'blue') blue++;
      else if (col === 'white') white++;
      else if (col === 'red') red++;

      const company = gv(r, 'company');
      const cur = gv(r, 'currency');
      const cf = gv(r, 'costFormula');
      const rb = gv(r, 'rubles_received');
      const sv = gv(r, 'sent_rubles_vdx');

      if (company) { companyCount[company.toUpperCase()] = (companyCount[company.toUpperCase()] || 0) + 1; companies.add(company.toUpperCase()); }
      if (cur) currencyCount[cur] = (currencyCount[cur] || 0) + 1;
      const grp = f.label;
      groupStats[grp] = (groupStats[grp] || 0) + 1;
      if (r.received_usdt) totalUsdtRecv += parseFloat(r.received_usdt) || 0;
      if (r.sent_usdt) totalUsdtSent += parseFloat(r.sent_usdt) || 0;
      if (rb) {
        const parts = String(rb).split('/');
        parts.forEach(p => { totalRubRecv += parseFloat(p) || 0; });
        totalRubWith++;
      }
      if (sv) totalVdx++;
      if (!cf) withoutCalc++;

      // Volume tracking
      const amount = parseFloat(r.sent_usdt || r.received_usdt || r.sum || 0);
      if (company && amount > 0) {
        volumes[company.toUpperCase()] = (volumes[company.toUpperCase()] || 0) + amount;
      }

      // Date
      const dt = gv(r, 'date');
      const client = getClient(r);
      const sum = gv(r, 'sum');

      const entry = { date: dt, sum, cur, company, client, color: col, group: grp, formula: cf, rubles: rb, sentVdx: sv, usdtIn: gv(r, 'received_usdt'), usdtOut: gv(r, 'sent_usdt') };

      if (dt === td) { todayRows.push(entry); continue; }
      if (!dt) continue;

      const hasCompany = !!company;
      const hasFormula = !!cf;

      if (col === 'yellow') pendingYellow.push(entry);
      else if (col === 'white' && hasCompany && hasFormula) pendingRed.push(entry);
      else if (col === 'red' && hasCompany && hasFormula) pendingRed.push(entry);
      else if (col === 'red' && !hasCompany) pendingNoCompany.push(entry);
    }
  }

  const sortD = (a, b) => {
    if (!a.date) return 1; if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  };
  todayRows.sort(sortD);
  pendingYellow.sort(sortD);
  pendingRed.sort(sortD);
  pendingNoCompany.sort(sortD);

  const topCompanies = Object.entries(companyCount).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const currencies = Object.entries(currencyCount).sort((a, b) => b[1] - a[1]);
  const groups = Object.entries(groupStats).sort((a, b) => b[1] - a[1]);
  const byVolume = Object.entries(volumes).sort((a, b) => b[1] - a[1]).slice(0, 12);

  return {
    stats: { total, green, yellow, blue, white, red, today: todayRows.length,
      pending: pendingYellow.length + pendingRed.length + pendingNoCompany.length,
      usdtSent: Math.round(totalUsdtSent), usdtRecv: Math.round(totalUsdtRecv),
      rubRecv: Math.round(totalRubRecv), rubWith: totalRubWith,
      vdx: totalVdx, withoutCalc, companies: companies.size },
    todayRows, pendingYellow, pendingRed, pendingNoCompany,
    topCompanies, currencies, groups, byVolume
  };
}

function render(d) {
  const { stats, todayRows, pendingYellow, pendingRed, pendingNoCompany, topCompanies, currencies, groups, byVolume } = d;
  const N = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  const CSS = `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', -apple-system, sans-serif; background: #f5f5f5; color: #333; padding: 24px; }
h1 { font-size: 24px; margin-bottom: 2px; color: #1a1a2e; }
.ts { color: #888; font-size: 13px; margin-bottom: 20px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 20px; }
.card { background: #fff; border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.card .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #888; margin-bottom: 2px; }
.card .val { font-size: 22px; font-weight: 700; color: #1a1a2e; }
.card .sub { font-size: 11px; color: #888; margin-top: 2px; }
.card.card-green { border-left: 4px solid #92D050; }
.card.card-red { border-left: 4px solid #e74c3c; }
.card.card-blue { border-left: 4px solid #4FC3F7; }
.card.card-yellow { border-left: 4px solid #FFD700; }
.card.card-dark { border-left: 4px solid #1a1a2e; }
h2 { font-size: 16px; margin: 18px 0 8px; color: #1a1a2e; }
h2 span { font-weight: 400; color: #888; font-size: 13px; }
h3 { font-size: 13px; margin: 10px 0 6px; color: #555; font-weight: 500; }
.dual { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
@media (max-width: 700px) { .dual { grid-template-columns: 1fr; } }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 16px; }
th { background: #f0f0f5; text-align: left; padding: 7px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; font-weight: 600; white-space: nowrap; }
td { padding: 7px 10px; border-top: 1px solid #eee; font-size: 13px; }
tr:hover td { background: #fafafa; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.n { font-family: 'Consolas', monospace; white-space: nowrap; text-align: right; }
.sm { font-size: 11px; color: #999; }
.ta { text-align: center; }
.bar-track { height: 6px; background: #eee; border-radius: 3px; overflow: hidden; min-width: 60px; display: inline-block; vertical-align: middle; }
.bar-fill { height: 100%; border-radius: 3px; }
.footer { text-align: center; color: #aaa; font-size: 11px; margin-top: 20px; padding-top: 12px; border-top: 1px solid #eee; }
.empty { text-align: center; padding: 30px; color: #999; font-size: 14px; }`;

  let h = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>ПП-дашборд</title>
<style>${CSS}</style>
</head>
<body>
<h1>📊 ПП-дашборд</h1>
<div class="ts">🔄 ${ts()} МСК · ${stats.total} строк · ${stats.companies} компаний · ${stats.today} сегодня</div>

<div class="grid">
  <div class="card card-dark"><div class="lbl">Всего строк</div><div class="val">${stats.total}</div><div class="sub">${stats.today} сегодня</div></div>
  <div class="card card-green"><div class="lbl">🟢 Выполнено</div><div class="val">${stats.green}</div><div class="sub">${Math.round(stats.green/stats.total*100)}%</div></div>
  <div class="card card-yellow"><div class="lbl">🟡 Подвешено</div><div class="val">${stats.yellow}</div><div class="sub">ждут зелёнку</div></div>
  <div class="card card-red"><div class="lbl">🔴 Красных</div><div class="val">${stats.red}</div><div class="sub">${stats.pending} в работе</div></div>
  <div class="card card-blue"><div class="lbl">🔵 Голубых</div><div class="val">${stats.blue}</div><div class="sub">только рубли</div></div>
  <div class="card card-dark"><div class="lbl">⬜ В работе</div><div class="val">${stats.white}</div><div class="sub">белые</div></div>
  <div class="card card-green"><div class="lbl">USDT отправлено</div><div class="val">${N(stats.usdtSent)}</div><div class="sub">всего</div></div>
  <div class="card card-blue"><div class="lbl">USDT получено</div><div class="val">${N(stats.usdtRecv)}</div><div class="sub">всего</div></div>
  <div class="card card-dark"><div class="lbl">₽ Пришло рублей</div><div class="val">${N(stats.rubRecv)}</div><div class="sub">${stats.rubWith} строк</div></div>
  <div class="card card-dark"><div class="lbl">На VDX</div><div class="val">${stats.vdx}</div><div class="sub">строк отправлено</div></div>
  <div class="card card-dark"><div class="lbl">Без расчёта</div><div class="val">${stats.withoutCalc}</div><div class="sub">из ${stats.total}</div></div>
  <div class="card card-dark"><div class="lbl">Компаний</div><div class="val">${stats.companies}</div><div class="sub">уникальных</div></div>
</div>`;

  // Today
  h += `<h2>📋 Сегодня <span>${todayRows.length}</span></h2>`;
  if (todayRows.length === 0) {
    h += `<div class="empty">🌙 Сегодня сделок нет</div>`;
  } else {
    h += `<table><thead><tr><th>Статус</th><th>Дата</th><th>Сумма</th><th>Вал</th><th>Клиент</th><th>Компания</th><th>Группа</th></tr></thead><tbody>`;
    for (const r of todayRows) {
      const bc = BAR_COLORS[r.color] || '#ccc';
      h += `<tr><td><span class="dot" style="background:${bc}"></span>${EMOJI[r.color]||'⬜'}</td><td>${esc(r.date)}</td><td class="n">${r.sum ? N(r.sum) : '-'}</td><td>${esc(r.cur)}</td><td>${esc(r.client||'-')}</td><td class="sm">${esc(r.company||'-')}</td><td class="sm">${r.group}</td></tr>`;
    }
    h += `</tbody></table>`;
  }

  // Pending
  const allPending = [...pendingRed, ...pendingNoCompany, ...pendingYellow];
  if (allPending.length > 0) {
    h += `<h2>⚠️ В работе <span>${allPending.length}</span></h2><table><thead><tr><th>Статус</th><th>Дата</th><th>Сумма</th><th>Вал</th><th>Клиент</th><th>Компания</th><th>Группа</th></tr></thead><tbody>`;
    for (const r of allPending.slice(0, 30)) {
      let lbl, bc;
      if (pendingRed.includes(r)) { lbl = '🔴 ждёт ПП'; bc = '#e74c3c'; }
      else if (pendingNoCompany.includes(r)) { lbl = '⚪ без заявки'; bc = '#ccc'; }
      else { lbl = '🟡 ждёт зелёнку'; bc = '#FFD700'; }
      h += `<tr><td><span class="dot" style="background:${bc}"></span>${lbl}</td><td>${esc(r.date)}</td><td class="n">${r.sum ? N(r.sum) : '-'}</td><td>${esc(r.cur)}</td><td>${esc(r.client||'-')}</td><td class="sm">${esc(r.company||'-')}</td><td class="sm">${r.group}</td></tr>`;
    }
    if (allPending.length > 30) h += `<tr><td colspan="7" class="ta sm">... и ещё ${allPending.length - 30} строк</td></tr>`;
    h += `</tbody></table>`;
  }

  // Charts
  h += `<div class="dual">`;
  h += `<div><h2>🏢 Топ компаний</h2><table><thead><tr><th>#</th><th>Компания</th><th>Строк</th><th>%</th></tr></thead><tbody>`;
  const maxC = topCompanies.length > 0 ? topCompanies[0][1] : 1;
  for (const [i, [nm, cnt]] of topCompanies.entries()) {
    const pct = (cnt / stats.total * 100).toFixed(1);
    const bw = (cnt / maxC * 100).toFixed();
    h += `<tr><td>${i+1}</td><td><strong>${esc(nm)}</strong></td><td>${cnt}</td><td>${pct}% <span class="bar-track"><span class="bar-fill" style="width:${bw}%;background:#4FC3F7"></span></span></td></tr>`;
  }
  h += `</tbody></table></div>`;

  h += `<div><h2>💱 Валюты</h2><table><thead><tr><th>Валюта</th><th>Строк</th></tr></thead><tbody>`;
  const maxCur = currencies.length > 0 ? currencies[0][1] : 1;
  for (const [cur, cnt] of currencies) {
    const bw = (cnt / maxCur * 100).toFixed();
    h += `<tr><td><strong>${esc(cur)}</strong></td><td>${cnt} <span class="bar-track"><span class="bar-fill" style="width:${bw}%;background:#92D050"></span></span></td></tr>`;
  }
  h += `</tbody></table></div>`;
  h += `</div>`;

  h += `<div class="dual">`;
  h += `<div><h2>💰 Топ по объёму (USDT)</h2><table><thead><tr><th>#</th><th>Компания</th><th>Объём</th></tr></thead><tbody>`;
  const maxV = byVolume.length > 0 ? byVolume[0][1] : 1;
  for (const [i, [nm, amt]] of byVolume.entries()) {
    const bw = (amt / maxV * 100).toFixed();
    h += `<tr><td>${i+1}</td><td><strong>${esc(nm)}</strong></td><td class="n">${N(Math.round(amt))} <span class="bar-track"><span class="bar-fill" style="width:${bw}%;background:#a78bfa"></span></span></td></tr>`;
  }
  h += `</tbody></table></div>`;

  h += `<div><h2>👥 Группы клиентов</h2><table><thead><tr><th>Группа</th><th>Строк</th><th>%</th></tr></thead><tbody>`;
  const maxG = groups.length > 0 ? groups[0][1] : 1;
  for (const [grp, cnt] of groups) {
    const pct = (cnt / stats.total * 100).toFixed(1);
    const bw = (cnt / maxG * 100).toFixed();
    h += `<tr><td>${esc(grp)}</td><td>${cnt}</td><td>${pct}% <span class="bar-track"><span class="bar-fill" style="width:${bw}%;background:#4FC3F7"></span></span></td></tr>`;
  }
  h += `</tbody></table></div>`;
  h += `</div>`;

  h += `<div class="footer">ПП-дашборд · ${stats.total} сделок · ${stats.green} 🟢 · ${ts()} МСК</div></body></html>`;
  return h;
}

const data = build();
const html = render(data);
const out = path.join(__dirname, 'index.html');
fs.writeFileSync(out, html, 'utf8');
const s = data.stats;
console.log(`✅ ${s.total} строк · ${s.today} сегодня · ${s.green} 🟢 · ${s.yellow} 🟡 · ${s.red} 🔴 · ${s.blue} 🔵 · ${s.white} ⬜`);
