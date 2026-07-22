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

function fmt(n) {
  const v = parseFloat(n);
  if (isNaN(v)) return String(n);
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fmtDate(d) {
  if (!d) return '';
  // YYYY-MM-DD → DD.MM.YYYY
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d;
}

function build() {
  const td = today();
  const todayRows = [];
  const waitGreen = []; // 🟡 ждёт зелёнку
  const waitPP = []; // 🔴 ждёт ПП (есть компания+расчёт)
  const waitApp = []; // ⚪ без заявки/компании
  const waitVdx = []; // 🔵 рубли пришли, на VDX не отправлены

  const dailyCount = {};
  const companyDealCount = {}; // for pie chart
  let total = 0, green = 0, yellow = 0, blue = 0, white = 0, red = 0;
  let totalUsdtSent = 0, totalUsdtRecv = 0, totalRubRecv = 0;

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
      const dt = gv(r, 'date');
      let client = getClient(r);
      // Для Константин (Просто группа) — всегда подписываем, если нет конкретного клиента
      if (!client && f.label === 'Константин') {
        client = 'Константин (Просто группа)';
      }
      const sum = gv(r, 'sum');
      const cur = gv(r, 'currency');
      const cf = gv(r, 'costFormula');
      const hasCompany = !!company;
      const hasFormula = !!cf;

      if (r.received_usdt) totalUsdtRecv += parseFloat(r.received_usdt) || 0;
      if (r.sent_usdt) totalUsdtSent += parseFloat(r.sent_usdt) || 0;
      if (r.rubles_received) {
        String(r.rubles_received).split('/').forEach(p => { totalRubRecv += parseFloat(p) || 0; });
      }

      // Company pie — count non-blue deals
      if (company && col !== 'blue') {
        companyDealCount[company.toUpperCase()] = (companyDealCount[company.toUpperCase()] || 0) + 1;
      }

      // Daily count (current month only, valyutnie zayavki only — skip RUB and blue)
      if (dt && dt.length >= 7 && cur.toUpperCase() !== 'RUB' && col !== 'blue') {
        const ym = dt.slice(0, 7);
        const nowYM = td.slice(0, 7);
        if (ym === nowYM) {
          const day = dt.slice(8, 10);
          dailyCount[day] = (dailyCount[day] || 0) + 1;
        }
      }

      const entry = {
        date: dt, sum, cur, company, client, color: col, group: f.label,
        rubles: gv(r, 'rubles_received'),
        sentVdx: gv(r, 'sent_rubles_vdx'),
        usdtIn: gv(r, 'received_usdt'),
        usdtOut: gv(r, 'sent_usdt'),
      };

      // Today
      if (dt === td) { todayRows.push(entry); continue; }
      if (!dt) continue;

      // 🔵 Rubly prishli, no ne otpravleny na VDX
      if (r.rubles_received && !r.sent_rubles_vdx && (col === 'blue' || col === 'red')) {
        waitVdx.push(entry);
      }

      // Pending past days — only non-green, non-blue
      if (col === 'green' || col === 'blue') continue;

      if (col === 'yellow') waitGreen.push(entry);
      else if ((col === 'red' || col === 'white') && hasCompany && hasFormula) waitPP.push(entry);
      else if (col === 'red' && !hasCompany) waitApp.push(entry);
    }
  }

  const sortD = (a, b) => {
    if (!a.date) return 1; if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  };
  todayRows.sort(sortD);
  waitGreen.sort(sortD);
  waitPP.sort(sortD);
  waitApp.sort(sortD);
  waitVdx.sort(sortD);

  return {
    stats: { total, green, yellow, blue, white, red, today: todayRows.length,
      pending: waitGreen.length + waitPP.length + waitApp.length,
      vdxWait: waitVdx.length,
      usdtSent: Math.round(totalUsdtSent), usdtRecv: Math.round(totalUsdtRecv),
      rubRecv: Math.round(totalRubRecv) },
    todayRows, waitGreen, waitPP, waitApp, waitVdx, dailyCount, companyDealCount
  };
}

