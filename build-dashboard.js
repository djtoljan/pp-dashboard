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
  return COLOR_MAP[(hex || '').toUpperCase()] || 'white';
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

function fmtNum(n) {
  const v = parseFloat(n);
  if (isNaN(v)) return n;
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const EMOJI = { red: '🔴', blue: '🔵', white: '⚪', yellow: '🟡', green: '🟢' };

function build() {
  const td = today();
  const todayRows = [];
  const pendingYellow = []; // 🟡 — ждут зелёнку
  const pendingRed = []; // 🔴/⬜ — ждут ПП
  const pendingNoCompany = []; // 🔴 без компании
  const allRows = [];
  let total = 0, green = 0, yellow = 0, blue = 0, white = 0, red = 0;
  const companyCount = {};
  const currencyCount = {};
  const groupStats = {};
  let totalUsdtSent = 0, totalUsdtRecv = 0, totalRubRecv = 0;

  for (const f of FILES) {
    const rows = readData(path.join(__dirname, f.f));
    for (const r of rows) {
      total++;
      const col = getColor(r.color);
      const dt = gv(r, 'date');
      const client = getClient(r);
      const company = gv(r, 'company');
      const sum = gv(r, 'sum');
      const cur = gv(r, 'currency');
      const cf = gv(r, 'costFormula');

      allRows.push({
        date: dt, sum, cur, company, client, color: col,
        group: f.label,
        rubles: gv(r, 'rubles_received'),
        sentVdx: gv(r, 'sent_rubles_vdx'),
        usdtIn: gv(r, 'received_usdt'),
        usdtOut: gv(r, 'sent_usdt'),
        formula: cf,
        notes: gv(r, 'notes'),
      });

      if (col === 'green') green++;
      else if (col === 'yellow') yellow++;
      else if (col === 'blue') blue++;
      else if (col === 'white') white++;
      else if (col === 'red') red++;

      if (company) {
        const k = company.toUpperCase();
        companyCount[k] = (companyCount[k] || 0) + 1;
      }

      if (cur) {
        currencyCount[cur] = (currencyCount[cur] || 0) + 1;
      }

      const grp = f.label;
      groupStats[grp] = (groupStats[grp] || 0) + 1;

      if (r.received_usdt) totalUsdtRecv += parseFloat(r.received_usdt) || 0;
      if (r.sent_usdt) totalUsdtSent += parseFloat(r.sent_usdt) || 0;
      if (r.rubles_received) {
        const parts = String(r.rubles_received).split('/');
        parts.forEach(p => { totalRubRecv += parseFloat(p) || 0; });
      }

      // Today logic
      if (dt === td) {
        todayRows.push(allRows[allRows.length - 1]);
        continue;
      }
      if (!dt) continue;

      // Pending logic
      const hasCompany = !!company;
      const hasFormula = !!cf;
      if (col === 'yellow') {
        pendingYellow.push(allRows[allRows.length - 1]);
      } else if (col === 'white' && hasCompany && hasFormula) {
        pendingRed.push(allRows[allRows.length - 1]);
      } else if (col === 'red' && hasCompany && hasFormula) {
        pendingRed.push(allRows[allRows.length - 1]);
      } else if (col === 'red' && !hasCompany) {
        pendingNoCompany.push(allRows[allRows.length - 1]);
      }
    }
  }

  // Sort
  const sortByDate = (a, b) => {
    if (!a.date) return 1; if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  };
  todayRows.sort((a, b) => b.date.localeCompare(a.date));
  pendingYellow.sort(sortByDate);
  pendingRed.sort(sortByDate);
  pendingNoCompany.sort(sortByDate);

  // Top companies
  const topCompanies = Object.entries(companyCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  // Currencies
  const currencies = Object.entries(currencyCount)
    .sort((a, b) => b[1] - a[1]);

  // Groups
  const groups = Object.entries(groupStats)
    .sort((a, b) => b[1] - a[1]);

  const stats = {
    total, green, yellow, blue, white, red,
    today: todayRows.length,
    pending: pendingYellow.length + pendingRed.length + pendingNoCompany.length,
    totalUsdtSent: Math.round(totalUsdtSent),
    totalUsdtRecv: Math.round(totalUsdtRecv),
    totalRubRecv: Math.round(totalRubRecv),
    withFormula: allRows.filter(r => r.formula).length,
    withoutFormula: allRows.filter(r => !r.formula).length,
  };

  return { stats, todayRows, pendingYellow, pendingRed, pendingNoCompany, topCompanies, currencies, groups };
}

function render(data) {
  const { stats, todayRows, pendingYellow, pendingRed, pendingNoCompany, topCompanies, currencies, groups } = data;

  const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  let html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ПП-дашборд</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', -apple-system, sans-serif; background: #f5f5f5; color: #333; padding: 24px; }
h1 { font-size: 24px; color: #1a1a2e; margin-bottom: 2px; }
.ts { color: #888; font-size: 13px; margin-bottom: 20px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 20px; }
.card { background: #fff; border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.card .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #888; margin-bottom: 2px; }
.card .val { font-size: 22px; font-weight: 700; color: #1a1a2e; }
.card .sub { font-size: 11px; color: #888; margin-top: 2px; }
.card.b-l-green { border-left: 3px solid #92D050; }
.card.b-l-red { border-left: 3px solid #e74c3c; }
.card.b-l-blue { border-left: 3px solid #4FC3F7; }
.card.b-l-yellow { border-left: 3px solid #FFD700; }
.card.b-l-dark { border-left: 3px solid #1a1a2e; }
.card.b-l-purple { border-left: 3px solid #a78bfa; }
h2 { font-size: 15px; color: #1a1a2e; margin: 18px 0 8px; }
h2 span { font-weight: 400; color: #888; font-size: 13px; }
.dual { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
@media (max-width: 700px) { .dual { grid-template-columns: 1fr; } }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 14px; }
th { background: #f0f0f5; text-align: left; padding: 7px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; font-weight: 600; white-space: nowrap; }
td { padding: 7px 10px; border-top: 1px solid #eee; font-size: 13px; }
tr:hover td { background: #fafafa; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.n { font-family: 'Consolas', monospace; white-space: nowrap; }
.sm { font-size: 11px; color: #999; }
.ta { text-align: center; }
.footer { text-align: center; color: #aaa; font-size: 11px; margin-top: 20px; padding-top: 12px; border-top: 1px solid #eee; }
.empty { text-align: center; padding: 30px; color: #999; font-size: 14px; }
</style>
</head>
<body>
<h1>📊 ПП-дашборд</h1>
<div class="ts">🔄 ${ts()} МСК · ${stats.total} строк</div>

<div class="grid">
  <div class="card b-l-dark"><div class="lbl">Всего строк</div><div class="val">${stats.total}</div><div class="sub">${stats.today} сегодня</div></div>
  <div class="card b-l-green"><div class="lbl">🟢 Выполнено</div><div class="val">${stats.green}</div><div class="sub">${Math.round(stats.green/stats.total*100)}% всех сделок</div></div>
  <div class="card b-l-yellow"><div class="lbl">🟡/🔴 В работе</div><div class="val">${stats.pending}</div><div class="sub">🟡 ${stats.yellow} · 🔴 ${stats.red} · ⚪ ${stats.white}</div></div>
  <div class="card b-l-blue"><div class="lbl">🔵 Только рубли</div><div class="val">${stats.blue}</div><div class="sub">без USDT</div></div>
  <div class="card b-l-green"><div class="lbl">USDT отправлено</div><div class="val">${fmt(stats.totalUsdtSent)}</div><div class="sub">всего</div></div>
  <div class="card b-l-blue"><div class="lbl">USDT получено</div><div class="val">${fmt(stats.totalUsdtRecv)}</div><div class="sub">всего</div></div>
  <div class="card b-l-purple"><div class="lbl">₽ Пришло рублей</div><div class="val">${fmt(stats.totalRubRecv)}</div><div class="sub">всего</div></div>
  <div class="card b-l-dark"><div class="lbl">С расчётом</div><div class="val">${stats.withFormula}</div><div class="sub">${stats.withoutFormula} без расчёта</div></div>
</div>`;

  // Today section
  html += `<h2>📋 Сегодня <span>${todayRows.length}</span></h2>`;
  if (todayRows.length === 0) {
    html += `<div class="empty">🌙 Сегодня сделок нет</div>`;
  } else {
    html += `<table><thead><tr><th>Статус</th><th>Дата</th><th>Сумма</th><th>Вал</th><th>Клиент</th><th>Компания</th></tr></thead><tbody>`;
    for (const r of todayRows) {
      html += `<tr><td><span class="dot" style="background:${r.color === 'green' ? '#92D050' : r.color === 'yellow' ? '#FFD700' : r.color === 'red' ? '#e74c3c' : r.color === 'blue' ? '#4FC3F7' : '#ccc'}"></span>${EMOJI[r.color]||'⚪'}</td><td>${esc(r.date)}</td><td class="n">${r.sum ? fmt(r.sum) : '-'}</td><td>${esc(r.cur)}</td><td>${esc(r.client||'-')}</td><td class="sm">${esc(r.company||'-')}</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  // Pending section
  const allPending = [...pendingRed, ...pendingNoCompany, ...pendingYellow];
  if (allPending.length > 0) {
    html += `<h2>⚠️ В работе <span>${allPending.length}</span></h2>`;
    html += `<table><thead><tr><th>Статус</th><th>Дата</th><th>Сумма</th><th>Вал</th><th>Клиент</th><th>Компания</th><th>Группа</th></tr></thead><tbody>`;
    const limit = 30;
    for (const r of allPending.slice(0, limit)) {
      let statusLabel = '⚪ без заявки';
      let statusColor = '#ccc';
      if (pendingRed.includes(r)) { statusLabel = '🔴 ждёт ПП'; statusColor = '#e74c3c'; }
      else if (pendingNoCompany.includes(r)) { statusLabel = '⚪ без компании'; statusColor = '#ccc'; }
      else if (pendingYellow.includes(r)) { statusLabel = '🟡 ждёт зелёнку'; statusColor = '#FFD700'; }
      html += `<tr><td><span class="dot" style="background:${statusColor}"></span>${statusLabel}</td><td>${esc(r.date)}</td><td class="n">${r.sum ? fmt(r.sum) : '-'}</td><td>${esc(r.cur)}</td><td>${esc(r.client||'-')}</td><td class="sm">${esc(r.company||'-')}</td><td class="sm">${r.group}</td></tr>`;
    }
    if (allPending.length > limit) {
      html += `<tr><td colspan="7" class="ta sm">... и ещё ${allPending.length - limit} строк</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  // Charts section
  html += `<div class="dual">`;

  // Top companies
  html += `<div><h2>🏢 Топ компаний</h2><table><thead><tr><th>#</th><th>Компания</th><th>Строк</th><th>%</th></tr></thead><tbody>`;
  const maxComp = topCompanies.length > 0 ? topCompanies[0][1] : 1;
  for (const [i, [name, cnt]] of topCompanies.entries()) {
    const pct = (cnt / stats.total * 100).toFixed(1);
    const bw = (cnt / maxComp * 100).toFixed();
    html += `<tr><td>${i+1}</td><td><strong>${esc(name)}</strong></td><td>${cnt}</td><td>${pct}% <span style="display:inline-block;width:60px;height:6px;background:#eee;border-radius:3px;vertical-align:middle;margin-left:4px;"><span style="display:block;height:100%;width:${bw}%;background:#4FC3F7;border-radius:3px;"></span></span></td></tr>`;
  }
  html += `</tbody></table></div>`;

  // Currencies + Groups
  html += `<div><h2>💱 Валюты</h2><table><thead><tr><th>Валюта</th><th>Строк</th></tr></thead><tbody>`;
  for (const [cur, cnt] of currencies) {
    html += `<tr><td><strong>${esc(cur)}</strong></td><td>${cnt}</td></tr>`;
  }
  html += `</tbody></table></div>`;

  html += `</div>`;

  // Groups
  html += `<h2>👥 Группы</h2><table><thead><tr><th>Группа</th><th>Строк</th><th>%</th></tr></thead><tbody>`;
  for (const [grp, cnt] of groups) {
    const pct = (cnt / stats.total * 100).toFixed(1);
    html += `<tr><td>${esc(grp)}</td><td>${cnt}</td><td>${pct}%</td></tr>`;
  }
  html += `</tbody></table>`;

  html += `<div class="footer">ПП-дашборд · ${stats.total} сделок · ${stats.green} 🟢 · ${ts()} МСК</div>`;
  html += `\n</body>\n</html>`;
  return html;
}

const data = build();
const html = render(data);
const outPath = path.join(__dirname, 'index.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log(`✅ Дашборд собран: ${data.stats.total} строк, ${data.stats.today} сегодня, ${data.stats.green} 🟢, ${data.stats.pending} в работе`);
