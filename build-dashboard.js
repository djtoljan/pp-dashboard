const fs = require('fs');
const path = require('path');

// ========== CONFIG ==========
const DATA_FILES = [
  { file: 'data.json', label: 'Main' },
  { file: 'data_konstantin.json', label: 'Константин' },
  { file: 'data_molodezh.json', label: 'Молодёжь' },
  { file: 'data_dvizhenie78.json', label: 'Движение 78' },
  { file: 'data_flowers.json', label: 'Цветы' },
];

const OUTPUT_FILE = 'index.html';

// ========== HELPERS ==========
function todayStr() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function tryReadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
  }
  return [];
}

function getStatusColor(row) {
  const color = (row.color || '').toLowerCase();
  switch (color) {
    case 'red': return '🔴';
    case 'blue': return '🔵';
    case 'white': return '⬜';
    case 'yellow': return '🟡';
    case 'green': return '🟢';
    default: return '⬜';
  }
}

function getStatusText(row) {
  const color = (row.color || '').toLowerCase();
  const hasCompany = !!row.company || !!row.clientName;
  const hasCost = !!row.costFormula;
  
  if (color === 'green') return '✅ EXECUTED';
  if (color === 'yellow') return '⏳ INITIATED / ждём зелёнку';
  if (color === 'white' && hasCompany && hasCost) return '📄 Заявка готова, ждём ПП';
  if (color === 'blue') return '🔵 Только рубли / VDX';
  if (color === 'red' && hasCompany && hasCost) return '📋 Поручение, ждём заявку';
  if (color === 'red') return '🔴 Новое поручение';
  return `⚪ ${color || 'без цвета'}`;
}

function isPastDue(row) {
  const color = (row.color || '').toLowerCase();
  if (color === 'green' || color === 'blue') return false;
  const hasCompany = !!row.company || !!row.clientName;
  const hasCost = !!row.costFormula;
  // Red/white/yellow with company+cost = needs attention
  if (color === 'yellow') return true; // waiting for green
  if (color === 'white' && hasCompany && hasCost) return true; // waiting for PP
  if (color === 'red' && hasCompany && hasCost) return true; // waiting for application
  return false;
}

function formatSum(row) {
  const sum = row.sum || row.sum_rub || '';
  const cur = row.currency || '';
  return sum ? `${Number(sum).toLocaleString('ru-RU')} ${cur}` : '';
}

// ========== BUILD DATA ==========
function buildDashboard() {
  const today = todayStr();
  const allTables = [];
  const todayDeals = [];
  const pastDueDeals = [];

  for (const df of DATA_FILES) {
    const rows = tryReadJSON(path.join(__dirname, df.file));
    if (!rows.length) continue;
    allTables.push({ label: df.label, rows });
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const date = row.date || '';
      const client = row.clientName || row.client || '';
      const company = row.company || '';
      const sum = row.sum || '';
      const currency = row.currency || '';
      const rublesReceived = row.rubles_received || '';
      const sentRublesVdx = row.sent_rubles_vdx || '';
      const color = getStatusColor(row);
      const status = getStatusText(row);
      const costFormula = row.costFormula || '';
      const receivedUsdt = row.received_usdt || '';
      const sentUsdt = row.sent_usdt || '';
      const exchangeTo = row.exchange_to || '';
      const notes = row.notes || '';
      const calc = row.calc || '';
      
      // Today's deals
      if (date === today) {
        todayDeals.push({
          date, client, company, sum, currency,
          rublesReceived, sentRublesVdx,
          color, status, costFormula,
          receivedUsdt, sentUsdt, exchangeTo,
          notes, calc, table: df.label
        });
      }
      
      // Past due deals
      if (date !== today && date && isPastDue(row)) {
        pastDueDeals.push({
          date, client, company, sum, currency,
          rublesReceived, sentRublesVdx,
          color, status, costFormula,
          receivedUsdt, sentUsdt, exchangeTo,
          notes, calc, table: df.label
        });
      }
    }
  }

  // Sort past due by date ascending
  pastDueDeals.sort((a, b) => {
    const [d1, m1, y1] = a.date.split('.').map(Number);
    const [d2, m2, y2] = b.date.split('.').map(Number);
    return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
  });

  return { today, todayDeals, pastDueDeals, allTables, now: new Date().toISOString() };
}