function render(d) {
  const { stats, todayRows, waitGreen, waitPP, waitApp, waitVdx, dailyCount, companyDealCount } = d;
  const N = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  const CSS = `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', -apple-system, sans-serif; background: #1a1d2e; color: #e0e0e0; padding: 24px; max-width: 1200px; margin: 0 auto; }
h1 { font-size: 28px; margin-bottom: 2px; color: #fff; }
.ts { color: #888; font-size: 14px; margin-bottom: 20px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
.card { background: #242740; border-radius: 12px; padding: 16px 20px; }
.card .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #999; margin-bottom: 2px; }
.card .val { font-size: 26px; font-weight: 700; color: #fff; }
.card.card-green { border-left: 4px solid #92D050; }
.card.card-red { border-left: 4px solid #e74c3c; }
.card.card-blue { border-left: 4px solid #4FC3F7; }
.card.card-yellow { border-left: 4px solid #FFD700; }
h2 { font-size: 18px; margin: 20px 0 10px; color: #ddd; }
h2 span { font-weight: 400; color: #777; font-size: 14px; }
.section-label { font-size: 20px; margin-right: 6px; vertical-align: middle; }
table { width: 100%; border-collapse: collapse; background: #242740; border-radius: 10px; overflow: hidden; margin-bottom: 16px; }
th { background: #1e2138; text-align: left; padding: 8px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: 600; white-space: nowrap; }
td { padding: 11px 14px; border-top: 1px solid #2a2d48; font-size: 14px; vertical-align: middle; color: #ccc; }
tr:hover td { background: #2a2d48; }
th { background: #1e2138; text-align: left; padding: 9px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: 600; white-space: nowrap; }
.n { font-family: 'Consolas', monospace; white-space: nowrap; text-align: right; color: #e0e0e0; font-size: 14px; }
.sm { font-size: 12px; color: #777; }
.ta { text-align: center; }
.emoji-lg { font-size: 32px; display: block; margin-bottom: 2px; }
.footer { text-align: center; color: #555; font-size: 11px; margin-top: 24px; padding-top: 12px; border-top: 1px solid #2a2d48; }
.empty { text-align: center; padding: 30px; color: #666; font-size: 14px; }`;

  let h = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>ПП-дашборд</title><style>${CSS}</style></head>
<body>
<h1>📊 ПП-дашборд</h1>
<div class="ts">🔄 ${ts()} МСК</div>

<div class="grid">
  <div class="card card-green"><div class="lbl">🟢 Выполнено</div><div class="val">${stats.green}</div></div>
  <div class="card card-yellow"><div class="lbl">🟡 Подвешено</div><div class="val">${waitGreen.length}</div></div>
  <div class="card card-red"><div class="lbl">🔴 В работе</div><div class="val">${waitPP.length}</div></div>
  <div class="card card-blue"><div class="lbl">⚪ Без заявки</div><div class="val">${waitApp.length}</div></div>
  <div class="card card-blue"><div class="lbl" style="color:#4FC3F7;">🔵 Не на VDX</div><div class="val" style="color:#4FC3F7;">${stats.vdxWait}</div></div>
</div>`;

  // ===== TODAY SECTION =====
  h += `<h2><span class="section-label">📋</span> Сегодня <span>${todayRows.length}</span></h2>`;
  if (todayRows.length === 0) {
    h += `<div class="empty">🌙 Сегодня сделок нет</div>`;
  } else {
    h += `<table><thead><tr><th></th><th>Сумма</th><th>Вал</th><th>Клиент</th><th>Компания</th><th>Пришло ₽</th><th>Ушло ₽</th><th>USDT</th></tr></thead><tbody>`;
    for (const r of todayRows) {
      const ec = r.color === 'green' ? '🟢' : r.color === 'yellow' ? '🟡' : r.color === 'red' ? '🔴' : r.color === 'blue' ? '🔵' : '⚪';
      const usdtOk = r.usdtIn && parseFloat(r.usdtIn) > 0 ? '✅' : '❌';
      h += `<tr>
        <td class="ta"><div class="emoji-lg">${ec}</div></td>
        <td class="n">${r.sum ? N(r.sum) : '-'}</td>
        <td>${esc(r.cur)}</td>
        <td>${esc(r.client||'-')}</td>
        <td class="sm">${esc(r.company||'-')}</td>
        <td class="n">${r.rubles ? N(String(r.rubles).split('/').reduce((a,p) => a + (parseFloat(p)||0), 0)) : '-'}</td>
        <td class="n">${r.sentVdx ? N(String(r.sentVdx).split('/').reduce((a,p) => a + (parseFloat(p)||0), 0)) : '-'}</td>
        <td class="ta">${usdtOk}</td>
      </tr>`;
    }
    h += `</tbody></table>`;
  }

  // ===== 🔵 RUBLES — NOT SENT TO VDX =====
  if (waitVdx.length > 0) {
    h += `<h2><span class="section-label">🔵</span> Рубли на VDX не отправлены <span>${waitVdx.length}</span></h2>`;
    h += `<table><thead><tr><th></th><th>Дата</th><th>Клиент</th><th>Группа</th><th>Пришло ₽</th></tr></thead><tbody>`;
    for (const r of waitVdx) {
      const rubTotal = r.rubles ? String(r.rubles).split('/').reduce((a,p) => a + (parseFloat(p)||0), 0) : 0;
      h += `<tr>
        <td class="ta"><div class="emoji-lg">🔵</div></td>
        <td>${fmtDate(esc(r.date))}</td>
        <td>${esc(r.client||'-')}</td>
        <td class="sm">${r.group}</td>
        <td class="n">${rubTotal > 0 ? N(Math.round(rubTotal)) : '-'}</td>
      </tr>`;
    }
    h += `</tbody></table>`;
  }

  // ===== PAST DAYS — NO APPLICATION ⚪ =====
  if (waitApp.length > 0) {
    h += `<h2><span class="section-label">⚪</span> Без заявки (нет компании) <span>${waitApp.length}</span></h2>`;
    h += `<table><thead><tr><th></th><th>Дата</th><th>Сумма</th><th>Вал</th><th>Клиент</th><th>Группа</th><th>USDT</th></tr></thead><tbody>`;
    for (const r of waitApp) {
      const usdtOk = r.usdtIn && parseFloat(r.usdtIn) > 0 ? '✅' : '❌';
      h += `<tr>
        <td class="ta"><div class="emoji-lg">⚪</div></td>
        <td>${fmtDate(esc(r.date))}</td>
        <td class="n">${r.sum ? N(r.sum) : '-'}</td>
        <td>${esc(r.cur)}</td>
        <td>${esc(r.client||'-')}</td>
        <td class="sm">${r.group}</td>
        <td class="ta">${usdtOk}</td>
      </tr>`;
    }
    h += `</tbody></table>`;
  }

  // ===== PAST DAYS — WAITING FOR PP 🔴 =====
  if (waitPP.length > 0) {
    h += `<h2><span class="section-label">🔴</span> Ждут ПП <span>${waitPP.length}</span></h2>`;
    h += `<table><thead><tr><th></th><th>Дата</th><th>Сумма</th><th>Вал</th><th>Клиент</th><th>Компания</th><th>USDT</th></tr></thead><tbody>`;
    for (const r of waitPP) {
      const usdtOk = r.usdtIn && parseFloat(r.usdtIn) > 0 ? '✅' : '❌';
      h += `<tr>
        <td class="ta"><div class="emoji-lg">🔴</div></td>
        <td>${fmtDate(esc(r.date))}</td>
        <td class="n">${r.sum ? N(r.sum) : '-'}</td>
        <td>${esc(r.cur)}</td>
        <td>${esc(r.client||'-')}</td>
        <td class="sm">${esc(r.company||'-')}</td>
        <td class="ta">${usdtOk}</td>
      </tr>`;
    }
    h += `</tbody></table>`;
  }

  // ===== PAST DAYS — WAITING FOR GREEN 🟡 =====
  if (waitGreen.length > 0) {
    h += `<h2><span class="section-label">🟡</span> Ждут зелёнку <span>${waitGreen.length}</span></h2>`;
    h += `<table><thead><tr><th></th><th>Дата</th><th>Сумма</th><th>Вал</th><th>Клиент</th><th>Компания</th><th>USDT</th></tr></thead><tbody>`;
    for (const r of waitGreen) {
      const usdtOk = r.usdtIn && parseFloat(r.usdtIn) > 0 ? '✅' : '❌';
      h += `<tr>
        <td class="ta"><div class="emoji-lg">🟡</div></td>
        <td>${fmtDate(esc(r.date))}</td>
        <td class="n">${r.sum ? N(r.sum) : '-'}</td>
        <td>${esc(r.cur)}</td>
        <td>${esc(r.client||'-')}</td>
        <td class="sm">${esc(r.company||'-')}</td>
        <td class="ta">${usdtOk}</td>
      </tr>`;
    }
    h += `</tbody></table>`;
  }

  // ===== COMPANY RATING CHART 🥧 =====
  const comps = Object.entries(companyDealCount || {}).sort((a,b) => b[1] - a[1]).slice(0, 15);
  const maxComp = Math.max(...comps.map(c => c[1]), 1);
  if (comps.length > 0) {
    h += `<h2><span class="section-label">🥧</span> Рейтинг компаний</h2>`;
    h += `<div style="background:#242740;border-radius:10px;padding:16px;margin-bottom:16px;">`;
    for (const [name, cnt] of comps) {
      const pct = (cnt / stats.total * 100).toFixed(1);
      const bw = Math.max(4, (cnt / maxComp) * 100);
      h += `<div style="display:flex;align-items:center;margin-bottom:6px;gap:8px;">`;
      h += `<div style="min-width:140px;font-size:12px;color:#ccc;text-align:right;">${esc(name)}</div>`;
      h += `<div style="flex:1;height:20px;background:#1a1d2e;border-radius:10px;overflow:hidden;">`;
      h += `<div style="height:100%;width:${bw}%;background:linear-gradient(90deg,#92D050,#4FC3F7);border-radius:10px;transition:width 0.3s;"></div></div>`;
      h += `<div style="min-width:60px;font-size:12px;color:#999;">${cnt} (${pct}%)</div></div>`;
    }
    h += `</div>`;
  }

  // ===== DAILY RATING CHART 📊 =====
  const days = Object.keys(dailyCount).sort((a,b)=>parseInt(a)-parseInt(b));
  const maxDay = Math.max(...Object.values(dailyCount), 1);
  if (days.length > 0) {
    const monthNames = ['','январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
    const curMonth = new Date().getMonth() + 1;
    h += `<h2><span class="section-label">📊</span> Дневной рейтинг заявок за ${monthNames[curMonth]}</h2>`;
    h += `<div style="background:#242740;border-radius:10px;padding:16px;margin-bottom:16px;">`;
    h += `<div style="display:flex;align-items:flex-end;gap:3px;min-height:160px;overflow-x:auto;">`;
    for (const day of days) {
      const cnt = dailyCount[day];
      const hh = Math.max(4, (cnt / maxDay) * 130);
      h += `<div style="display:flex;flex-direction:column;align-items:center;min-width:28px;">`;
      h += `<div style="font-size:10px;color:#999;margin-bottom:4px;">${cnt}</div>`;
      h += `<div style="width:22px;height:${hh}px;background:linear-gradient(180deg,#4FC3F7,#3bb3f6);border-radius:4px 4px 0 0;opacity:${0.5+(cnt/maxDay)*0.5};transition:height 0.3s;"></div>`;
      h += `<div style="font-size:9px;color:#666;margin-top:4px;">${day}</div>`;
      h += `</div>`;
    }
    h += `</div></div>`;
  }

  h += `<div class="footer">ПП-дашборд · ${stats.total} сделок · ${stats.green} 🟢 · ${waitGreen.length} 🟡 · ${waitPP.length} 🔴 · ${waitApp.length} ⚪ · ${ts()} МСК</div></body></html>`;
  return h;
}

const data = build();
const html = render(data);
fs.writeFileSync(path.join(__dirname, 'index.html'), html, 'utf8');
const s = data.stats;
console.log(`✅ ${s.total} строк · ${s.today} сегодня · 🟡${data.waitGreen.length} · 🔴${data.waitPP.length} · ⚪${data.waitApp.length}`);
