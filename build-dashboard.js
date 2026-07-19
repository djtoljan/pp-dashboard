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

// ========== COLOR MAPPING ==========
// Hex → status
const COLOR_MAP = {
  'FF92D050': 'green',     // Excel green
  'FFFFFF00': 'yellow',    // Excel yellow
  'FFFFFC00': 'yellow',    // Excel yellow (variant)
  'FFFF0000': 'red',       // Excel red
  'FF4FC3F7': 'blue',      // Excel light blue
  'FFFFFFFF': 'white',     // Excel white
  'FF00B050': 'green',     // Dark green (alternate)
  'FFE2EFDA': 'white',     // Light green bg
};

// ========== HELPERS ==========
function todayStr() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    
    // Handle both formats: flat array or {rows: [...]}
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
    return [];
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
    return [];
  }
}

function mapColor(hexColor) {
  if (!hexColor) return 'white';
  const upper = hexColor.toUpperCase();
  return COLOR_MAP[upper] || 'white';
}

function getStatusEmoji(color) {
  const map = { red: '🔴', blue: '🔵', white: '⬜', yellow: '🟡', green: '🟢' };
  return map[color] || '⬜';
}

function getStatusText(row) {
  const color = mapColor(row.color);
  const hasCompany = !!(row.company || row.clientName || row.client);
  const hasCost = !!(row.costFormula);
  
  switch (color) {
    case 'green': return '✅ EXECUTED';
    case 'yellow': return '⏳ INITIATED / ждём зелёнку';
    case 'white': return hasCompany && hasCost ? '📄 Заявка готова, ждём ПП' : '⬜ Без статуса';
    case 'blue': return '🔵 Только рубли / VDX';
    case 'red': return hasCompany && hasCost ? '📋 Поручение, ждём заявку' : '🔴 Новое поручение';
    default: return '⬜';
  }
}

function isPastDue(row) {
  const color = mapColor(row.color);
  if (color === 'green' || color === 'blue') return false;
  const hasCompany = !!(row.company || row.clientName || row.client);
  const hasCost = !!(row.costFormula);
  
  // Yellow = waiting for green
  if (color === 'yellow') return true;
  // White with company+cost = waiting for PP
  if (color === 'white' && hasCompany && hasCost) return true;
  // Red with company+cost = waiting for application
  if (color === 'red' && hasCompany && hasCost) return true;
  return false;
}

function getClient(row) {
  // Try all possible client field names
  return row.clientName || row.extra || row.client || '';
}

function getCellValue(rows, field) {
  if (!rows) return '';
  const val = rows[field];
  if (val === null || val === undefined) return '';
  return String(val);
}

