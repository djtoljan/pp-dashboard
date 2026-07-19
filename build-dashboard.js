const fs=require('fs'),path=require('path');
const F=[
  {f:'data.json',l:'Main'},{f:'data_konstantin.json',l:'Konst'},
  {f:'data_molodezh.json',l:'Molod'},{f:'data_dvizhenie78.json',l:'Dv78'},
  {f:'data_flowers.json',l:'Flowers'}
];
const CM={'FF92D050':'green','FFFFFF00':'yellow','FFFFFC00':'yellow','FFFF0000':'red','FF4FC3F7':'blue','FFFFFFFF':'white','FF00B050':'green','FFE2EFDA':'white'};
function ts(){const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0')+'-'+d.getDate().toString().padStart(2,'0');}
function rd(fn){try{if(!fs.existsSync(fn))return[];const p=JSON.parse(fs.readFileSync(fn,'utf8'));if(Array.isArray(p))return p;if(p&&Array.isArray(p.rows))return p.rows;return[];}catch(e){return[];}}
function mc(h){return CM[(h||'').toUpperCase()]||'white';}
function cl(r){return r.clientName||r.extra||r.client||'';}
function gv(r,f){const x=r[f];return(x===null||x===undefined)?'':String(x);}
function E(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
const EM={'red':'🔴','blue':'🔵','white':'⚪','yellow':'🟡','green':'🟢'};

function build(){
  const T=ts(),td=[],pg=[],pp=[],nc=[];let tot=0,grn=0,ylw=0,blu=0,wht=0,redC=0;
  const coMap={};
  for(const x of F){const rows=rd(path.join(__dirname,x.f));if(!rows.length)continue;tot+=rows.length;
    for(const r of rows){const c=mc(r.color),d=gv(r,'date'),cln=cl(r),co=gv(r,'company');
    const s=gv(r,'sum'),sf=s?Number(s).toLocaleString('ru-RU'):'',cu=gv(r,'currency');
    const cf=gv(r,'costFormula'),rb=gv(r,'rubles_received'),sv=gv(r,'sent_rubles_vdx');
    const ui=gv(r,'received_usdt'),uo=gv(r,'sent_usdt'),ex=gv(r,'exchange_to');
    const hc=!!co,hf=!!cf;
    if(c==='green')grn++; else if(c==='yellow')ylw++; else if(c==='blue')blu++; else if(c==='white')wht++; else if(c==='red')redC++;
    if(co){const k=co.toUpperCase();coMap[k]=(coMap[k]||0)+1;}
    const e={d,cln,co,s:sf,cu,rb,sv,ui,uo,ex,cf,tb:x.l,c};
    if(d===T){td.push(e);continue;}if(!d)continue;
    if(c==='red'&&!hc)nc.push(e);else if(c==='yellow')pg.push(e);else if(c==='white'&&hc&&hf)pp.push(e);else if(c==='red'&&hc&&hf)pp.push(e);
  }}
  const sa=(a,b)=>{const p=(d)=>{if(!d)return 0;const x=d.split('.');return new Date(x[2],x[1]-1,x[0]);};return p(a.d)-p(b.d);};
  td.sort((a,b)=>{const p=(d)=>{if(!d)return 0;const x=d.split('.');return new Date(x[2],x[1]-1,x[0]);};return p(b.d)-p(a.d);});
  pg.sort(sa);pp.sort(sa);nc.sort(sa);
  // Bar chart data: top companies by count
  const barData=Object.entries(coMap).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([n,cnt])=>({name:n,count:cnt}));
  // Donut data: color distribution
  const donutData=[
    {label:'Зелёные',value:grn,color:'#4ed58a'},
    {label:'Синие',value:blu,color:'#3bb3f6'},
    {label:'Белые',value:wht,color:'#a78bfa'},
    {label:'Жёлтые',value:ylw,color:'#fce465'},
    {label:'Красные',value:redC,color:'#ec6b9d'}
  ].filter(d=>d.value>0);
  const totalPending=pg.length+pp.length+nc.length;
  return{T,td,pg,pp,nc,tot,grn,barData,donutData,totalPending};
}

function render(d){
  const css=fs.readFileSync(path.join(__dirname,'dashboard.css'),'utf8');
  const{T,td,pg,pp,nc,tot,grn,barData,donutData,totalPending}=d;
  const now=new Date().toLocaleString('ru-RU',{timeZone:'Europe/Moscow'});

  // --- Bar chart SVG ---
  const barMax=Math.max(...barData.map(b=>b.count),1);
  const barW=600,barH=180,barPad=8;
  const barGap=4,barTotalW=(barW-barPad*2),barCount=barData.length;
  const barW2=Math.max(6,Math.floor((barTotalW-barGap*(barCount-1))/barCount));
  const bars=barData.map((b,i)=>{
    const hh=Math.max(3,(b.count/barMax)*(barH-28));
    const x=barPad+i*(barW2+barGap);
    const y=barH-hh-20;
    return `<rect x="${x}" y="${y}" width="${barW2}" height="${hh}" rx="3" fill="${barCount>8&&i>6?'#4a82bd':'#3bb3f6'}" opacity="${0.5+(b.count/barMax)*0.5}"><title>${E(b.name)}: ${b.count}</title></rect>
<text x="${x+barW2/2}" y="${barH-4}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.4)">${E(b.name.length>7?b.name.slice(0,7):b.name)}</text>`;
  }).join('');

  // --- Donut chart SVG ---
  const donutTotal=donutData.reduce((s,d)=>s+d.value,0);
  const donutR=80,r2=50,center=100;
  let donutAngle=-90;
  const donutSlices=donutData.map(s=>{
    const pct=s.value/donutTotal;
    const sliceAngle=pct*360;
    const startAngle=donutAngle;
    donutAngle+=sliceAngle;
    const startRad=startAngle*Math.PI/180;
    const endRad=donutAngle*Math.PI/180;
    const x1=center+donutR*Math.cos(startRad);
    const y1=center+donutR*Math.sin(startRad);
    const x2=center+donutR*Math.cos(endRad);
    const y2=center+donutR*Math.sin(endRad);
    const large=sliceAngle>180?1:0;
    const path=`M ${center} ${center} L ${x1} ${y1} A ${donutR} ${donutR} 0 ${large} 1 ${x2} ${y2} Z`;
    return `<path d="${path}" fill="${s.color}" opacity="0.85"/>`;
  }).join('');
  const donutHole=`<circle cx="${center}" cy="${center}" r="${r2}" fill="#151a35"/>`;
  const donutLegend=donutData.map(s=>`<div class="dl-item"><span class="dl-dot" style="background:${s.color}"></span>${E(s.label)}: ${s.value}</div>`).join('');

  const H='<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>ПП-дашборд '+T+'</title>\n<style>\n'+css+'\n</style>\n</head>\n<body>\n'+
'<div class="dashboard">\n'+
'<div class="orbs-layer">\n'+
'<div class="orb orb-pink"></div>\n<div class="orb orb-cyan-1"></div>\n<div class="orb orb-cyan-2"></div>\n'+
'<div class="orb orb-green-1"></div>\n<div class="orb orb-blue-1"></div>\n<div class="orb orb-yellow"></div>\n'+
'<div class="orb orb-cyan-3"></div>\n<div class="orb orb-green-2"></div>\n<div class="orb orb-blue-2"></div>\n'+
'<div class="orb orb-purple"></div>\n</div>\n'+
'<div class="content">\n'+

// --- Header ---
'<div class="hd"><div><h1>📊 ПП-дашборд</h1><div class="m">обновление каждые 30 мин</div></div><div class="ts">🔄 '+now+' МСК</div></div>\n'+

// --- KPI Row ---
'<div class="kpi-row">\n'+
'<div class="kpi-card card-standard"><div class="l">Всего строк</div><div class="v">'+tot+'</div><div class="sub" style="color:#3bb3f6">'+td.length+' сегодня</div></div>\n'+
'<div class="kpi-card card-blue"><div class="l">Выполнено</div><div class="v">'+grn+'</div><div class="sub" style="color:#4ed58a">✅ '+Math.round(grn/tot*100)+'% завершено</div></div>\n'+
'<div class="kpi-card card-purple"><div class="l">В работе</div><div class="v">'+(totalPending)+'</div><div class="sub" style="color:#ec6b9d">'+pg.length+' жёлтых · '+pp.length+' красных · '+nc.length+' без заявки</div></div>\n'+
'</div>\n'+

// --- Charts Row ---
'<div class="charts-row">\n'+
'<div class="chart-panel"><h3>🏢 Топ компаний</h3><div class="chart-body"><svg viewBox="0 0 '+barW+' '+barH+'" width="100%" height="'+barH+'">'+bars+'</svg></div></div>\n'+
'<div class="chart-panel"><h3>🎨 Статусы</h3><div class="chart-body"><div class="donut-wrap"><svg viewBox="0 0 200 200" width="200" height="200">'+donutSlices+donutHole+'</svg><div class="donut-center"><div class="dc-val">'+tot+'</div><div class="dc-lbl">всего</div></div></div></div><div class="donut-legend">'+donutLegend+'</div></div>\n'+
'</div>\n'+

// --- Today's Table ---
'<div class="table-panel">\n<h2>📋 Сегодня <span class="t">'+td.length+'</span></h2>\n'+
(td.length?'<table><thead><tr><th>Статус</th><th>Дата</th><th>Сумма</th><th>Вал</th><th>Клиент</th><th>Компания</th><th>Детали</th></tr></thead><tbody>'+
td.map(e=>{const ri=[];if(e.rb)ri.push('💰 '+E(e.rb)+' ₽');if(e.sv)ri.push('📤 '+E(e.sv)+' ₽');if(e.ui)ri.push('+'+E(e.ui)+' USDT');if(e.uo)ri.push('-'+E(e.uo)+' USDT');
return '<tr><td><span class="dot '+e.c+'"></span>'+EM[e.c]+'</td><td>'+E(e.d)+'</td><td class="n">'+(e.s||'')+'</td><td>'+E(e.cu)+'</td><td class="c1">'+E(e.cln||'-')+'</td><td class="c2">'+E(e.co||'-')+'</td><td style="font-size:12px;color:rgba(255,255,255,0.4)">'+(ri.length?ri.join(' · '):'-')+'</td></tr>';}).join('')+
'</tbody></table>':'<div class="e"><div class="ee">🌙</div><div>Сегодня сделок нет</div></div>')+
'</div>\n'+

// --- Pending Table ---
(totalPending?'<div class="table-panel">\n<h2>⚠️ В работе <span class="t">'+totalPending+'</span></h2>\n'+
'<table><thead><tr><th>Статус</th><th>Дата</th><th>Сумма</th><th>Вал</th><th>Клиент</th><th>Компания</th><th>Детали</th></tr></thead><tbody>'+
[...nc.map(e=>({...e,status:'white',label:'⚪ Без заявки'})),
 ...pp.map(e=>({...e,status:'red',label:'🔴 Ждёт ПП'})),
 ...pg.map(e=>({...e,status:'yellow',label:'🟡 Ждёт зелёнку'})),
].slice(0,30).map(e=>'<tr><td><span class="dot '+e.status+'"></span>'+e.label+'</td><td>'+E(e.d)+'</td><td class="n">'+(e.s||'')+'</td><td>'+E(e.cu)+'</td><td class="c1">'+E(e.cln||'-')+'</td><td class="c2">'+E(e.co||'-')+'</td><td style="font-size:12px;color:rgba(255,255,255,0.4)">'+E(e.tb||'')+'</td></tr>').join('')+
'</tbody></table></div>\n':'')+

// --- Footer ---
'<div class="ft">ПП-дашборд • '+tot+' сделок • '+grn+' ✅ • обновление 30 мин (будни) • Nano Banana design</div>\n'+

'</div>\n</div>\n</body>\n</html>';
  return H;
}

const d=build();
const h=render(d);
fs.writeFileSync(path.join(__dirname,'index.html'),h,'utf8');
console.log('OK: T='+d.td.length+' Y='+d.pg.length+' R='+d.pp.length+' N='+d.nc.length+' TOT='+d.tot+' BARS='+d.barData.length+' DONUT='+d.donutData.length);