// ========== RENDER HTML ==========
function renderHTML(data) {
  const { today, todayDeals, pastDueDeals, allTables, now } = data;
  
  const totalToday = todayDeals.length;
  const totalPastDue = pastDueDeals.length;
  const totalGreen = (() => {
    let count = 0;
    for (const t of allTables) {
      for (const r of t.rows) {
        if ((r.color || '').toLowerCase() === 'green') count++;
      }
    }
    return count;
  })();
  
  const totalActive = (() => {
    let count = 0;
    for (const t of allTables) {
      for (const r of t.rows) {
        const c = (r.color || '').toLowerCase();
        if (c !== 'green') count++;
      }
    }
    return count;
  })();

  // Table row helper
  function rowHTML(d, isToday) {
    const statusColor = d.color;
    const rubleInfo = [];
    if (d.rublesReceived) rubleInfo.push(`💰 +${d.rublesReceived} ₽`);
    if (d.sentRublesVdx) rubleInfo.push(`📤 →VDX: ${d.sentRublesVdx} ₽`);
    if (d.exchangeTo) rubleInfo.push(`Обменник: ${d.exchangeTo}`);
    if (d.receivedUsdt) rubleInfo.push(`🪙 +${d.receivedUsdt} USDT`);
    if (d.sentUsdt) rubleInfo.push(`📤 -${d.sentUsdt} USDT`);
    const rubleStr = rubleInfo.join('<br>');
    
    return `<tr class="row-${d.color.toLowerCase()}">
      <td>${d.date}</td>
      <td class="sum">${d.sum ? Number(d.sum).toLocaleString('ru-RU') : ''}</td>
      <td>${d.currency || ''}</td>
      <td class="client">${d.client || '-'}</td>
      <td class="company">${d.company || '-'}</td>
      <td class="ruble-info">${rubleStr || '-'}</td>
      <td>${d.status}</td>
      <td class="table-badge">${d.table}</td>
    </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ПП-дашборд | ${today}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1117; color: #e1e4e8; padding: 20px; }
.container { max-width: 1400px; margin: 0 auto; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; flex-wrap: wrap; gap: 15px; }
header h1 { font-size: 24px; color: #58a6ff; }
header .subtitle { color: #8b949e; font-size: 14px; }
.stats { display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 30px; }
.stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 24px; flex: 1; min-width: 160px; }
.stat-card .value { font-size: 28px; font-weight: 700; }
.stat-card .label { color: #8b949e; font-size: 12px; text-transform: uppercase; margin-top: 4px; }
.stat-card.today .value { color: #58a6ff; }
.stat-card.past-due .value { color: #f0883e; }
.stat-card.green .value { color: #3fb950; }
.stat-card.active .value { color: #d29922; }
h2 { font-size: 18px; margin: 30px 0 15px; color: #f0f6fc; display: flex; align-items: center; gap: 10px; }
h2 .count-badge { background: #30363d; color: #8b949e; font-size: 12px; padding: 2px 10px; border-radius: 12px; }
.section-note { color: #8b949e; font-size: 13px; margin-bottom: 15px; }
table { width: 100%; border-collapse: collapse; background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; }
th { background: #21262d; padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; color: #8b949e; border-bottom: 1px solid #30363d; }
td { padding: 12px 16px; border-bottom: 1px solid #21262d; font-size: 14px; }
tr:last-child td { border-bottom: none; }
tr.row-red { border-left: 3px solid #f85149; }
tr.row-blue { border-left: 3px solid #58a6ff; }
tr.row-white { border-left: 3px solid #8b949e; }
tr.row-yellow { border-left: 3px solid #d29922; }
tr.row-green { border-left: 3px solid #3fb950; }
td.sum { font-family: 'JetBrains Mono', monospace; white-space: nowrap; }
td.client { font-weight: 500; }
td.company { color: #8b949e; }
td.ruble-info { font-size: 12px; color: #8b949e; white-space: nowrap; }
.table-badge { font-size: 11px; background: #30363d; color: #8b949e; padding: 2px 8px; border-radius: 4px; white-space: nowrap; }
.empty-state { text-align: center; padding: 40px; color: #8b949e; background: #161b22; border: 1px solid #30363d; border-radius: 8px; }
.empty-state .emoji { font-size: 36px; margin-bottom: 10px; }
footer { margin-top: 40px; text-align: center; color: #484f58; font-size: 12px; }
.update-time { color: #484f58; font-size: 12px; }
</style>
</head>
<body>
<div class="container">
<header>
<div>
<h1>📊 ПП-дашборд</h1>
<div class="subtitle">Мониторинг платежей • обновление каждые 30 мин</div>
</div>
<div class="update-time">🔄 ${new Date(now).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК</div>
</header>

<div class="stats">
<div class="stat-card today">
<div class="value">${totalToday}</div>
<div class="label">📋 Сделки сегодня</div>
</div>
<div class="stat-card past-due">
<div class="value">${totalPastDue}</div>
<div class="label">⚠️ Требуют внимания</div>
</div>
<div class="stat-card green">
<div class="value">${totalGreen}</div>
<div class="label">✅ Исполнено</div>
</div>
<div class="stat-card active">
<div class="value">${totalActive}</div>
<div class="label">🔄 В работе</div>
</div>
</div>

${todayDeals.length > 0 ? `
<h2>📋 Сделки за сегодня <span class="count-badge">${todayDeals.length}</span></h2>
<div class="section-note">Поступления рублей, отправки на VDX, свежие заявки</div>
<table>
<thead>
<tr>
<th>Дата</th><th>Сумма</th><th>Валюта</th><th>Клиент</th><th>Компания</th><th>Рубли / USDT</th><th>Статус</th><th>Таблица</th>
</tr>
</thead>
<tbody>
${todayDeals.map(d => rowHTML(d, true)).join('')}
</tbody>
</table>
` : `
<div class="empty-state">
<div class="emoji">🌙</div>
<div>Сегодня сделок нет</div>
</div>
`}

${pastDueDeals.length > 0 ? `
<h2>⚠️ Сделки прошлых дней — требуют внимания <span class="count-badge">${pastDueDeals.length}</span></h2>
<div class="section-note">Сделки с незакрытыми статусами: ждут зелёнку, ПП или заявку</div>
<table>
<thead>
<tr>
<th>Дата</th><th>Сумма</th><th>Валюта</th><th>Клиент</th><th>Компания</th><th>Рубли / USDT</th><th>Статус</th><th>Таблица</th>
</tr>
</thead>
<tbody>
${pastDueDeals.map(d => rowHTML(d, false)).join('')}
</tbody>
</table>
` : ''}

<footer>
<p>📊 ПП-дашборд • Данные из всех 5 таблиц • Автоматическое обновление каждые 30 мин (будни)</p>
</footer>
</div>
</body>
</html>`;
}

// ========== MAIN ==========
const data = buildDashboard();
const html = renderHTML(data);
fs.writeFileSync(path.join(__dirname, OUTPUT_FILE), html, 'utf8');
console.log(`✅ Dashboard generated: ${OUTPUT_FILE}`);
console.log(`   Today deals: ${data.todayDeals.length}`);
console.log(`   Past due:    ${data.pastDueDeals.length}`);