// ========== BUILD DATA ==========
function buildDashboard() {
  const today = todayStr();
  const todayDeals = [];
  const pastDueDeals = [];
  let totalRows = 0;
  let totalGreen = 0;

  for (const df of DATA_FILES) {
    const rows = readJSON(path.join(__dirname, df.file));
    if (!rows.length) {
      console.log(`  ${df.file}: 0 rows (not found or empty)`);
      continue;
    }
    
    console.log(`  ${df.file}: ${rows.length} rows`);
    totalRows += rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const date = getCellValue(row, 'date');
      const client = getClient(row);
      const company = getCellValue(row, 'company');
      const sum = getCellValue(row, 'sum');
      const currency = getCellValue(row, 'currency');
      const sumFormatted = sum ? Number(sum).toLocaleString('ru-RU') : '';
      const rublesReceived = getCellValue(row, 'rubles_received');
      const sentRublesVdx = getCellValue(row, 'sent_rubles_vdx');
      const colorName = mapColor(row.color);
      const status = getStatusText(row);
      const costFormula = getCellValue(row, 'costFormula');
      const receivedUsdt = getCellValue(row, 'received_usdt');
      const sentUsdt = getCellValue(row, 'sent_usdt');
      const exchangeTo = getCellValue(row, 'exchange_to');
      const notes = getCellValue(row, 'notes');
      const calc = getCellValue(row, 'calc');
      const vdxRate = getCellValue(row, 'vdx_rate');

      if (colorName === 'green') totalGreen++;

      const entry = {
        date, client, company, sum: sumFormatted, currency,
        rublesReceived, sentRublesVdx,
        color: colorName, status, costFormula,
        receivedUsdt, sentUsdt, exchangeTo,
        notes, calc, vdxRate, table: df.label
      };

      // Today's deals (any status)
      if (date === today) {
        todayDeals.push(entry);
      }

      // Past due deals
      if (date && date !== today && isPastDue(row)) {
        pastDueDeals.push(entry);
      }
    }
  }

  // Sort by: newest first, but keep today at top
  function sortByDate(a, b) {
    const parseDate = (d) => {
      if (!d) return 0;
      const parts = d.split('.');
      if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
      return new Date(d);
    };
    return parseDate(b.date) - parseDate(a.date);
  }

  todayDeals.sort(sortByDate);
  pastDueDeals.sort(sortByDate);
  // Past due: oldest first (earliest dates need attention most)
  pastDueDeals.reverse();

  console.log(`\n  📋 Today (${today}): ${todayDeals.length} deals`);
  console.log(`  ⚠️ Past due: ${pastDueDeals.length} deals`);
  console.log(`  ✅ Green: ${totalGreen}/${totalRows}`);

  return { today, todayDeals, pastDueDeals, totalRows, totalGreen, now: new Date().toISOString() };
}

// ========== RENDER HTML ==========
function renderHTML(data) {
  const { today, todayDeals, pastDueDeals, totalRows, totalGreen, now } = data;
  const totalActive = totalRows - totalGreen;

  function cell(v, cls = '') {
    const display = v || '-';
    return `<td class="${cls}">${display}</td>`;
  }

  function rowHTML(d) {
    const rubleInfo = [];
    if (d.rublesReceived) rubleInfo.push(`💰 +${d.rublesReceived} ₽`);
    if (d.sentRublesVdx) rubleInfo.push(`📤 →VDX: ${d.sentRublesVdx} ₽`);
    if (d.receivedUsdt) rubleInfo.push(`🪙 +${d.receivedUsdt} USDT`);
    if (d.sentUsdt) rubleInfo.push(`📤 -${d.sentUsdt} USDT`);
    if (d.vdxRate) rubleInfo.push(`📊 Курс: ${d.vdxRate}`);
    const rubleStr = rubleInfo.length ? rubleInfo.join('<br>') : '-';
    
    return `<tr class="row-${d.color}">
      <td>${d.date}</td>
      <td class="num">${d.sum || ''}</td>
      <td>${d.currency || ''}</td>
      <td class="client">${d.client || '-'}</td>
      <td class="company">${d.company || '-'}</td>
      <td class="ruble">${rubleStr}</td>
      <td>${d.status}</td>
      <td><span class="badge">${d.table}</span></td>
    </tr>`;
  }

  function tableHTML(deals, emptyMsg) {
    if (!deals.length) {
      return `<div class="empty"><div class="empty-emoji">${emptyMsg.includes('🌙') ? '🌙' : '✅'}</div><div>${emptyMsg}</div></div>`;
    }
    return `<table>
      <thead><tr>
        <th>Дата</th><th>Сумма</th><th>Вал</th><th>Клиент</th><th>Компания</th><th>Движение средств</th><th>Статус</th><th>Табл</th>
      </tr></thead>
      <tbody>${deals.map(d => rowHTML(d)).join('')}</tbody>
    </table>`;
  }

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ПП-дашборд | ${today}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0d1117; color:#e6edf3; padding:16px; }
.container { max-width:1440px; margin:0 auto; }
header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:24px; }
header h1 { font-size:22px; color:#58a6ff; }
header .meta { color:#8b949e; font-size:13px; }
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-bottom:24px; }
.stat { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:14px 18px; }
.stat .val { font-size:26px; font-weight:700; }
.stat .lbl { color:#8b949e; font-size:11px; text-transform:uppercase; margin-top:2px; }
.stat.today .val { color:#58a6ff; }
.stat.due .val { color:#d29922; }
.stat.green .val { color:#3fb950; }
.stat.active .val { color:#f0883e; }
h2 { font-size:17px; margin:28px 0 12px; color:#f0f6fc; display:flex; align-items:center; gap:8px; }
h2 .tag { background:#21262d; color:#8b949e; font-size:11px; padding:2px 10px; border-radius:10px; }
.note { color:#8b949e; font-size:13px; margin-bottom:12px; }
table { width:100%; border-collapse:collapse; background:#161b22; border:1px solid #30363d; border-radius:8px; overflow:hidden; }
th { background:#21262d; padding:10px 12px; text-align:left; font-size:11px; text-transform:uppercase; color:#8b949e; border-bottom:1px solid #30363d; white-space:nowrap; }
td { padding:10px 12px; border-bottom:1px solid #21262d; font-size:13px; }
tr:last-child td { border-bottom:none; }
tr.row-red    { border-left:3px solid #f85149; }
tr.row-blue   { border-left:3px solid #58a6ff; }
tr.row-white  { border-left:3px solid #8b949e; }
tr.row-yellow { border-left:3px solid #d29922; }
tr.row-green  { border-left:3px solid #3fb950; }
td.num { font-family:'JetBrains Mono',monospace; white-space:nowrap; text-align:right; }
td.client { font-weight:500; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
td.company { color:#8b949e; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
td.ruble { font-size:12px; color:#8b949e; white-space:nowrap; }
.badge { font-size:10px; background:#21262d; color:#8b949e; padding:2px 7px; border-radius:4px; white-space:nowrap; }
.empty { text-align:center; padding:48px; color:#8b949e; background:#161b22; border:1px solid #30363d; border-radius:8px; }
.empty-emoji { font-size:32px; margin-bottom:8px; }
footer { margin-top:40px; text-align:center; color:#484f58; font-size:12px; }
.ts { color:#484f58; font-size:12px; }
tr:hover td { background:#1c2128; }
</style>
</head>
<body>
<div class="container">

<header>
<div>
<h1>📊 ПП-дашборд</h1>
<div class="meta">Мониторинг платежей • обновление каждые 30 мин</div>
</div>
<div class="ts">🔄 ${new Date(now).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК</div>
</header>

<div class="stats">
<div class="stat today"><div class="val">${todayDeals.length}</div><div class="lbl">📋 Сегодня</div></div>
<div class="stat due"><div class="val">${pastDueDeals.length}</div><div class="lbl">⚠️ Требуют внимания</div></div>
<div class="stat green"><div class="val">${totalGreen}</div><div class="lbl">✅ Исполнено</div></div>
<div class="stat active"><div class="val">${totalActive}</div><div class="lbl">🔄 В работе</div></div>
</div>

<h2>📋 Сделки за сегодня <span class="tag">${todayDeals.length}</span></h2>
<div class="note">Поступления рублей, отправки на VDX, свежие заявки</div>
${tableHTML(todayDeals, '🌙 Сегодня сделок нет')}

<h2>⚠️ Требуют внимания <span class="tag">${pastDueDeals.length}</span></h2>
<div class="note">Сделки прошлых дней, ожидающие зелёнку, ПП или заявку</div>
${tableHTML(pastDueDeals, '✅ Все сделки в порядке')}

<footer>
📊 ПП-дашборд • ${totalRows} сделок в 5 таблицах • Автообновление каждые 30 мин (будни, 09:00–21:00 МСК)
</footer>
</div>
</body>
</html>`;
}

// ========== MAIN ==========
console.log('🔄 Building dashboard...');
const data = buildDashboard();
const html = renderHTML(data);
fs.writeFileSync(path.join(__dirname, OUTPUT_FILE), html, 'utf8');
console.log(`\n✅ Dashboard: ${OUTPUT_FILE}`);