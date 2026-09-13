/* ===== Utilities ===== */
const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

function pad(n){ return String(n).padStart(2,'0'); }
function toISODate(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function fromISODate(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function fmtDate(d){ return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`; }
function fmtHours(n){ return (Math.round(n*100)/100).toFixed(2).replace('.', ','); }

function isoWeek(date){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(),0,4));
  const weekNum = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay()+6)%7)) / 7);
  return weekNum;
}

function uid(){ return Math.random().toString(36).slice(2,10); }

/* ===== Feiertage Niedersachsen ===== */
function easterSunday(year){
  const a = year % 19, b = Math.floor(year/100), c = year % 100;
  const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
  const i = Math.floor(c/4), k = c % 4;
  const l = (32+2*e+2*i-h-k) % 7;
  const m = Math.floor((a+11*h+22*l)/451);
  const month = Math.floor((h+l-7*m+114)/31);
  const day = ((h+l-7*m+114) % 31) + 1;
  return new Date(year, month-1, day);
}
function addDays(d, n){ const r = new Date(d); r.setDate(r.getDate()+n); return r; }

const holidayCache = {};
function getHolidaysNiedersachsen(year){
  if(holidayCache[year]) return holidayCache[year];
  const easter = easterSunday(year);
  const list = [
    {date:new Date(year,0,1), name:'Neujahr'},
    {date:addDays(easter,-2), name:'Karfreitag'},
    {date:addDays(easter,1), name:'Ostermontag'},
    {date:new Date(year,4,1), name:'Tag der Arbeit'},
    {date:addDays(easter,39), name:'Christi Himmelfahrt'},
    {date:addDays(easter,50), name:'Pfingstmontag'},
    {date:new Date(year,9,3), name:'Tag der Deutschen Einheit'},
    {date:new Date(year,9,31), name:'Reformationstag'},
    {date:new Date(year,11,25), name:'1. Weihnachtsfeiertag'},
    {date:new Date(year,11,26), name:'2. Weihnachtsfeiertag'},
  ];
  const map = {};
  list.forEach(h => map[toISODate(h.date)] = h.name);
  holidayCache[year] = map;
  return map;
}
function isHoliday(dateObj){
  const map = getHolidaysNiedersachsen(dateObj.getFullYear());
  return map[toISODate(dateObj)] || null;
}

/* ===== Storage ===== */
const DEFAULT_SETTINGS = {
  name:'', street:'', city:'',
  monThuStart:'07:00', monThuEnd:'16:15', monThuPause:60,
  friStart:'07:00', friEnd:'12:30', friPause:30,
  darkMode:false, lastBackupAt:null, urlaubstage:30,
  pinEnabled:false, pinHash:null, emailRecipient:'stunden@john-haustechnik.net',
  showOfficeShare:false,
  tileUrlaub:true, tileKrank:true, tileSchule:true, tileAbbau:true, tileKunden:true
};

function isStorageAvailable(){
  try{
    const testKey = '__sz_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  }catch(e){ return false; }
}
const storageAvailable = isStorageAvailable();

function loadSettings(){
  try{
    const raw = localStorage.getItem('sz_settings');
    return raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : {...DEFAULT_SETTINGS};
  }catch(e){
    rescueCorruptData('sz_settings');
    return {...DEFAULT_SETTINGS};
  }
}
function saveSettings(s){
  try{
    localStorage.setItem('sz_settings', JSON.stringify(s));
    return true;
  }catch(e){ return false; }
}

function loadDays(){
  try{
    const raw = localStorage.getItem('sz_days');
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    rescueCorruptData('sz_days');
    return [];
  }
}
function saveDays(days){
  try{
    localStorage.setItem('sz_days', JSON.stringify(days));
    return true;
  }catch(e){ return false; }
}

function loadLockedMonths(){
  try{
    const raw = localStorage.getItem('sz_locked_months');
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    rescueCorruptData('sz_locked_months');
    return [];
  }
}
function saveLockedMonths(list){
  try{
    localStorage.setItem('sz_locked_months', JSON.stringify(list));
    return true;
  }catch(e){ return false; }
}
function monthKey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }

// Rettet einen nicht mehr lesbaren Datensatz unter neuem Schlüssel, statt ihn stillschweigend zu verwerfen.
function rescueCorruptData(key){
  try{
    const raw = localStorage.getItem(key);
    if(raw){
      localStorage.setItem(`${key}_rescued_${Date.now()}`, raw);
      dataIntegrityWarning = true;
    }
  }catch(e){ /* nichts mehr zu retten */ }
}
let dataIntegrityWarning = false;

/* ===== State ===== */
let settings = loadSettings();
let days = loadDays();
let lockedMonths = loadLockedMonths();
let viewDate = new Date();
let editingDate = null; // ISO date of day currently being edited, null = new

/* ===== Day total calc ===== */
function dayTotal(day){
  if(!day || typeof day !== 'object') return 0;
  if(day.type === 'work'){
    const items = Array.isArray(day.items) ? day.items : [];
    return items.reduce((s,i)=> s + (parseFloat(i?.stunden)||0), 0);
  }
  if(day.type === 'abbau'){
    return parseFloat(day.abbauStunden)||0;
  }
  return 0; // urlaub, krankheit, schule
}

const VALID_DAY_TYPES = ['work','urlaub','krankheit','schule','feiertag','abbau'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Prüft und bereinigt importierte Tages-Datensätze (aus Sicherung oder geteilter Datei).
// Datensätze mit ungültigem Datum/Typ werden verworfen, statt die App zu gefährden.
function sanitizeImportedDays(rawDays){
  if(!Array.isArray(rawDays)) return {valid: [], rejected: 0};
  const valid = [];
  let rejected = 0;
  rawDays.forEach(d => {
    if(!d || typeof d !== 'object' || !ISO_DATE_RE.test(d.date) || !VALID_DAY_TYPES.includes(d.type)){
      rejected++;
      return;
    }
    const clean = { date: d.date, type: d.type };
    if(d.type === 'work'){
      const items = Array.isArray(d.items) ? d.items : [];
      clean.items = items.map(it => ({
        id: typeof it?.id === 'string' ? it.id : uid(),
        kunde: typeof it?.kunde === 'string' ? it.kunde : '',
        taetigkeit: typeof it?.taetigkeit === 'string' ? it.taetigkeit : '',
        stunden: parseFloat(it?.stunden)||0,
        notiz: typeof it?.notiz === 'string' ? it.notiz : '',
        nachtarbeit: !!it?.nachtarbeit,
        schmutzzulage: !!it?.schmutzzulage
      })).filter(it => it.kunde || it.taetigkeit || it.stunden);
      clean.start = typeof d.start === 'string' ? d.start : '';
      clean.end = typeof d.end === 'string' ? d.end : '';
      clean.pause = parseFloat(d.pause)||0;
      if(clean.items.length === 0){ rejected++; return; }
    } else if(d.type === 'abbau'){
      clean.abbauStunden = parseFloat(d.abbauStunden)||0;
    }
    valid.push(clean);
  });
  return {valid, rejected};
}

/* ===== Dashboard ===== */
function renderDashboard(monthDays){
  const total = monthDays.reduce((s,d)=> s + dayTotal(d), 0);
  const urlaubTage = monthDays.filter(d=>d.type==='urlaub').length;
  const krankTage = monthDays.filter(d=>d.type==='krankheit').length;
  const schuleTage = monthDays.filter(d=>d.type==='schule').length;
  const abbau = monthDays.filter(d=>d.type==='abbau').reduce((s,d)=> s + dayTotal(d), 0);

  const cards = [
    `<div class="dash-card"><div class="v">${fmtHours(total)}</div><div class="l">STD GESAMT</div></div>`,
  ];
  if(settings.tileUrlaub !== false){
    cards.push(`<div class="dash-card"><div class="v">${urlaubTage}</div><div class="l">URLAUB</div></div>`);
  }
  if(settings.tileKrank !== false){
    cards.push(`<div class="dash-card"><div class="v">${krankTage}</div><div class="l">KRANK</div></div>`);
  }
  if(settings.tileSchule !== false && schuleTage > 0){
    cards.push(`<div class="dash-card"><div class="v">${schuleTage}</div><div class="l">SCHULE</div></div>`);
  }
  if(settings.tileAbbau !== false){
    cards.push(`<div class="dash-card"><div class="v">${fmtHours(abbau)}</div><div class="l">ABBAU</div></div>`);
  }

  if(settings.tileOvertime !== false){
    const balance = computeOvertimeBalance(days); // laufendes Gesamtkonto über alle erfassten Tage
    const sign = balance > 0 ? '+' : '';
    cards.push(`<div class="dash-card"><div class="v">${sign}${fmtHours(balance)}</div><div class="l">ÜBERSTUNDEN</div></div>`);
  }

  if(settings.tileKunden !== false){
    const kundenCount = countDistinctKunden(monthDays);
    cards.push(`<div class="dash-card"><div class="v">${kundenCount}</div><div class="l">KUNDEN</div></div>`);
  }

  if(settings.showOfficeShare){
    const pct = officeSharePercent(monthDays);
    if(pct !== null){
      cards.push(`<div class="dash-card"><div class="v">${pct}%</div><div class="l">BÜROZEIT</div></div>`);
    }
  }

  const dash = document.getElementById('dashboard');
  dash.style.gridTemplateColumns = `repeat(${cards.length},1fr)`;
  dash.innerHTML = cards.join('');
}

function isBueroLabel(name){
  const n = (name||'').trim().toLowerCase();
  return n === '' || n === 'büroarbeiten' || n === 'büroarbeit';
}

function countDistinctKunden(dayList){
  const names = new Set();
  dayList.forEach(d => {
    if(d.type !== 'work') return;
    (d.items||[]).forEach(it => {
      if(!isBueroLabel(it.kunde)) names.add(it.kunde.trim());
    });
  });
  return names.size;
}

function officeSharePercent(dayList){
  let total = 0, buero = 0;
  dayList.forEach(d => {
    if(d.type !== 'work') return;
    (d.items||[]).forEach(it => {
      const std = parseFloat(it.stunden)||0;
      total += std;
      if(isBueroLabel(it.kunde)) buero += std;
    });
  });
  if(total === 0) return null;
  return Math.round((buero/total)*100);
}

function renderTodayStatus(){
  const el = document.getElementById('todayStatus');
  const today = new Date();

  if(viewDate.getFullYear() !== today.getFullYear() || viewDate.getMonth() !== today.getMonth()){
    el.style.display = 'none';
    return;
  }
  const dow = today.getDay();
  if(dow === 0 || dow === 6 || isHoliday(today)){
    el.style.display = 'none';
    return;
  }

  const iso = toISODate(today);
  const entry = days.find(d => d.date === iso);
  const dft = defaultTimesFor(today);
  const [sh,sm] = (dft.start||'0:0').split(':').map(Number);
  const [eh,em] = (dft.end||'0:0').split(':').map(Number);
  const soll = ((eh*60+em) - (sh*60+sm) - (dft.pause||0)) / 60;
  if(soll <= 0){ el.style.display = 'none'; return; }

  const ist = entry ? dayTotal(entry) : 0;
  const pct = Math.max(0, Math.min(100, Math.round((ist/soll)*100)));

  const R = 22, C = 2*Math.PI*R;
  const offset = C - (pct/100)*C;
  const isDark = document.body.classList.contains('dark');
  const trackColor = isDark ? '#2C3236' : '#E7EAEC';

  el.style.display = 'flex';
  el.innerHTML = `
    <svg width="56" height="56" viewBox="0 0 56 56" style="flex-shrink:0;transform:rotate(-90deg);">
      <circle cx="28" cy="28" r="${R}" fill="none" stroke="${trackColor}" stroke-width="6"/>
      <circle cx="28" cy="28" r="${R}" fill="none" stroke="var(--primary)" stroke-width="6"
        stroke-dasharray="${C}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
    </svg>
    <div style="margin-left:14px;">
      <div style="font-size:12px;color:var(--muted);">Heute erfasst</div>
      <div style="font-size:15px;margin-top:2px;"><b style="color:var(--text)">${fmtHours(ist)}</b> von ${fmtHours(soll)} Std <span style="color:var(--primary);font-weight:700;">(${pct}%)</span></div>
    </div>
  `;
}

/* ===== Month lock ===== */
function isMonthLocked(d){ return lockedMonths.includes(monthKey(d)); }

function renderLockState(){
  const locked = isMonthLocked(viewDate);
  const btn = document.getElementById('lockMonth');
  btn.textContent = locked ? '🔒 Gesperrt' : '🔓 Offen';
  btn.title = locked ? 'Monat ist gesperrt – zum Bearbeiten hier entsperren' : 'Monat abschließen (sperrt Bearbeitung)';
}

document.getElementById('lockMonth').addEventListener('click', () => {
  const key = monthKey(viewDate);
  const locked = lockedMonths.includes(key);
  if(locked){
    if(!window.confirm('Monat wirklich wieder entsperren und Bearbeitung erlauben?')) return;
    lockedMonths = lockedMonths.filter(k => k !== key);
    toast('Monat entsperrt');
  } else {
    if(!window.confirm(`${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()} abschließen? Einträge können dann nicht mehr geändert werden, bis du wieder entsperrst.`)) return;
    lockedMonths.push(key);
    toast('Monat abgeschlossen');
  }
  saveLockedMonths(lockedMonths);
  render();
});

/* ===== Notices: fehlender Tag & Backup-Erinnerung ===== */
function renderNotices(){
  const banner = document.getElementById('noticeBanner');
  const todayISO = toISODate(new Date());

  let message = null;

  // Allerhöchste Priorität: Speicher komplett blockiert (z.B. privater Modus) – nichts wird gespeichert
  if(!storageAvailable){
    banner.textContent = '';
    const span = document.createElement('span');
    span.textContent = '⚠️ Speicher nicht verfügbar (z.B. privater/inkognito Modus): Eingaben werden NICHT gespeichert! Bitte normalen Browser-Modus nutzen.';
    banner.appendChild(span);
    banner.style.display = 'flex';
    return;
  }

  // Höchste Priorität: beschädigte Daten wurden gerettet – das muss der Nutzer sehen
  if(dataIntegrityWarning){
    message = 'Achtung: Beim Laden gab es ein Problem mit gespeicherten Daten. Eine Rettungskopie wurde angelegt. Bitte zeitnah eine Datensicherung prüfen/erstellen!';
    banner.textContent = '';
    const span = document.createElement('span');
    span.textContent = message;
    banner.appendChild(span);
    banner.style.display = 'flex';
    return;
  }

  // 1x pro Tag prüfen, nicht bei jedem Render nerven
  const lastCheck = localStorage.getItem('sz_lastNoticeCheck');

  // fehlender Werktag (gestern, falls Mo-Fr und kein Eintrag)
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
  const yDow = yesterday.getDay();
  const yISO = toISODate(yesterday);
  if(lastCheck !== todayISO && yDow >= 1 && yDow <= 5 && !isHoliday(yesterday) && !days.find(d=>d.date===yISO)){
    message = `Für ${fmtDate(yesterday)} (${WEEKDAYS[yDow]}) wurde noch nichts erfasst.`;
  }

  // Backup-Erinnerung (nur wenn kein dringenderer Hinweis ansteht)
  if(!message && lastCheck !== todayISO){
    const last = settings.lastBackupAt ? new Date(settings.lastBackupAt) : null;
    const daysSince = last ? (Date.now() - last.getTime())/86400000 : Infinity;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const threshold = isIOS ? 10 : 30; // Safari/iOS kann lokale Daten bei langer Nichtnutzung löschen
    if(daysSince > threshold){
      message = last
        ? `Letzte Datensicherung ist ${Math.floor(daysSince)} Tage her. ${isIOS ? 'Auf iPhone/iPad kann Safari lokale Daten bei langer Nichtnutzung löschen – ' : ''}Zeit für eine neue?`
        : `Noch keine Datensicherung erstellt. In den Einstellungen nachholen?`;
    }
  }

  if(message){
    banner.textContent = '';
    const span = document.createElement('span');
    span.textContent = message;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => {
      banner.style.display = 'none';
      localStorage.setItem('sz_lastNoticeCheck', todayISO);
    });
    banner.appendChild(span);
    banner.appendChild(closeBtn);
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

/* ===== Kunden-Vorschläge (Autovervollständigung) ===== */
function populateKundenDatalist(){
  const names = new Set();
  days.forEach(d => (d.items||[]).forEach(it => { if(it.kunde) names.add(it.kunde); }));
  const list = document.getElementById('kundenListe');
  list.innerHTML = Array.from(names).sort().map(n => `<option value="${escapeHtml(n)}">`).join('');
}

/* ===== Rendering: calendar grid ===== */
let showKW = localStorage.getItem('sz_show_kw') === '1';
let showWeekSum = localStorage.getItem('sz_show_weeksum') !== '0'; // Standard: an
let selectMode = false;
let selectedDates = new Set();

function renderCalendar(monthDays){
  const y = viewDate.getFullYear(), m = viewDate.getMonth();
  const byDate = {};
  monthDays.forEach(d => byDate[d.date] = d);

  const firstOfMonth = new Date(y, m, 1);
  const offset = (firstOfMonth.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();
  const todayISO = toISODate(new Date());

  const cols = (showKW ? '0.5fr ' : '') + 'repeat(7,1fr)' + (showWeekSum ? ' 0.85fr' : '');
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = cols;

  const header = document.getElementById('calWeekdaysHeader');
  header.style.gridTemplateColumns = cols;
  header.innerHTML = (showKW ? '<span></span>' : '') +
    '<span>Mo</span><span>Di</span><span>Mi</span><span>Do</span><span>Fr</span><span>Sa</span><span>So</span>' +
    (showWeekSum ? '<span>Σ</span>' : '');

  // Flache Liste aller Zellen (führende/nachfolgende Monatsränder + echte Tage) aufbauen
  const cells = [];
  for(let i=offset-1; i>=0; i--){
    cells.push({muted:true, label: daysInPrevMonth - i});
  }
  for(let day=1; day<=daysInMonth; day++){
    const dateObj = new Date(y, m, day);
    cells.push({muted:false, day, dateObj, iso: toISODate(dateObj)});
  }
  const totalCells = offset + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for(let i=1; i<=trailing; i++){
    cells.push({muted:true, label:i});
  }

  // In 7er-Zeilen gruppieren, je Zeile eine Wochensummen-Zelle anhängen
  for(let rowStart=0; rowStart<cells.length; rowStart+=7){
    const rowCells = cells.slice(rowStart, rowStart+7);
    let weekSum = 0;

    if(showKW){
      const firstRealCell = rowCells.find(c => !c.muted);
      const kwCell = document.createElement('div');
      kwCell.className = 'cal-kw-label';
      kwCell.textContent = firstRealCell ? isoWeek(firstRealCell.dateObj) : '';
      grid.appendChild(kwCell);
    }

    rowCells.forEach(c => {
      const cell = document.createElement('div');
      if(c.muted){
        cell.className = 'cal-cell muted';
        cell.textContent = c.label;
        grid.appendChild(cell);
        return;
      }
      const entry = byDate[c.iso];
      cell.className = 'cal-cell';
      const dow = c.dateObj.getDay();
      if(dow === 0 || dow === 6) cell.classList.add('weekend');
      if(c.iso === todayISO) cell.classList.add('today');
      const holidayName = isHoliday(c.dateObj);
      if(holidayName) cell.classList.add('holiday');

      if(entry){
        cell.classList.add('has-entry', 'type-'+entry.type);
        cell.innerHTML = `<span>${c.day}</span><span class="hrs">${fmtHours(dayTotal(entry))}</span>`;
        weekSum += dayTotal(entry);
      } else {
        cell.innerHTML = `<span>${c.day}</span>`;
      }
      if(holidayName) cell.title = holidayName;
      cell.addEventListener('click', () => openDayModal(c.iso));
      grid.appendChild(cell);
    });

    if(showWeekSum){
      const sumCell = document.createElement('div');
      sumCell.className = 'cal-cell cal-weeksum';
      sumCell.innerHTML = weekSum > 0
        ? `<span class="hrs">${fmtHours(weekSum)}</span>`
        : `<span class="hrs muted-sum">–</span>`;
      grid.appendChild(sumCell);
    }
  }
}

document.getElementById('toggleKW').addEventListener('click', () => {
  showKW = !showKW;
  localStorage.setItem('sz_show_kw', showKW ? '1' : '0');
  document.getElementById('toggleKW').textContent = showKW ? 'KW ausblenden' : 'KW anzeigen';
  render();
});
document.getElementById('toggleKW').textContent = showKW ? 'KW ausblenden' : 'KW anzeigen';

document.getElementById('toggleWeekSum').addEventListener('click', () => {
  showWeekSum = !showWeekSum;
  localStorage.setItem('sz_show_weeksum', showWeekSum ? '1' : '0');
  document.getElementById('toggleWeekSum').textContent = showWeekSum ? 'Σ ausblenden' : 'Σ anzeigen';
  render();
});
document.getElementById('toggleWeekSum').textContent = showWeekSum ? 'Σ ausblenden' : 'Σ anzeigen';

/* ===== Rendering: month list ===== */
function render(){
  document.getElementById('monthLabel').textContent = `${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
  document.getElementById('employeeSubline').textContent = settings.name || 'Stundenzettel';
  const addrLine = document.getElementById('employeeAddressLine');
  addrLine.innerHTML = [settings.street, settings.city].filter(Boolean).map(escapeHtml).join('<br>');

  const y = viewDate.getFullYear(), m = viewDate.getMonth();
  const monthDays = days
    .filter(d => { const dt = fromISODate(d.date); return dt.getFullYear()===y && dt.getMonth()===m; })
    .sort((a,b)=> a.date.localeCompare(b.date));

  renderCalendar(monthDays);
  renderDashboard(monthDays);
  renderTodayStatus();
  renderLockState();
  renderNotices();

  const container = document.getElementById('listContainer');
  container.innerHTML = '';

  if(monthDays.length === 0){
    container.innerHTML = `<div class="empty-state">Noch keine Einträge für diesen Monat.<br>Tippe oben im Kalender auf einen Tag, um ihn zu erfassen.</div>`;
    return;
  }

  // group by ISO week
  const weeks = {};
  monthDays.forEach(d => {
    const dt = fromISODate(d.date);
    const wk = isoWeek(dt);
    if(!weeks[wk]) weeks[wk] = [];
    weeks[wk].push(d);
  });

  Object.keys(weeks).sort((a,b)=>a-b).forEach(wk => {
    const list = weeks[wk];
    const weekTotal = list.reduce((s,d)=> s + dayTotal(d), 0);

    const groupEl = document.createElement('div');
    groupEl.className = 'week-group';
    groupEl.innerHTML = `<div class="week-head"><span>Kalenderwoche ${wk}</span><span class="total">${fmtHours(weekTotal)} Std</span></div>`;

    list.forEach(d => {
     try{
      const dt = fromISODate(d.date);
      const card = document.createElement('div');
      card.className = 'day-card';
      card.dataset.date = d.date;

      let bodyHtml = '';
      if(d.type === 'work'){
        const items = d.items || [];
        bodyHtml = items.map(it => `
          <div class="item-line">
            <span class="k"><b>${escapeHtml(it.kunde || 'Büroarbeiten')}</b>${it.taetigkeit ? ' · ' + escapeHtml(it.taetigkeit) : ''}${it.nachtarbeit ? '<span class="zulage-badge">🌙 Nacht</span>' : ''}${it.schmutzzulage ? '<span class="zulage-badge">🧹 Schmutz</span>' : ''}</span>
            <span>${fmtHours(parseFloat(it.stunden)||0)}</span>
          </div>
          ${it.notiz ? `<div class="item-notiz">📝 ${escapeHtml(it.notiz)} <span class="notiz-tag">nur intern</span></div>` : ''}`).join('');
      } else {
        const labels = {urlaub:'Urlaub', krankheit:'Krankheit', schule:'Schule', feiertag:'Feiertag', abbau:'Überstundenabbau'};
        const safeClass = ['urlaub','krankheit','schule','feiertag','abbau'].includes(d.type) ? d.type : 'urlaub';
        const label = labels[d.type] || escapeHtml(String(d.type));
        bodyHtml = `<span class="badge ${safeClass}">${label}</span>`;
      }

      card.innerHTML = `
        <div class="day-row">
          <div>
            <div class="day-title">${WEEKDAYS[dt.getDay()]}</div>
            <div class="day-date">${fmtDate(dt)}${d.type==='work' && d.start ? ' · '+d.start+'–'+d.end+' Uhr' : ''}</div>
          </div>
          <div class="day-total">${fmtHours(dayTotal(d))}</div>
        </div>
        ${bodyHtml}
      `;

      if(selectMode){
        card.classList.add('select-mode');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'select-checkbox';
        checkbox.checked = selectedDates.has(d.date);
        checkbox.addEventListener('click', (e) => e.stopPropagation());
        checkbox.addEventListener('change', () => {
          if(checkbox.checked) selectedDates.add(d.date);
          else selectedDates.delete(d.date);
          updateShareSelectionBar();
        });
        const contentWrap = document.createElement('div');
        contentWrap.className = 'day-content';
        contentWrap.innerHTML = card.innerHTML;
        card.innerHTML = '';
        card.appendChild(checkbox);
        card.appendChild(contentWrap);
        card.addEventListener('click', () => {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        });
      } else {
        card.addEventListener('click', () => openDayModal(d.date));
      }
      groupEl.appendChild(card);
     }catch(err){
       console.error('Fehler beim Anzeigen eines Tages, übersprungen:', d?.date, err);
     }
    });

    container.appendChild(groupEl);
  });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ===== Day Modal ===== */
const dayModal = document.getElementById('dayModal');
const settingsModal = document.getElementById('settingsModal');

function defaultTimesFor(dateObj){
  const dow = dateObj.getDay(); // 0 Sun .. 6 Sat
  if(dow === 5){ return {start:settings.friStart, end:settings.friEnd, pause:settings.friPause}; }
  return {start:settings.monThuStart, end:settings.monThuEnd, pause:settings.monThuPause};
}

// Soll-Stunden für einen Werktag anhand der hinterlegten Standard-Arbeitszeiten (Mo-Do bzw. Fr).
// Wochenenden haben kein Soll, auch falls dort ausnahmsweise ein Arbeitstag erfasst wurde.
function sollHoursForDate(dateObj){
  const dow = dateObj.getDay();
  if(dow === 0 || dow === 6) return 0;
  const t = defaultTimesFor(dateObj);
  if(!t.start || !t.end) return 0;
  const [sh,sm] = t.start.split(':').map(Number);
  const [eh,em] = t.end.split(':').map(Number);
  const mins = (eh*60+em) - (sh*60+sm) - (parseFloat(t.pause)||0);
  return Math.max(0, mins/60);
}

// Überstunden-Bilanz: Arbeitstage zählen mit Ist-minus-Soll, manuelle Abbau-Einträge fließen
// direkt mit ein. Urlaub/Krankheit/Schule/Feiertag sowie Tage ohne Eintrag zählen nicht mit.
function overtimeDiffForDay(d){
  if(d.type === 'work'){
    return dayTotal(d) - sollHoursForDate(fromISODate(d.date));
  }
  if(d.type === 'abbau'){
    return dayTotal(d);
  }
  return 0;
}
function computeOvertimeBalance(daysList){
  return (settings.overtimeStartBalance || 0) + daysList.reduce((sum,d) => sum + overtimeDiffForDay(d), 0);
}

function applyReadOnlyMode(readOnly){
  const banner = document.getElementById('readOnlyBanner');
  if(banner) banner.style.display = readOnly ? 'block' : 'none';

  ['dayDate','dayStart','dayEnd','dayPause','abbauStunden','rangeToggle','rangeFrom','rangeTo','addItemBtn','copyPrevDayBtn'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.disabled = readOnly;
  });
  document.querySelectorAll('#typeTabs .type-tab').forEach(t => t.style.pointerEvents = readOnly ? 'none' : '');
  document.querySelectorAll('#itemsContainer input, #itemsContainer button').forEach(el => el.disabled = readOnly);
  document.getElementById('saveDay').style.display = readOnly ? 'none' : 'flex';
}

function openDayModal(targetDate){
  const checkDate = targetDate ? fromISODate(targetDate) : new Date();
  const existing = targetDate ? days.find(d=>d.date===targetDate) : null;
  const locked = isMonthLocked(checkDate);

  if(locked && !existing){
    toast('Monat ist abgeschlossen – keine neuen Einträge möglich');
    return;
  }

  applyReadOnlyMode(locked);
  populateKundenDatalist();

  editingDate = existing ? existing.date : null;

  document.getElementById('dayModalTitle').textContent = locked ? 'Tag ansehen (gesperrt)' : (existing ? 'Tag bearbeiten' : 'Tag erfassen');
  document.getElementById('deleteDay').style.display = (existing && !locked) ? 'block' : 'none';
  document.getElementById('copyPrevDayBtn').style.display = existing ? 'none' : 'block';
  document.getElementById('rangeToggle').checked = false;
  document.getElementById('rangeDates').style.display = 'none';
  document.getElementById('rangeToggle').closest('.toggle-row').style.display = existing ? 'none' : 'flex';

  const dateInput = document.getElementById('dayDate');
  dateInput.value = existing ? existing.date : (targetDate || toISODate(new Date()));
  dateInput.onchange = () => handleDateChange();

  document.getElementById('itemsContainer').innerHTML = '';

  if(existing){
    setActiveType(existing.type);
    if(existing.type === 'work'){
      document.getElementById('dayStart').value = existing.start || '';
      document.getElementById('dayEnd').value = existing.end || '';
      document.getElementById('dayPause').value = existing.pause != null ? existing.pause : '';
      (existing.items||[]).forEach(it => addItemRow(it));
      if((existing.items||[]).length === 0) addItemRow();
    } else if(existing.type === 'abbau'){
      document.getElementById('abbauStunden').value = existing.abbauStunden != null ? existing.abbauStunden : -5;
    }
  } else {
    setActiveType('work');
    const dt = fromISODate(dateInput.value);
    const dft = defaultTimesFor(dt);
    document.getElementById('dayStart').value = dft.start;
    document.getElementById('dayEnd').value = dft.end;
    document.getElementById('dayPause').value = dft.pause;
    addItemRow();
    document.getElementById('abbauStunden').value = -5;
  }

  updateDayTotalDisplay();
  applyReadOnlyMode(locked);
  dayModal.classList.add('open');
}

function handleDateChange(){
  // if switching to a date with an existing entry (and we're in "new" mode), load it for editing
  const dateInput = document.getElementById('dayDate');
  const val = dateInput.value;
  const existing = days.find(d=>d.date===val);
  if(existing){
    openDayModal(val);
    return;
  }
  editingDate = null;
  document.getElementById('deleteDay').style.display = 'none';
  document.getElementById('dayModalTitle').textContent = 'Tag erfassen';
  const activeType = document.querySelector('.type-tab.active').dataset.type;
  if(activeType === 'work'){
    const dt = fromISODate(val);
    const dft = defaultTimesFor(dt);
    document.getElementById('dayStart').value = dft.start;
    document.getElementById('dayEnd').value = dft.end;
    document.getElementById('dayPause').value = dft.pause;
  }
  updateDayTotalDisplay();
}

function setActiveType(type){
  document.querySelectorAll('.type-tab').forEach(t => t.classList.toggle('active', t.dataset.type===type));
  document.getElementById('workFields').style.display = type==='work' ? 'block' : 'none';
  document.getElementById('abbauFields').style.display = type==='abbau' ? 'block' : 'none';
  const isRangeable = ['urlaub','krankheit','schule','feiertag'].includes(type);
  document.getElementById('rangeFields').style.display = isRangeable ? 'block' : 'none';
  if(!isRangeable){
    document.getElementById('rangeToggle').checked = false;
    document.getElementById('rangeDates').style.display = 'none';
  }
}

document.getElementById('typeTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.type-tab');
  if(!tab) return;
  setActiveType(tab.dataset.type);
  updateDayTotalDisplay();
});

document.getElementById('rangeToggle').addEventListener('change', (e) => {
  document.getElementById('rangeDates').style.display = e.target.checked ? 'block' : 'none';
  if(e.target.checked){
    const current = document.getElementById('dayDate').value;
    if(current){
      document.getElementById('rangeFrom').value = current;
      document.getElementById('rangeTo').value = current;
    }
  }
});

function addItemRow(existing){
  const id = existing?.id || uid();
  const wrap = document.createElement('div');
  wrap.className = 'item-card';
  wrap.dataset.id = id;
  wrap.innerHTML = `
    <button type="button" class="remove-item">✕</button>
    <label style="margin-top:0;">Kunde</label>
    <input type="text" class="it-kunde" list="kundenListe" placeholder="z.B. Familie Meyer, Büroarbeiten..." value="${existing? escapeHtml(existing.kunde||'') : ''}">
    <div class="typo-hint" style="display:none;"></div>
    <label>Tätigkeit</label>
    <input type="text" class="it-taetigkeit" placeholder="Ausgeführte Arbeit" value="${existing? escapeHtml(existing.taetigkeit||'') : ''}">
    <label>Stunden</label>
    <input type="number" class="it-stunden" step="0.25" min="0" max="24" value="${existing? existing.stunden : ''}">
    <div class="zulage-row">
      <button type="button" class="zulage-btn ${existing?.nachtarbeit ? 'active' : ''}" data-flag="nachtarbeit">🌙 Nachtarbeit</button>
      <button type="button" class="zulage-btn ${existing?.schmutzzulage ? 'active' : ''}" data-flag="schmutzzulage">🧹 Schmutzzulage</button>
    </div>
    <label>📝 Notiz <span style="font-weight:400;color:var(--muted);">– nur in der App sichtbar, nicht im PDF</span></label>
    <div style="display:flex;gap:6px;">
      <input type="text" class="it-notiz" placeholder="z.B. Ersatzteil nachbestellen..." value="${existing? escapeHtml(existing.notiz||'') : ''}" style="flex:1;">
      <button type="button" class="mic-btn" title="Diktieren">🎤</button>
    </div>
  `;
  wrap.querySelectorAll('.zulage-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });
  wrap.querySelector('.remove-item').addEventListener('click', () => {
    wrap.remove();
    updateDayTotalDisplay();
  });
  wrap.querySelectorAll('input').forEach(inp => inp.addEventListener('input', updateDayTotalDisplay));
  wrap.querySelector('.it-kunde').addEventListener('blur', (e) => checkTypo(e.target, wrap.querySelector('.typo-hint')));
  setupVoiceInput(wrap.querySelector('.mic-btn'), wrap.querySelector('.it-notiz'));
  document.getElementById('itemsContainer').appendChild(wrap);
}

/* ===== Spracheingabe (Notizfeld) ===== */
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

function setupVoiceInput(btn, inputEl){
  if(!SpeechRecognitionAPI){
    btn.style.display = 'none';
    return;
  }
  btn.addEventListener('click', () => {
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'de-DE';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    btn.textContent = '🔴';
    recognition.start();

    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      inputEl.value = inputEl.value ? `${inputEl.value} ${text}` : text;
    };
    recognition.onerror = () => { toast('Spracheingabe fehlgeschlagen'); };
    recognition.onend = () => { btn.textContent = '🎤'; };
  });
}

/* ===== Tippfehler-Check ===== */
function levenshtein(a, b){
  const m = a.length, n = b.length;
  if(m === 0) return n;
  if(n === 0) return m;
  const dp = Array.from({length: m+1}, () => new Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0] = i;
  for(let j=0;j<=n;j++) dp[0][j] = j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      const cost = a[i-1]===b[j-1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    }
  }
  return dp[m][n];
}

function checkTypo(inputEl, hintEl){
  const val = inputEl.value.trim();
  hintEl.style.display = 'none';
  if(val.length < 4) return;

  const known = new Set();
  days.forEach(d => (d.items||[]).forEach(it => { if(it.kunde) known.add(it.kunde); }));

  const valLower = val.toLowerCase();
  let closest = null, closestDist = Infinity;
  known.forEach(name => {
    if(name.toLowerCase() === valLower) return; // exact match, no hint needed
    const dist = levenshtein(valLower, name.toLowerCase());
    if(dist < closestDist){ closestDist = dist; closest = name; }
  });

  if(closest && closestDist >= 1 && closestDist <= 2){
    hintEl.textContent = `Meintest du „${closest}"? (ähnlicher Name bereits vorhanden)`;
    hintEl.style.display = 'block';
  }
}

document.getElementById('addItemBtn').addEventListener('click', () => addItemRow());

document.getElementById('copyPrevDayBtn').addEventListener('click', () => {
  const currentDate = document.getElementById('dayDate').value;
  const prevWork = days
    .filter(d => d.type === 'work' && d.date < currentDate)
    .sort((a,b) => b.date.localeCompare(a.date))[0];

  if(!prevWork){ toast('Kein vorheriger Arbeitstag gefunden'); return; }

  document.getElementById('dayStart').value = prevWork.start || '';
  document.getElementById('dayEnd').value = prevWork.end || '';
  document.getElementById('dayPause').value = prevWork.pause != null ? prevWork.pause : '';
  document.getElementById('itemsContainer').innerHTML = '';
  (prevWork.items||[]).forEach(it => addItemRow(it));
  updateDayTotalDisplay();
  toast(`Übernommen von ${fmtDate(fromISODate(prevWork.date))}`);
});

function collectItems(){
  return Array.from(document.querySelectorAll('#itemsContainer .item-card')).map(card => ({
    id: card.dataset.id,
    kunde: card.querySelector('.it-kunde').value.trim(),
    taetigkeit: card.querySelector('.it-taetigkeit').value.trim(),
    stunden: parseFloat(card.querySelector('.it-stunden').value) || 0,
    notiz: card.querySelector('.it-notiz').value.trim(),
    nachtarbeit: card.querySelector('[data-flag="nachtarbeit"]').classList.contains('active'),
    schmutzzulage: card.querySelector('[data-flag="schmutzzulage"]').classList.contains('active')
  }));
}

function updateDayTotalDisplay(){
  const type = document.querySelector('.type-tab.active').dataset.type;
  let total = 0;
  if(type === 'work'){
    total = collectItems().reduce((s,i)=>s+i.stunden,0);
  } else if(type === 'abbau'){
    total = parseFloat(document.getElementById('abbauStunden').value) || 0;
  }
  document.getElementById('dayTotalDisplay').textContent = fmtHours(total);
}
document.getElementById('abbauStunden').addEventListener('input', updateDayTotalDisplay);

document.getElementById('saveDay').addEventListener('click', () => {
  const type = document.querySelector('.type-tab.active').dataset.type;
  const isRangeable = ['urlaub','krankheit','schule','feiertag'].includes(type);
  const rangeOn = isRangeable && document.getElementById('rangeToggle').checked;

  if(rangeOn){
    const from = document.getElementById('rangeFrom').value;
    const to = document.getElementById('rangeTo').value;
    if(!from || !to){ toast('Bitte Von und Bis wählen'); return; }
    if(to < from){ toast('"Bis" muss nach "Von" liegen'); return; }

    const datesToCreate = [];
    let skippedLocked = 0;
    let skippedHolidays = 0;
    let cur = fromISODate(from);
    const end = fromISODate(to);
    while(cur <= end){
      const dow = cur.getDay();
      if(dow >= 1 && dow <= 5){
        if(type !== 'feiertag' && isHoliday(cur)){
          skippedHolidays++;
        } else if(isMonthLocked(cur)){
          skippedLocked++;
        } else {
          datesToCreate.push(toISODate(cur));
        }
      }
      cur = addDays(cur, 1);
    }
    if(datesToCreate.length === 0){
      toast(skippedLocked > 0 ? 'Alle Tage liegen in einem gesperrten Monat' : 'Keine Werktage im gewählten Zeitraum');
      return;
    }

    const existingCount = datesToCreate.filter(iso => days.find(d=>d.date===iso)).length;
    if(existingCount > 0){
      const ok = window.confirm(`${existingCount} von ${datesToCreate.length} Werktagen haben bereits einen Eintrag – diese werden überschrieben. Fortfahren?`);
      if(!ok) return;
    }

    datesToCreate.forEach(iso => {
      days = days.filter(d => d.date !== iso);
      days.push({date: iso, type});
    });
    const saveOk = saveDays(days);
    closeDayModal();
    render();
    let msg = `${datesToCreate.length} Werktage eingetragen`;
    const extras = [];
    if(skippedHolidays > 0) extras.push(`${skippedHolidays} Feiertag(e) übersprungen`);
    if(skippedLocked > 0) extras.push(`${skippedLocked} in gesperrtem Monat übersprungen`);
    if(extras.length) msg += ` (${extras.join(', ')})`;
    toast(saveOk ? msg : '⚠️ Speichern fehlgeschlagen – Speicher voll oder blockiert?');
    return;
  }

  const date = document.getElementById('dayDate').value;
  if(!date){ toast('Bitte ein Datum wählen'); return; }
  if(isMonthLocked(fromISODate(date))){ toast('Monat ist abgeschlossen'); return; }

  const existingOther = days.find(d => d.date === date);
  if(existingOther && editingDate !== date){
    const ok = window.confirm(`Für ${fmtDate(fromISODate(date))} existiert bereits ein Eintrag. Wirklich überschreiben?`);
    if(!ok) return;
  }

  let record = { date, type };
  if(type === 'work'){
    const items = collectItems().filter(i => i.kunde || i.taetigkeit || i.stunden);
    if(items.length === 0){ toast('Mindestens einen Eintrag hinzufügen'); return; }
    const negativeItem = items.find(i => i.stunden < 0);
    if(negativeItem){ toast(`Stunden bei "${negativeItem.kunde||'Büroarbeiten'}" dürfen nicht negativ sein`); return; }
    const dayTotalHours = items.reduce((s,i)=>s+i.stunden,0);
    if(dayTotalHours > 24){
      const ok = window.confirm(`Tagessumme liegt bei ${fmtHours(dayTotalHours)} Std – das ist mehr als ein Tag hat. Trotzdem speichern?`);
      if(!ok) return;
    }
    record.start = document.getElementById('dayStart').value;
    record.end = document.getElementById('dayEnd').value;
    record.pause = parseFloat(document.getElementById('dayPause').value) || 0;
    record.items = items;
  } else if(type === 'abbau'){
    record.abbauStunden = parseFloat(document.getElementById('abbauStunden').value) || 0;
  }

  days = days.filter(d => d.date !== date); // replace if exists
  days.push(record);
  const saveOk = saveDays(days);
  closeDayModal();
  render();
  toast(saveOk ? 'Gespeichert' : '⚠️ Speichern fehlgeschlagen – Speicher voll oder blockiert?');
});

document.getElementById('deleteDay').addEventListener('click', () => {
  if(!editingDate) return;
  const ok = window.confirm(`Eintrag für ${fmtDate(fromISODate(editingDate))} wirklich löschen? Das kann nicht rückgängig gemacht werden.`);
  if(!ok) return;
  days = days.filter(d => d.date !== editingDate);
  const saveOk = saveDays(days);
  closeDayModal();
  render();
  toast(saveOk ? 'Tag gelöscht' : '⚠️ Löschen konnte nicht gespeichert werden!');
});

function closeDayModal(){ dayModal.classList.remove('open'); }
document.getElementById('closeDayModal').addEventListener('click', closeDayModal);
dayModal.addEventListener('click', (e) => { if(e.target === dayModal) closeDayModal(); });

/* ===== Settings Modal ===== */
function simpleHash(str){
  let h = 0;
  for(let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) >>> 0; }
  return h.toString(36);
}

function openSettings(){
  initExportUI();
  document.getElementById('setName').value = settings.name;
  document.getElementById('setStreet').value = settings.street;
  document.getElementById('setCity').value = settings.city;
  document.getElementById('setUrlaubstage').value = settings.urlaubstage != null ? settings.urlaubstage : 30;
  document.getElementById('setUrlaubVorApp').value = settings.urlaubVorAppStart || 0;
  document.getElementById('setOvertimeStart').value = settings.overtimeStartBalance || 0;
  document.getElementById('setEmailRecipient').value = settings.emailRecipient || '';
  document.getElementById('setMonThuStart').value = settings.monThuStart;
  document.getElementById('setMonThuEnd').value = settings.monThuEnd;
  document.getElementById('setMonThuPause').value = settings.monThuPause;
  document.getElementById('setFriStart').value = settings.friStart;
  document.getElementById('setFriEnd').value = settings.friEnd;
  document.getElementById('setFriPause').value = settings.friPause;
  document.getElementById('setShowOfficeShare').checked = !!settings.showOfficeShare;
  document.getElementById('setTileUrlaub').checked = settings.tileUrlaub !== false;
  document.getElementById('setTileKrank').checked = settings.tileKrank !== false;
  document.getElementById('setTileSchule').checked = settings.tileSchule !== false;
  document.getElementById('setTileAbbau').checked = settings.tileAbbau !== false;
  document.getElementById('setTileOvertime').checked = settings.tileOvertime !== false;
  document.getElementById('setTileKunden').checked = settings.tileKunden !== false;
  document.getElementById('setDarkMode').checked = !!settings.darkMode;
  document.getElementById('setAutoSnapshot').checked = isAutoSnapshotEnabled();
  document.getElementById('setPinEnabled').checked = !!settings.pinEnabled;
  document.getElementById('setPinNew').value = '';
  document.getElementById('setPinConfirm').value = '';
  document.getElementById('pinSetupFields').style.display = settings.pinEnabled ? 'block' : 'none';
  document.getElementById('pinExistingHint').style.display = (settings.pinEnabled && settings.pinHash) ? 'block' : 'none';
  document.getElementById('lastBackupInfo').textContent = settings.lastBackupAt
    ? `Letzte Sicherung: ${new Date(settings.lastBackupAt).toLocaleString('de-DE')}`
    : 'Noch keine Sicherung erstellt.';
  settingsModal.classList.add('open');
}
document.getElementById('btnSettings').addEventListener('click', openSettings);
document.getElementById('closeSettings').addEventListener('click', () => settingsModal.classList.remove('open'));
settingsModal.addEventListener('click', (e) => { if(e.target === settingsModal) settingsModal.classList.remove('open'); });

document.getElementById('setPinEnabled').addEventListener('change', (e) => {
  document.getElementById('pinSetupFields').style.display = e.target.checked ? 'block' : 'none';
});

function applyDarkMode(){
  document.body.classList.toggle('dark', !!settings.darkMode);
}

document.getElementById('saveSettings').addEventListener('click', () => {
  const pinEnabled = document.getElementById('setPinEnabled').checked;
  const pinNew = document.getElementById('setPinNew').value.trim();
  const pinConfirm = document.getElementById('setPinConfirm').value.trim();

  let pinHash = settings.pinHash;
  if(pinEnabled){
    if(pinNew || pinConfirm){
      if(!/^\d{4}$/.test(pinNew)){ toast('PIN muss genau 4 Ziffern haben'); return; }
      if(pinNew !== pinConfirm){ toast('PINs stimmen nicht überein'); return; }
      pinHash = simpleHash(pinNew);
    } else if(!pinHash){
      toast('Bitte einen PIN festlegen');
      return;
    }
  } else {
    pinHash = null;
  }

  const urlaubstageRaw = parseFloat(document.getElementById('setUrlaubstage').value) || 0;
  if(urlaubstageRaw < 0){ toast('Jahresurlaubstage können nicht negativ sein'); return; }
  const urlaubVorAppRaw = parseFloat(document.getElementById('setUrlaubVorApp').value) || 0;
  if(urlaubVorAppRaw < 0){ toast('Bereits genommene Urlaubstage können nicht negativ sein'); return; }
  const overtimeStartRaw = parseFloat(document.getElementById('setOvertimeStart').value) || 0;

  settings = {
    ...settings,
    name: document.getElementById('setName').value.trim(),
    street: document.getElementById('setStreet').value.trim(),
    city: document.getElementById('setCity').value.trim(),
    urlaubstage: urlaubstageRaw,
    urlaubVorAppStart: urlaubVorAppRaw,
    overtimeStartBalance: overtimeStartRaw,
    emailRecipient: document.getElementById('setEmailRecipient').value.trim(),
    monThuStart: document.getElementById('setMonThuStart').value,
    monThuEnd: document.getElementById('setMonThuEnd').value,
    monThuPause: parseFloat(document.getElementById('setMonThuPause').value) || 0,
    friStart: document.getElementById('setFriStart').value,
    friEnd: document.getElementById('setFriEnd').value,
    friPause: parseFloat(document.getElementById('setFriPause').value) || 0,
    showOfficeShare: document.getElementById('setShowOfficeShare').checked,
    tileUrlaub: document.getElementById('setTileUrlaub').checked,
    tileKrank: document.getElementById('setTileKrank').checked,
    tileSchule: document.getElementById('setTileSchule').checked,
    tileAbbau: document.getElementById('setTileAbbau').checked,
    tileOvertime: document.getElementById('setTileOvertime').checked,
    tileKunden: document.getElementById('setTileKunden').checked,
    darkMode: document.getElementById('setDarkMode').checked,
    pinEnabled, pinHash,
  };
  const saveOk = saveSettings(settings);
  setAutoSnapshotEnabled(document.getElementById('setAutoSnapshot').checked);
  applyDarkMode();
  settingsModal.classList.remove('open');
  render();
  toast(saveOk ? 'Einstellungen gespeichert' : '⚠️ Speichern fehlgeschlagen – Speicher voll oder blockiert?');
});

/* ===== Search ===== */
const searchModal = document.getElementById('searchModal');
let searchTypeFilter = '';
let searchMatchAll = true; // true = UND, false = ODER

document.getElementById('btnSearch').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchDateFrom').value = '';
  document.getElementById('searchDateTo').value = '';
  document.getElementById('searchResults').innerHTML = '';
  searchTypeFilter = '';
  searchMatchAll = true;
  updateMatchModeUI();
  document.querySelectorAll('#searchTypeFilter .type-tab').forEach(t => t.classList.toggle('active', t.dataset.type===''));
  searchModal.classList.add('open');
  setTimeout(()=> document.getElementById('searchInput').focus(), 150);
});
document.getElementById('closeSearch').addEventListener('click', () => searchModal.classList.remove('open'));
searchModal.addEventListener('click', (e) => { if(e.target === searchModal) searchModal.classList.remove('open'); });

document.getElementById('searchInput').addEventListener('input', () => runSearch());
document.getElementById('searchDateFrom').addEventListener('change', () => runSearch());
document.getElementById('searchDateTo').addEventListener('change', () => runSearch());

document.getElementById('searchTypeFilter').addEventListener('click', (e) => {
  const tab = e.target.closest('.type-tab');
  if(!tab) return;
  document.querySelectorAll('#searchTypeFilter .type-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  searchTypeFilter = tab.dataset.type;
  runSearch();
});

function updateMatchModeUI(){
  const btn = document.getElementById('searchMatchMode');
  const hint = document.getElementById('searchMatchModeHint');
  if(searchMatchAll){
    btn.textContent = 'Alle Wörter müssen vorkommen';
    hint.textContent = 'Beispiel „Meise Wärmepumpe": findet nur Einträge, die beide Wörter enthalten.';
  } else {
    btn.textContent = 'Mind. ein Wort reicht';
    hint.textContent = 'Beispiel „Meise Wärmepumpe": findet Einträge mit mindestens einem der beiden Wörter.';
  }
}

document.getElementById('searchMatchMode').addEventListener('click', () => {
  searchMatchAll = !searchMatchAll;
  updateMatchModeUI();
  runSearch();
});

function highlightWords(text, words){
  if(!text) return '';
  let out = escapeHtml(text);
  words.forEach(w => {
    if(!w) return;
    const re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'ig');
    out = out.replace(re, '<b style="background:rgba(27,75,102,0.18);border-radius:2px;">$1</b>');
  });
  return out;
}

function runSearch(){
  const resultsEl = document.getElementById('searchResults');
  const rawQ = document.getElementById('searchInput').value.trim().toLowerCase();
  const words = rawQ.split(/\s+/).filter(Boolean);
  const dateFrom = document.getElementById('searchDateFrom').value;
  const dateTo = document.getElementById('searchDateTo').value;
  const typeLabels = {urlaub:'Urlaub', krankheit:'Krankheit', schule:'Schule', feiertag:'Feiertag', abbau:'Überstundenabbau'};

  const hasFilters = words.length > 0 || dateFrom || dateTo || searchTypeFilter;
  if(!hasFilters){ resultsEl.innerHTML = ''; return; }

  const matchText = (text) => {
    if(words.length === 0) return true;
    const t = text.toLowerCase();
    return searchMatchAll ? words.every(w => t.includes(w)) : words.some(w => t.includes(w));
  };

  const matches = [];
  days.forEach(day => {
    if(dateFrom && day.date < dateFrom) return;
    if(dateTo && day.date > dateTo) return;
    if(searchTypeFilter && day.type !== searchTypeFilter) return;

    if(day.type === 'work'){
      (day.items||[]).forEach(it => {
        const combined = `${it.kunde||''} ${it.taetigkeit||''}`;
        if(matchText(combined)){
          matches.push({date: day.date, kunde: it.kunde||'Büroarbeiten', taetigkeit: it.taetigkeit||'', stunden: it.stunden});
        }
      });
    } else {
      const label = typeLabels[day.type] || day.type;
      if(matchText(label)){
        matches.push({date: day.date, kunde: label, taetigkeit: '', stunden: dayTotal(day)});
      }
    }
  });

  matches.sort((a,b)=> b.date.localeCompare(a.date));

  if(matches.length === 0){
    resultsEl.innerHTML = `<div class="search-empty">Keine Treffer</div>`;
    return;
  }

  resultsEl.innerHTML = matches.map(m => {
    const dt = fromISODate(m.date);
    return `<div class="search-result" data-date="${m.date}">
      <div class="sr-top"><span>${highlightWords(m.kunde, words)}</span><span>${fmtHours(m.stunden)} Std</span></div>
      <div class="sr-sub">${fmtDate(dt)}${m.taetigkeit ? ' · ' + highlightWords(m.taetigkeit, words) : ''}</div>
    </div>`;
  }).join('');

  resultsEl.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      const date = el.dataset.date;
      const dt = fromISODate(date);
      viewDate = new Date(dt.getFullYear(), dt.getMonth(), 1);
      searchModal.classList.remove('open');
      render();
      openDayModal(date);
    });
  });
}

/* ===== Hilfe ===== */
const helpModal = document.getElementById('helpModal');
document.getElementById('btnOpenHelp').addEventListener('click', () => {
  settingsModal.classList.remove('open');
  helpModal.classList.add('open');
});
document.getElementById('closeHelp').addEventListener('click', () => helpModal.classList.remove('open'));
helpModal.addEventListener('click', (e) => { if(e.target === helpModal) helpModal.classList.remove('open'); });

/* ===== QR-Code zur Installation ===== */
const qrModal = document.getElementById('qrModal');
document.getElementById('btnShowQr').addEventListener('click', () => {
  const url = window.location.origin + window.location.pathname;
  document.getElementById('qrUrlText').textContent = url;
  const container = document.getElementById('qrCodeContainer');
  container.innerHTML = '';
  try{
    new QRCode(container, { text: url, width: 200, height: 200, colorDark: '#1B4B66', colorLight: '#ffffff' });
  }catch(e){
    container.innerHTML = `<div class="settings-hint">QR-Code konnte nicht erzeugt werden (Internet nötig beim ersten Laden). Link unten kann trotzdem geteilt werden.</div>`;
  }
  qrModal.classList.add('open');
});
document.getElementById('closeQr').addEventListener('click', () => qrModal.classList.remove('open'));
qrModal.addEventListener('click', (e) => { if(e.target === qrModal) qrModal.classList.remove('open'); });

document.getElementById('btnCopyLink').addEventListener('click', async () => {
  const url = document.getElementById('qrUrlText').textContent;
  try{
    await navigator.clipboard.writeText(url);
    toast('Link kopiert');
  }catch(e){
    toast('Kopieren nicht möglich – Link manuell markieren');
  }
});

/* ===== Backup: Export / Import ===== */
function markBackupDone(){
  settings = {...settings, lastBackupAt: new Date().toISOString()};
  saveSettings(settings);
  document.getElementById('lastBackupInfo').textContent = `Letzte Sicherung: ${new Date(settings.lastBackupAt).toLocaleString('de-DE')}`;
}

document.getElementById('btnBackupExport').addEventListener('click', async () => {
  const payload = {
    app: 'stundenzettel-john-haustechnik',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    days
  };
  const json = JSON.stringify(payload, null, 2);
  const fname = `Stundenzettel-Sicherung_${settings.name ? settings.name.replace(/\s+/g,'-')+'_' : ''}${toISODate(new Date())}.json`;
  const blob = new Blob([json], {type:'application/json'});

  const sortedDates = days.map(d=>d.date).sort();
  const historyEntry = {
    timestamp: new Date().toISOString(),
    fname,
    type: 'full',
    dayCount: days.length,
    firstDate: sortedDates[0] || null,
    lastDate: sortedDates[sortedDates.length-1] || null,
    json
  };
  saveShareHistory([historyEntry, ...loadShareHistory()].slice(0,5));

  try{
    const file = new File([blob], fname, {type:'application/json'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:'Stundenzettel Datensicherung'});
      markBackupDone();
      toast('Sicherung geteilt');
      return;
    }
  }catch(e){ /* fall through to download */ }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  markBackupDone();
  toast('Sicherung heruntergeladen');
});

document.getElementById('btnBackupImport').addEventListener('click', () => {
  document.getElementById('backupFileInput').click();
});

document.getElementById('backupFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try{ data = JSON.parse(reader.result); }
    catch(err){ toast('Datei ungültig'); return; }

    if(!data || !Array.isArray(data.days) || typeof data.settings !== 'object'){
      toast('Keine gültige Sicherungsdatei');
      return;
    }

    const { valid: cleanDays, rejected } = sanitizeImportedDays(data.days);
    const backupCount = cleanDays.length;
    const currentCount = days.length;
    let rangeInfo = 'keine Einträge';
    if(backupCount > 0){
      const sortedDates = cleanDays.map(d=>d.date).sort();
      rangeInfo = `${fmtDate(fromISODate(sortedDates[0]))} – ${fmtDate(fromISODate(sortedDates[sortedDates.length-1]))}`;
    }

    const ok = window.confirm(
      `Sicherung vom ${data.exportedAt ? new Date(data.exportedAt).toLocaleString('de-DE') : 'unbekannt'}\n\n` +
      `Enthält: ${backupCount} Tag(e), Zeitraum ${rangeInfo}` +
      (rejected > 0 ? `\n${rejected} Eintrag/Einträge waren ungültig und werden übersprungen.` : '') +
      `\nAktuell auf diesem Handy: ${currentCount} Tag(e)\n\n` +
      `Alle aktuellen Daten auf diesem Handy werden dabei ERSETZT. Fortfahren?`
    );
    if(!ok) return;

    settings = Object.assign({...DEFAULT_SETTINGS}, data.settings);
    days = cleanDays;
    const ok1 = saveSettings(settings);
    const ok2 = saveDays(days);
    render();
    settingsModal.classList.remove('open');
    toast((ok1 && ok2) ? 'Sicherung wiederhergestellt' : '⚠️ Wiederherstellen unvollständig gespeichert!');
  };
  reader.readAsText(file);
  e.target.value = '';
});

/* ===== Jahresübersicht ===== */
const analyticsModal = document.getElementById('analyticsModal');
let analyticsYear = new Date().getFullYear();

document.getElementById('btnAnalytics').addEventListener('click', () => {
  analyticsYear = viewDate.getFullYear();
  renderAnalytics();
  analyticsModal.classList.add('open');
});
document.getElementById('closeAnalytics').addEventListener('click', () => analyticsModal.classList.remove('open'));
analyticsModal.addEventListener('click', (e) => { if(e.target === analyticsModal) analyticsModal.classList.remove('open'); });
document.getElementById('prevYear').addEventListener('click', () => { analyticsYear--; renderAnalytics(); });
document.getElementById('nextYear').addEventListener('click', () => { analyticsYear++; renderAnalytics(); });

function firstDataYear(fallbackYear){
  if(days.length === 0) return fallbackYear;
  return Math.min(...days.map(d => fromISODate(d.date).getFullYear()));
}

function computeUrlaubCarryIn(year){
  const minYear = firstDataYear(year);
  let carry = 0;
  for(let y = minYear; y < year; y++){
    let genommen = days.filter(d => d.type==='urlaub' && fromISODate(d.date).getFullYear()===y).length;
    if(y === minYear) genommen += (settings.urlaubVorAppStart || 0);
    const effective = (settings.urlaubstage||0) + carry;
    carry = effective - genommen;
  }
  return carry;
}

function renderAnalytics(){
  document.getElementById('yearLabel').textContent = analyticsYear;

  const yearDays = days.filter(d => fromISODate(d.date).getFullYear() === analyticsYear);

  const totalStd = yearDays.reduce((s,d)=> s + dayTotal(d), 0);
  const urlaubBasis = settings.urlaubstage || 0;
  const carryIn = computeUrlaubCarryIn(analyticsYear);
  const urlaubGesamt = urlaubBasis + carryIn;
  const preAppGenommen = (analyticsYear === firstDataYear(analyticsYear)) ? (settings.urlaubVorAppStart || 0) : 0;
  const urlaubGenommen = yearDays.filter(d=>d.type==='urlaub').length + preAppGenommen;
  const urlaubRest = urlaubGesamt - urlaubGenommen; // kann jetzt negativ sein (Vorgriff)
  const krankTage = yearDays.filter(d=>d.type==='krankheit').length;
  const schuleTage = yearDays.filter(d=>d.type==='schule').length;
  const kundenCount = countDistinctKunden(yearDays);

  const carryLine = carryIn !== 0
    ? `<div class="settings-hint" style="margin:6px 0 0;">Basis ${urlaubBasis} Tage ${carryIn > 0 ? '+' : '–'} ${Math.abs(carryIn)} Tag(e) ${carryIn > 0 ? 'Resturlaub' : 'Vorgriff'} aus Vorjahr(en) = ${urlaubGesamt} Tage gesamt</div>`
    : '';
  const preAppLine = preAppGenommen > 0
    ? `<div class="settings-hint" style="margin:2px 0 0;">Davon ${preAppGenommen} Tag(e) bereits vor App-Nutzung genommen (in den Profil-Einstellungen hinterlegt)</div>`
    : '';

  document.getElementById('yearDashboard').innerHTML = `
    <div class="settings-hint" style="margin:0 0 6px;">Urlaubskonto</div>
    <div class="dashboard" style="grid-template-columns:repeat(3,1fr);margin:0 0 14px;">
      <div class="dash-card"><div class="v">${urlaubGesamt}</div><div class="l">TAGE GESAMT</div></div>
      <div class="dash-card"><div class="v">${urlaubGenommen}</div><div class="l">GENOMMEN</div></div>
      <div class="dash-card"><div class="v" style="${urlaubRest < 0 ? 'color:var(--danger);' : ''}">${urlaubRest}</div><div class="l">ÜBRIG</div></div>
    </div>
    ${carryLine}
    ${preAppLine}
    <div class="settings-hint" style="margin:14px 0 6px;">Sonstiges</div>
    <div class="dashboard" style="grid-template-columns:repeat(4,1fr);margin:0;">
      <div class="dash-card"><div class="v">${fmtHours(totalStd)}</div><div class="l">STD GESAMT</div></div>
      <div class="dash-card"><div class="v">${krankTage}</div><div class="l">KRANK</div></div>
      <div class="dash-card"><div class="v">${schuleTage}</div><div class="l">SCHULE</div></div>
      <div class="dash-card"><div class="v">${kundenCount}</div><div class="l">KUNDEN</div></div>
    </div>
  `;

  renderYearComparison(yearDays, totalStd, urlaubGenommen, krankTage);
  renderMonthlyBarChart(yearDays);
  renderWeekdayChart(yearDays);
  renderAbbauSaldoChart();
  renderTopKunden(yearDays);

  const table = document.getElementById('yearTable');
  table.innerHTML = '';
  for(let m=0; m<12; m++){
    const mDays = yearDays.filter(d => fromISODate(d.date).getMonth() === m);
    if(mDays.length === 0) continue;
    const std = mDays.reduce((s,d)=> s + dayTotal(d), 0);
    const u = mDays.filter(d=>d.type==='urlaub').length;
    const k = mDays.filter(d=>d.type==='krankheit').length;
    const row = document.createElement('div');
    row.className = 'year-row';
    row.innerHTML = `
      <span class="ym">${MONTHS[m]}</span>
      <span class="yv"><b>${fmtHours(std)}</b> Std</span>
      <span class="yv">${u} U</span>
      <span class="yv">${k} K</span>
    `;
    table.appendChild(row);
  }
  if(table.innerHTML === ''){
    table.innerHTML = `<div class="empty-state" style="padding:30px 10px;">Keine Einträge in ${analyticsYear}.</div>`;
  }
}

function renderYearComparison(yearDays, totalStd, urlaubGenommen, krankTage){
  const prevYear = analyticsYear - 1;
  const prevDays = days.filter(d => fromISODate(d.date).getFullYear() === prevYear);
  const container = document.getElementById('yearComparison');

  if(prevDays.length === 0){
    container.innerHTML = `<div class="settings-hint">Keine Daten für ${prevYear} vorhanden.</div>`;
    return;
  }

  const prevStd = prevDays.reduce((s,d)=> s + dayTotal(d), 0);
  const prevUrlaub = prevDays.filter(d=>d.type==='urlaub').length;
  const prevKrank = prevDays.filter(d=>d.type==='krankheit').length;

  const row = (label, cur, prev, unit) => {
    const diff = cur - prev;
    const diffStr = diff === 0 ? '±0' : (diff > 0 ? `+${unit==='Std'?fmtHours(diff):diff}` : `${unit==='Std'?fmtHours(diff):diff}`);
    const color = diff > 0 ? 'var(--primary)' : diff < 0 ? 'var(--danger)' : 'var(--muted)';
    return `<div class="year-row">
      <span class="ym">${label}</span>
      <span class="yv">${unit==='Std'?fmtHours(cur):cur} ${unit}</span>
      <span class="yv" style="color:${color};font-weight:700;">${diffStr}</span>
    </div>`;
  };

  container.innerHTML =
    row(`Std. gesamt (${prevYear}: ${fmtHours(prevStd)})`, totalStd, prevStd, 'Std') +
    row(`Urlaubstage (${prevYear}: ${prevUrlaub})`, urlaubGenommen, prevUrlaub, 'Tage') +
    row(`Krankheitstage (${prevYear}: ${prevKrank})`, krankTage, prevKrank, 'Tage');
}

function renderWeekdayChart(yearDays){
  const labels = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const sums = [0,0,0,0,0,0,0];
  const counts = [0,0,0,0,0,0,0];

  yearDays.forEach(d => {
    if(d.type !== 'work') return;
    const dow = (fromISODate(d.date).getDay() + 6) % 7; // Mo=0
    sums[dow] += dayTotal(d);
    counts[dow]++;
  });

  const avgs = sums.map((s,i) => counts[i] > 0 ? s/counts[i] : 0);
  const max = Math.max(...avgs, 1);

  const W = 340, H = 110, padBottom = 16, padTop = 8, barGap = 6;
  const barW = (W/7) - barGap;
  const isDark = document.body.classList.contains('dark');
  const barColor = isDark ? '#3E8FB0' : '#1B4B66';
  const textColor = isDark ? '#8A9298' : '#5A6570';

  let bars = '';
  avgs.forEach((v,i) => {
    const barH = max > 0 ? (v/max) * (H-padTop-padBottom) : 0;
    const x = i * (W/7) + barGap/2;
    const y = H - padBottom - barH;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="${barColor}"/>`;
    if(v > 0){
      bars += `<text x="${x+barW/2}" y="${y-3}" font-size="7" text-anchor="middle" fill="${barColor}">${fmtHours(v)}</text>`;
    }
    bars += `<text x="${x+barW/2}" y="${H-4}" font-size="7.5" text-anchor="middle" fill="${textColor}">${labels[i]}</text>`;
  });

  document.getElementById('yearWeekdayChart').innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${bars}</svg>`;
}

function renderAbbauSaldoChart(){
  // Laufender Gesamtsaldo über alle Jahre hinweg (wie ein Konto) – berücksichtigt Arbeitstage
  // (Ist minus Soll) UND manuelle Abbau-Einträge. Nur die Punkte des angezeigten Jahres werden
  // geplottet, der Startwert trägt aber den Saldo aus den Vorjahren korrekt fort.
  const relevantDays = days
    .filter(d => fromISODate(d.date).getFullYear() <= analyticsYear)
    .sort((a,b)=> a.date.localeCompare(b.date));

  const container = document.getElementById('yearAbbauChart');
  if(relevantDays.length === 0){
    container.innerHTML = `<div class="settings-hint">Noch keine Daten vorhanden.</div>`;
    return;
  }

  let running = settings.overtimeStartBalance || 0;
  const points = [];
  relevantDays.forEach(d => {
    running += overtimeDiffForDay(d);
    if(fromISODate(d.date).getFullYear() === analyticsYear) points.push(running);
  });

  if(points.length === 0){
    container.innerHTML = `<div class="settings-hint">Keine Arbeits- oder Abbau-Einträge in diesem Jahr.</div>`;
    return;
  }
  const min = Math.min(0, ...points);
  const max = Math.max(0, ...points);
  const range = (max - min) || 1;

  const W = 340, H = 90, padX = 6, padY = 10;
  const stepX = points.length > 1 ? (W - padX*2) / (points.length-1) : 0;
  const yFor = (v) => H - padY - ((v-min)/range) * (H - padY*2);

  const isDark = document.body.classList.contains('dark');
  const lineColor = isDark ? '#3E8FB0' : '#1B4B66';
  const zeroY = yFor(0);

  let path = `M ${padX} ${yFor(points[0])}`;
  points.forEach((v,i) => { if(i>0) path += ` L ${padX + i*stepX} ${yFor(v)}`; });

  const lastVal = points[points.length-1];
  document.getElementById('yearAbbauChart').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
      <line x1="${padX}" y1="${zeroY}" x2="${W-padX}" y2="${zeroY}" stroke="#D2D6D8" stroke-width="0.5"/>
      <path d="${path}" fill="none" stroke="${lineColor}" stroke-width="1.8"/>
    </svg>
    <div style="text-align:right;font-size:11px;color:var(--muted);margin-top:2px;">
      Aktueller Gesamtsaldo: <b style="color:var(--text);">${fmtHours(lastVal)} Std</b>
    </div>
  `;
}

function renderTopKunden(yearDays){
  const totals = {};
  yearDays.forEach(d => {
    if(d.type !== 'work') return;
    (d.items||[]).forEach(it => {
      const name = (it.kunde||'').trim() || 'Büroarbeiten';
      totals[name] = (totals[name]||0) + (parseFloat(it.stunden)||0);
    });
  });

  const sorted = Object.entries(totals).sort((a,b)=> b[1]-a[1]).slice(0,5);
  const container = document.getElementById('yearTopKunden');

  if(sorted.length === 0){
    container.innerHTML = `<div class="settings-hint">Noch keine Einträge.</div>`;
    return;
  }

  const max = sorted[0][1];
  container.innerHTML = sorted.map(([name, std]) => {
    const pct = max > 0 ? Math.round((std/max)*100) : 0;
    return `
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px;">
          <span>${escapeHtml(name)}</span><span style="color:var(--muted);">${fmtHours(std)} Std</span>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:100px;height:8px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:100px;"></div>
        </div>
      </div>`;
  }).join('');
}

function renderMonthlyBarChart(yearDays){
  const monthShort = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const values = [];
  for(let m=0; m<12; m++){
    const mDays = yearDays.filter(d => fromISODate(d.date).getMonth() === m);
    values.push(mDays.reduce((s,d)=> s + dayTotal(d), 0));
  }
  const max = Math.max(...values, 1);

  const W = 340, H = 130, padBottom = 16, padTop = 8, barGap = 4;
  const barW = (W / 12) - barGap;
  const isDark = document.body.classList.contains('dark');
  const barColor = isDark ? '#3E8FB0' : '#1B4B66';
  const textColor = isDark ? '#8A9298' : '#5A6570';

  let bars = '';
  values.forEach((v, i) => {
    const barH = max > 0 ? (v / max) * (H - padTop - padBottom) : 0;
    const x = i * (W/12) + barGap/2;
    const y = H - padBottom - barH;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="${barColor}"/>`;
    if(v > 0){
      bars += `<text x="${x+barW/2}" y="${y-3}" font-size="7" text-anchor="middle" fill="${barColor}">${fmtHours(v)}</text>`;
    }
    bars += `<text x="${x+barW/2}" y="${H-4}" font-size="7.5" text-anchor="middle" fill="${textColor}">${monthShort[i]}</text>`;
  });

  const container = document.getElementById('yearBarChart');
  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${bars}</svg>`;
}

/* ===== Month nav ===== */
document.getElementById('prevMonth').addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()-1, 1);
  render();
});
document.getElementById('nextMonth').addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 1);
  render();
});

/* ===== Export ===== */
function currentMonthDays(){
  const y = viewDate.getFullYear(), m = viewDate.getMonth();
  return days
    .filter(d => { const dt = fromISODate(d.date); return dt.getFullYear()===y && dt.getMonth()===m; })
    .sort((a,b)=> a.date.localeCompare(b.date));
}

function buildExportRows(monthDays){
  const rows = [['Datum','Wochentag','KW','Typ','Kunde','Taetigkeit','Stunden','Nachtarbeit','Schmutzzulage']];
  monthDays.forEach(d => {
    const dt = fromISODate(d.date);
    const wk = isoWeek(dt);
    if(d.type === 'work'){
      (d.items||[]).forEach(it => {
        rows.push([fmtDate(dt), WEEKDAYS[dt.getDay()], wk, 'Arbeit', it.kunde||'', it.taetigkeit||'', parseFloat(it.stunden)||0, it.nachtarbeit?'Ja':'', it.schmutzzulage?'Ja':'']);
      });
    } else {
      const labels = {urlaub:'Urlaub', krankheit:'Krankheit', schule:'Schule', feiertag:'Feiertag', abbau:'Ueberstundenabbau'};
      const label = labels[d.type] || d.type;
      rows.push([fmtDate(dt), WEEKDAYS[dt.getDay()], wk, label, '', '', dayTotal(d), '', '']);
    }
  });
  return rows;
}

const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad meldet sich seit iPadOS 13 wie ein Mac

/* ===== Export: zentrale Format/Zeitraum-Auswahl ===== */
function loadExportPrefs(){
  try{
    const raw = localStorage.getItem('sz_export_prefs');
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
let exportPrefs = Object.assign({format:'pdf-standard', period:'current', otherMonth:'', customFrom:'', customTo:''}, loadExportPrefs());
function saveExportPrefs(){ try{ localStorage.setItem('sz_export_prefs', JSON.stringify(exportPrefs)); }catch(e){} }

function getMonthsWithData(){
  const set = new Set();
  days.forEach(d => {
    const dt = fromISODate(d.date);
    set.add(`${dt.getFullYear()}-${pad(dt.getMonth()+1)}`);
  });
  return Array.from(set).sort().reverse();
}

function resolveExportPeriod(prefs){
  const type = prefs.period;
  let filtered = [], label = '', fileLabel = '';
  if(type === 'current'){
    const y=viewDate.getFullYear(), m=viewDate.getMonth();
    filtered = days.filter(d=>{const dt=fromISODate(d.date);return dt.getFullYear()===y&&dt.getMonth()===m;});
    label = `${MONTHS[m]} ${y}`; fileLabel = `${MONTHS[m]}-${y}`;
  } else if(type === 'lastMonth'){
    const d0 = new Date(viewDate.getFullYear(), viewDate.getMonth()-1, 1);
    const y=d0.getFullYear(), m=d0.getMonth();
    filtered = days.filter(d=>{const dt=fromISODate(d.date);return dt.getFullYear()===y&&dt.getMonth()===m;});
    label = `${MONTHS[m]} ${y}`; fileLabel = `${MONTHS[m]}-${y}`;
  } else if(type === 'thisYear'){
    const y = viewDate.getFullYear();
    filtered = days.filter(d=>fromISODate(d.date).getFullYear()===y);
    label = `Jahr ${y}`; fileLabel = `Jahr-${y}`;
  } else if(type === 'otherMonth'){
    if(!prefs.otherMonth) return null;
    const [yy,mm] = prefs.otherMonth.split('-').map(Number);
    filtered = days.filter(d=>{const dt=fromISODate(d.date);return dt.getFullYear()===yy&&dt.getMonth()===(mm-1);});
    label = `${MONTHS[mm-1]} ${yy}`; fileLabel = `${MONTHS[mm-1]}-${yy}`;
  } else if(type === 'custom'){
    if(!prefs.customFrom || !prefs.customTo) return null;
    filtered = days.filter(d=> d.date >= prefs.customFrom && d.date <= prefs.customTo);
    label = `${fmtDate(fromISODate(prefs.customFrom))} – ${fmtDate(fromISODate(prefs.customTo))}`;
    fileLabel = `Zeitraum_${prefs.customFrom}_bis_${prefs.customTo}`;
  } else {
    return null;
  }
  filtered = filtered.slice().sort((a,b)=>a.date.localeCompare(b.date));
  return {days:filtered, label, fileLabel};
}

const FORMAT_LABELS = {'pdf-standard':'PDF Standard','pdf-compact':'PDF Kompakt','csv':'CSV','excel':'Excel'};
const PERIOD_LABELS = {'current':'Aktueller Monat','lastMonth':'Letzter Monat','thisYear':'Dieses Jahr','otherMonth':'Anderer Monat','custom':'Eigener Zeitraum'};

function updateExportSummary(){
  const resolved = resolveExportPeriod(exportPrefs);
  document.getElementById('exportSummary').textContent =
    `→ ${FORMAT_LABELS[exportPrefs.format]}, ${resolved ? resolved.label : PERIOD_LABELS[exportPrefs.period]}`;

  const preview = document.getElementById('exportPreview');
  if(!resolved){
    preview.textContent = 'Bitte Zeitraum vollständig auswählen.';
    return;
  }
  if(resolved.days.length === 0){
    preview.textContent = 'Keine Einträge in diesem Zeitraum.';
    return;
  }
  const totalStd = resolved.days.reduce((s,d)=>s+dayTotal(d),0);
  const urlaubCount = resolved.days.filter(d=>d.type==='urlaub').length;
  preview.textContent = `${resolved.days.length} Tage, ${fmtHours(totalStd)} Std, davon ${urlaubCount} Urlaub`;
}

function initExportUI(){
  document.querySelectorAll('[data-format]').forEach(t => t.classList.toggle('active', t.dataset.format===exportPrefs.format));
  document.querySelectorAll('[data-period]').forEach(t => t.classList.toggle('active', t.dataset.period===exportPrefs.period));

  const monthSelect = document.getElementById('exportOtherMonthSelect');
  const months = getMonthsWithData();
  monthSelect.innerHTML = months.map(ym => {
    const [y,m] = ym.split('-').map(Number);
    return `<option value="${ym}">${MONTHS[m-1]} ${y}</option>`;
  }).join('');
  if(exportPrefs.otherMonth && months.includes(exportPrefs.otherMonth)){
    monthSelect.value = exportPrefs.otherMonth;
  } else if(months.length){
    exportPrefs.otherMonth = months[0];
    monthSelect.value = months[0];
  }

  document.getElementById('exportCustomFrom').value = exportPrefs.customFrom || '';
  document.getElementById('exportCustomTo').value = exportPrefs.customTo || '';

  document.getElementById('exportOtherMonthField').style.display = exportPrefs.period==='otherMonth' ? 'block' : 'none';
  document.getElementById('exportCustomFields').style.display = exportPrefs.period==='custom' ? 'block' : 'none';

  updateExportSummary();
}

document.querySelectorAll('[data-format]').forEach(tab => {
  tab.addEventListener('click', () => {
    exportPrefs.format = tab.dataset.format;
    saveExportPrefs();
    initExportUI();
  });
});
document.querySelectorAll('[data-period]').forEach(tab => {
  tab.addEventListener('click', () => {
    exportPrefs.period = tab.dataset.period;
    saveExportPrefs();
    initExportUI();
  });
});
document.getElementById('exportOtherMonthSelect').addEventListener('change', (e) => {
  exportPrefs.otherMonth = e.target.value;
  saveExportPrefs();
  updateExportSummary();
});
document.getElementById('exportCustomFrom').addEventListener('change', (e) => {
  exportPrefs.customFrom = e.target.value;
  saveExportPrefs();
  updateExportSummary();
});
document.getElementById('exportCustomTo').addEventListener('change', (e) => {
  exportPrefs.customTo = e.target.value;
  saveExportPrefs();
  updateExportSummary();
});

function doExportCsv(daysArr, fileLabel){
  const sanitizeCsvCell = (val) => {
    let s = String(val);
    if(/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV/Excel-Formel-Einschleusung verhindern
    return s;
  };
  const rows = buildExportRows(daysArr).map(r => r.map((cell,i) =>
    (i === 6 && typeof cell === 'number') ? fmtHours(cell) : cell
  ));
  const csv = rows.map(r => r.map(cell => {
    const s = sanitizeCsvCell(cell).replace(/"/g,'""');
    return /[;"\n]/.test(s) ? `"${s}"` : s;
  }).join(';')).join('\r\n');
  const fname = `Stundenzettel_${(settings.name||'').replace(/\s+/g,'-')}_${fileLabel}.csv`;
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV heruntergeladen');
}

function doExportExcel(daysArr, fileLabel){
  if(typeof XLSX === 'undefined'){ toast('Excel-Export gerade nicht verfügbar (kein Internet beim ersten Laden?)'); return; }
  const rows = buildExportRows(daysArr).map(r => r.map(cell => {
    if(typeof cell === 'string' && /^[=+\-@\t\r]/.test(cell)) return "'" + cell;
    return cell;
  }));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:11},{wch:11},{wch:5},{wch:12},{wch:20},{wch:28},{wch:9},{wch:12},{wch:14}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stundenzettel');
  const fname = `Stundenzettel_${(settings.name||'').replace(/\s+/g,'-')}_${fileLabel}.xlsx`;
  XLSX.writeFile(wb, fname);
  toast('Excel-Datei heruntergeladen');
}

/* ===== Export-Verlauf (ohne gespeicherte Datei, wird bei Bedarf neu erzeugt) ===== */
function loadExportHistory(){
  try{
    const raw = localStorage.getItem('sz_export_history');
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function saveExportHistory(list){
  try{ localStorage.setItem('sz_export_history', JSON.stringify(list.slice(0,5))); }catch(e){}
}
function logExportHistory(format, label, prefsSnapshot){
  const entry = { timestamp: new Date().toISOString(), format, label, prefs: {...prefsSnapshot} };
  saveExportHistory([entry, ...loadExportHistory()]);
}

async function runExportForEntry(entry){
  const resolved = resolveExportPeriod(entry.prefs);
  if(!resolved || resolved.days.length === 0){ toast('Keine Daten mehr für diesen Zeitraum vorhanden'); return; }
  if(entry.format === 'csv') doExportCsv(resolved.days, resolved.fileLabel);
  else if(entry.format === 'excel') doExportExcel(resolved.days, resolved.fileLabel);
  else if(entry.format === 'pdf-standard') await generateStundenzettelPDF(resolved.days, settings, viewDate, logoImg, !isMobileDevice, resolved.fileLabel);
  else if(entry.format === 'pdf-compact') await generateStundenzettelPDFCompact(resolved.days, settings, viewDate, logoImg, !isMobileDevice, resolved.fileLabel);
}

document.getElementById('btnDoExport').addEventListener('click', async () => {
  const resolved = resolveExportPeriod(exportPrefs);
  if(!resolved){ toast('Bitte Zeitraum vollständig auswählen'); return; }
  if(resolved.days.length === 0){ toast('Keine Einträge in diesem Zeitraum'); return; }
  if(!settings.name){ toast('Bitte zuerst Name eintragen'); return; }

  if(exportPrefs.format === 'csv') doExportCsv(resolved.days, resolved.fileLabel);
  else if(exportPrefs.format === 'excel') doExportExcel(resolved.days, resolved.fileLabel);
  else if(exportPrefs.format === 'pdf-standard') await generateStundenzettelPDF(resolved.days, settings, viewDate, logoImg, !isMobileDevice, resolved.fileLabel);
  else if(exportPrefs.format === 'pdf-compact') await generateStundenzettelPDFCompact(resolved.days, settings, viewDate, logoImg, !isMobileDevice, resolved.fileLabel);

  logExportHistory(exportPrefs.format, resolved.label, exportPrefs);
  settingsModal.classList.remove('open');
});

/* ===== Toast ===== */
let toastTimer;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.classList.remove('show'), 1800);
}

/* ===== Download-Rückmeldung: zeigt deutlich, dass ein Download ausgelöst wurde ===== */
function attachDownloadFeedback(linkEl, label){
  const originalText = linkEl.textContent;
  linkEl.onclick = () => {
    toast('⬇️ Download gestartet' + (label ? ` – ${label}` : ''));
    linkEl.classList.add('download-confirmed');
    linkEl.textContent = '✓ Heruntergeladen';
    setTimeout(() => {
      linkEl.classList.remove('download-confirmed');
      linkEl.textContent = originalText;
    }, 2200);
  };
}

/* ===== Service worker ===== */
let swRegistration = null;
if('serviceWorker' in navigator){
  const hadControllerAtLoad = !!navigator.serviceWorker.controller;
  let updateBannerShown = false;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => { swRegistration = reg; })
      .catch(()=>{});
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Nur anzeigen, wenn schon vorher eine Version aktiv war (= echtes Update, nicht Erstinstallation)
    if(hadControllerAtLoad && !updateBannerShown){
      updateBannerShown = true;
      showUpdateBanner();
    }
  });
}

document.getElementById('btnCheckUpdate').addEventListener('click', async () => {
  if(!swRegistration){ toast('Update-Prüfung gerade nicht möglich'); return; }
  toast('🔍 Suche nach Updates...');
  let foundUpdate = false;
  const onUpdateFound = () => { foundUpdate = true; };
  swRegistration.addEventListener('updatefound', onUpdateFound);
  try{ await swRegistration.update(); }catch(e){ /* Offline o.ä. */ }
  setTimeout(() => {
    swRegistration.removeEventListener('updatefound', onUpdateFound);
    // Falls ein Update gefunden wurde, übernimmt der bestehende Banner-Mechanismus (controllerchange) automatisch.
    if(!foundUpdate) toast('✓ Du hast bereits die neueste Version');
  }, 2500);
});

function showUpdateBanner(){
  const el = document.createElement('div');
  el.id = 'updateBanner';
  el.innerHTML = `
    <span>🔄 Neues Update ist da</span>
    <button id="updateBannerBtn">Jetzt laden</button>
  `;
  document.body.appendChild(el);
  document.getElementById('updateBannerBtn').addEventListener('click', () => {
    window.location.reload();
  });
}

/* ===== App-Sperre (PIN) ===== */
function checkAppLock(){
  if(!settings.pinEnabled || !settings.pinHash) return;
  if(sessionStorage.getItem('sz_unlocked') === '1') return;

  const lockScreen = document.getElementById('lockScreen');
  const pinInput = document.getElementById('lockPinInput');
  const errorEl = document.getElementById('lockPinError');
  lockScreen.style.display = 'flex';
  setTimeout(() => pinInput.focus(), 200);

  pinInput.addEventListener('input', () => {
    errorEl.style.display = 'none';
    if(pinInput.value.length === 4){
      if(simpleHash(pinInput.value) === settings.pinHash){
        sessionStorage.setItem('sz_unlocked', '1');
        lockScreen.style.display = 'none';
      } else {
        errorEl.style.display = 'block';
        pinInput.value = '';
      }
    }
  });

  document.getElementById('lockPinForgot').addEventListener('click', () => {
    const ok = window.confirm('PIN zurücksetzen? Die App-Sperre wird deaktiviert. Deine Stundendaten bleiben dabei vollständig erhalten – du kannst die Sperre in den Einstellungen jederzeit neu einrichten.');
    if(!ok) return;
    settings = {...settings, pinEnabled:false, pinHash:null};
    const saveOk = saveSettings(settings);
    sessionStorage.setItem('sz_unlocked', '1');
    lockScreen.style.display = 'none';
    toast(saveOk ? 'App-Sperre entfernt' : '⚠️ Konnte nicht gespeichert werden – Sperre bleibt evtl. beim nächsten Öffnen aktiv');
  });
}

/* ===== Auswahlmodus & Tage teilen ===== */
document.getElementById('toggleSelectMode').addEventListener('click', () => {
  selectMode = !selectMode;
  selectedDates = new Set();
  const btn = document.getElementById('toggleSelectMode');
  btn.textContent = selectMode ? '✕ Fertig' : '☑ Auswählen';
  btn.style.background = selectMode ? 'var(--danger)' : 'var(--primary)';
  updateShareSelectionBar();
  render();
});

function updateShareSelectionBar(){
  const bar = document.getElementById('shareSelectionBar');
  const btn = document.getElementById('btnShareSelected');
  if(selectMode && selectedDates.size > 0){
    bar.style.display = 'block';
    btn.textContent = `${selectedDates.size} Tag(e) teilen`;
    document.body.classList.add('has-share-bar');
  } else {
    bar.style.display = 'none';
    document.body.classList.remove('has-share-bar');
  }
}

let currentShareUrl = null;

/* ===== Verlauf geteilter Exporte ===== */
function loadShareHistory(){
  try{
    const raw = localStorage.getItem('sz_share_history');
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function saveShareHistory(list){
  try{ localStorage.setItem('sz_share_history', JSON.stringify(list.slice(0,5))); }
  catch(e){ /* Verlauf ist nur Komfort, kein kritischer Datenverlust falls das fehlschlägt */ }
}

document.getElementById('btnShareSelected').addEventListener('click', () => {
  const selectedDays = days.filter(d => selectedDates.has(d.date)).sort((a,b)=> a.date.localeCompare(b.date));
  if(selectedDays.length === 0) return;

  const first = selectedDays[0].date, last = selectedDays[selectedDays.length-1].date;

  // Duplikat-Warnung: gleiche Auswahl vor kurzem schon exportiert?
  const history = loadShareHistory();
  const recentDup = history.find(h =>
    h.type === 'partial' && h.firstDate === first && h.lastDate === last && h.dayCount === selectedDays.length &&
    (Date.now() - new Date(h.timestamp).getTime()) < 5*60*1000
  );
  if(recentDup){
    const mins = Math.max(1, Math.round((Date.now() - new Date(recentDup.timestamp).getTime())/60000));
    const ok = window.confirm(`Diese Auswahl (${selectedDays.length} Tag(e), ${fmtDate(fromISODate(first))}–${fmtDate(fromISODate(last))}) hast du vor ${mins} Minute(n) schon heruntergeladen. Trotzdem nochmal?`);
    if(!ok) return;
  }

  const now = new Date();
  const payload = {
    app: 'stundenzettel-share',
    version: 1,
    exportedAt: now.toISOString(),
    sharedBy: settings.name || '',
    days: selectedDays
  };
  const json = JSON.stringify(payload, null, 2);
  const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const fname = `Stunden-Geteilt_${first}_bis_${last}_${timeStr}.json`;
  const blob = new Blob([json], {type:'application/json'});
  if(currentShareUrl) URL.revokeObjectURL(currentShareUrl);
  const url = URL.createObjectURL(blob);
  currentShareUrl = url;

  const downloadLink = document.getElementById('shareResultDownloadLink');
  downloadLink.href = url;
  downloadLink.download = fname;
  attachDownloadFeedback(downloadLink);

  // Im Verlauf ablegen (neueste zuerst, max. 5)
  const newHistory = [{
    timestamp: now.toISOString(),
    fname, type: 'partial', firstDate: first, lastDate: last,
    dayCount: selectedDays.length, json
  }, ...history].slice(0,5);
  saveShareHistory(newHistory);

  selectMode = false;
  selectedDates = new Set();
  document.getElementById('toggleSelectMode').textContent = '☑ Auswählen';
  document.getElementById('toggleSelectMode').style.background = 'var(--primary)';
  updateShareSelectionBar();
  render();

  shareResultModal.classList.add('open');
});

/* ===== Verlauf-Ansicht ===== */
const shareHistoryModal = document.getElementById('shareHistoryModal');
let historyUrls = [];

document.getElementById('btnShareHistory').addEventListener('click', () => {
  renderShareHistoryList();
  renderExportHistoryList();
  settingsModal.classList.remove('open');
  shareHistoryModal.classList.add('open');
});
document.getElementById('closeShareHistory').addEventListener('click', () => shareHistoryModal.classList.remove('open'));
shareHistoryModal.addEventListener('click', (e) => { if(e.target === shareHistoryModal) shareHistoryModal.classList.remove('open'); });

function renderShareHistoryList(){
  historyUrls.forEach(u => URL.revokeObjectURL(u));
  historyUrls = [];

  const history = loadShareHistory();
  const list = document.getElementById('shareHistoryList');
  if(history.length === 0){
    list.innerHTML = `<div class="settings-hint">Noch nichts geteilt.</div>`;
    return;
  }
  list.innerHTML = history.map((h, idx) => {
    const dt = new Date(h.timestamp);
    const isFull = h.type === 'full';
    const dateStr = h.firstDate
      ? `${fmtDate(fromISODate(h.firstDate))}${h.firstDate!==h.lastDate ? ' – '+fmtDate(fromISODate(h.lastDate)) : ''}`
      : 'keine Einträge';
    const timeStr = `${dt.toLocaleDateString('de-DE')} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const typeBadge = isFull
      ? `<span class="zulage-badge" style="background:#E5E9F2;color:#2A4B7C;">Komplettsicherung</span>`
      : `<span class="zulage-badge" style="background:#E7EEF2;color:var(--primary);">Zeitraum</span>`;
    return `<div class="share-history-row">
      <div class="info">
        <div class="d">${h.dayCount} Tag(e) ${typeBadge}</div>
        <div class="s">${dateStr} · Exportiert am ${timeStr}</div>
      </div>
      <a data-idx="${idx}" class="history-redownload" download>Laden</a>
    </div>`;
  }).join('');

  // Jedem Link direkt eine echte, fertige Blob-URL zum Herunterladen mitgeben
  list.querySelectorAll('.history-redownload').forEach(a => {
    const h = history[parseInt(a.dataset.idx)];
    const blob = new Blob([h.json], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    historyUrls.push(url);
    a.href = url;
    a.download = h.fname;
    attachDownloadFeedback(a);
  });
}

const shareResultModal = document.getElementById('shareResultModal');
document.getElementById('closeShareResult').addEventListener('click', () => shareResultModal.classList.remove('open'));
shareResultModal.addEventListener('click', (e) => { if(e.target === shareResultModal) shareResultModal.classList.remove('open'); });

function renderExportHistoryList(){
  const history = loadExportHistory();
  const list = document.getElementById('exportHistoryList');
  if(history.length === 0){
    list.innerHTML = `<div class="settings-hint">Noch keine Exporte.</div>`;
    return;
  }
  list.innerHTML = history.map((h, idx) => {
    const dt = new Date(h.timestamp);
    const timeStr = `${dt.toLocaleDateString('de-DE')} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    return `<div class="share-history-row">
      <div class="info">
        <div class="d">${FORMAT_LABELS[h.format]||h.format} <span class="zulage-badge" style="background:#F0ECE3;color:var(--accent-heiz);">${h.label}</span></div>
        <div class="s">Exportiert am ${timeStr}</div>
      </div>
      <button type="button" data-idx="${idx}" class="history-redo">Laden</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.history-redo').forEach(btn => {
    btn.addEventListener('click', async () => {
      const h = history[parseInt(btn.dataset.idx)];
      const original = btn.textContent;
      btn.textContent = '...';
      await runExportForEntry(h);
      btn.textContent = original;
    });
  });
}

/* ===== Geteilte Tage importieren ===== */
const shareImportModal = document.getElementById('shareImportModal');
let pendingSharedDays = [];

document.getElementById('btnImportShared').addEventListener('click', () => {
  document.getElementById('sharedFileInput').click();
});

document.getElementById('sharedFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try{ data = JSON.parse(reader.result); }
    catch(err){ toast('Datei ungültig'); return; }

    if(!data || !Array.isArray(data.days) || data.days.length === 0){
      toast('Keine gültige Datei mit geteilten Tagen');
      return;
    }

    const { valid: cleanShared, rejected } = sanitizeImportedDays(data.days);
    if(cleanShared.length === 0){
      toast('Keine gültigen Tage in dieser Datei gefunden');
      return;
    }
    if(rejected > 0) toast(`${rejected} ungültige(r) Eintrag/Einträge übersprungen`);

    pendingSharedDays = cleanShared;
    renderShareImportList(typeof data.sharedBy === 'string' ? data.sharedBy : '');
    settingsModal.classList.remove('open');
    shareImportModal.classList.add('open');
  };
  reader.readAsText(file);
  e.target.value = '';
});

function renderShareImportList(sharedBy){
  const info = document.getElementById('shareImportInfo');
  info.textContent = sharedBy
    ? `Geteilt von ${sharedBy}. Wähle aus, welche Tage übernommen werden sollen.`
    : 'Wähle aus, welche Tage übernommen werden sollen.';

  const typeLabels = {work:'Arbeit', urlaub:'Urlaub', krankheit:'Krankheit', schule:'Schule', feiertag:'Feiertag', abbau:'Überstundenabbau'};
  const list = document.getElementById('shareImportList');
  list.innerHTML = pendingSharedDays.map((d, idx) => {
    const dt = fromISODate(d.date);
    const existing = days.find(x => x.date === d.date);
    const std = dayTotal(d);
    return `<div class="share-import-row">
      <input type="checkbox" class="share-import-check" data-idx="${idx}" checked>
      <div class="info">
        <div class="d">${WEEKDAYS[dt.getDay()]}, ${fmtDate(dt)} – ${escapeHtml(typeLabels[d.type]||String(d.type))}</div>
        <div class="s">${fmtHours(std)} Std${existing ? ' · <span class="conflict">überschreibt bestehenden Eintrag</span>' : ''}</div>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('closeShareImport').addEventListener('click', () => shareImportModal.classList.remove('open'));
shareImportModal.addEventListener('click', (e) => { if(e.target === shareImportModal) shareImportModal.classList.remove('open'); });

document.getElementById('confirmShareImport').addEventListener('click', () => {
  const checks = document.querySelectorAll('.share-import-check');
  const chosen = [];
  checks.forEach(cb => { if(cb.checked) chosen.push(pendingSharedDays[parseInt(cb.dataset.idx)]); });

  if(chosen.length === 0){ toast('Keine Tage ausgewählt'); return; }

  const lockedSkip = chosen.filter(d => isMonthLocked(fromISODate(d.date)));
  const toApply = chosen.filter(d => !isMonthLocked(fromISODate(d.date)));

  if(toApply.length === 0){
    toast('Alle ausgewählten Tage liegen in gesperrten Monaten');
    return;
  }

  toApply.forEach(d => {
    days = days.filter(x => x.date !== d.date);
    days.push(d);
  });
  const saveOk = saveDays(days);
  shareImportModal.classList.remove('open');
  render();

  let msg = `${toApply.length} Tag(e) übernommen`;
  if(lockedSkip.length > 0) msg += ` (${lockedSkip.length} in gesperrtem Monat übersprungen)`;
  toast(saveOk ? msg : '⚠️ Speichern fehlgeschlagen – Speicher voll oder blockiert?');
});

/* ===== Einstellungen: aufklappbare Gruppen ===== */
document.querySelectorAll('.settings-group-head').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.closest('.settings-group').classList.toggle('open');
  });
});

/* ===== Onboarding (nur beim ersten Start) ===== */
const ONBOARDING_SLIDES = [
  { type:'info', icon:'👋', title:'Willkommen!', text:'Dein digitaler Stundenzettel für John Haustechnik GmbH & Co KG – entwickelt von Marcus Lüschen. Alle Daten bleiben nur auf deinem Handy.' },
  { type:'form', form:'profile', title:'Deine Daten', subtitle:'Erscheint auf jedem PDF-Export.' },
  { type:'form', form:'worktimes', title:'Deine Arbeitszeiten', subtitle:'Werden beim Erfassen vorausgefüllt, bleiben pro Tag änderbar.' },
  { type:'form', form:'balances', title:'Urlaub & Überstunden', subtitle:'Steigst du mitten im Jahr ein: hier deinen aktuellen Stand eintragen.' },
  { type:'info', icon:'📅', title:'Tage erfassen', text:'Einfach im Kalender oben auf einen Tag tippen – Arbeit, Urlaub, Krankheit, Schule oder Überstundenabbau eintragen.' },
  { type:'info', icon:'💾', title:'Nicht vergessen', text:'Erstelle ab und zu eine Sicherung in den Einstellungen (⚙) – sonst sind deine Daten bei Handy-Verlust unwiederbringlich weg.' },
  { type:'info', icon:'❓', title:'Hilfe griffbereit', text:'Fragen? Unter ⚙ Einstellungen findest du oben den Button "❓ Hilfe" mit allen wichtigen Infos – jederzeit abrufbar.' },
];
let onboardingIdx = 0;

const ONBOARDING_FORM_FIELDS = {
  profile: [
    {id:'obName', label:'Name', type:'text', settingsKey:'name', placeholder:'Vor- und Nachname'},
    {id:'obStreet', label:'Straße & Hausnummer', type:'text', settingsKey:'street', placeholder:'Straße 1'},
    {id:'obCity', label:'PLZ & Ort', type:'text', settingsKey:'city', placeholder:'26xxx Ort'},
  ],
  worktimes: [
    {id:'obMonThuStart', label:'Mo–Do Beginn', type:'time', settingsKey:'monThuStart'},
    {id:'obMonThuEnd', label:'Mo–Do Ende', type:'time', settingsKey:'monThuEnd'},
    {id:'obMonThuPause', label:'Mo–Do Pause (Minuten)', type:'number', settingsKey:'monThuPause'},
    {id:'obFriStart', label:'Fr Beginn', type:'time', settingsKey:'friStart'},
    {id:'obFriEnd', label:'Fr Ende', type:'time', settingsKey:'friEnd'},
    {id:'obFriPause', label:'Fr Pause (Minuten)', type:'number', settingsKey:'friPause'},
  ],
  balances: [
    {id:'obUrlaubstage', label:'Jahresurlaubstage', type:'number', settingsKey:'urlaubstage', placeholder:'z.B. 30'},
    {id:'obUrlaubVorApp', label:'Urlaubstage schon genommen (dieses Jahr, vor App-Nutzung)', type:'number', settingsKey:'urlaubVorAppStart', placeholder:'0'},
    {id:'obOvertimeStart', label:'Überstunden-Saldo beim Einstieg', type:'number', settingsKey:'overtimeStartBalance', placeholder:'0', step:'0.25'},
  ],
};

function renderOnboardingSlide(){
  const s = ONBOARDING_SLIDES[onboardingIdx];
  const container = document.getElementById('onboardingSlides');

  if(s.type === 'form'){
    container.style.textAlign = 'left';
    container.style.alignItems = 'stretch';
    container.style.justifyContent = 'flex-start';
    container.style.paddingTop = '20px';
    const fields = ONBOARDING_FORM_FIELDS[s.form];
    container.innerHTML = `
      <div style="font-size:19px;font-weight:700;color:var(--text);margin-bottom:6px;">${s.title}</div>
      <div style="font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:18px;">${s.subtitle}</div>
      ${fields.map(f => `
        <label style="margin-top:10px;">${f.label}</label>
        <input type="${f.type}" id="${f.id}" ${f.placeholder?`placeholder="${f.placeholder}"`:''} ${f.step?`step="${f.step}"`:''}>
      `).join('')}
    `;
    fields.forEach(f => {
      const el = document.getElementById(f.id);
      const val = settings[f.settingsKey];
      el.value = (val !== undefined && val !== null) ? val : (DEFAULT_SETTINGS[f.settingsKey] ?? '');
    });
  } else {
    container.style.textAlign = 'center';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.paddingTop = '0';
    container.innerHTML = `
      <div style="font-size:56px;margin-bottom:18px;">${s.icon}</div>
      <div style="font-size:19px;font-weight:700;color:var(--text);margin-bottom:10px;">${s.title}</div>
      <div style="font-size:14px;color:var(--muted);line-height:1.6;max-width:300px;">${s.text}</div>
    `;
  }

  document.getElementById('onboardingDots').innerHTML = ONBOARDING_SLIDES.map((_,i) =>
    `<span class="onboarding-dot ${i===onboardingIdx?'active':''}"></span>`
  ).join('');
  document.getElementById('onboardingNext').textContent = (onboardingIdx === ONBOARDING_SLIDES.length-1) ? 'Los geht\'s' : 'Weiter';
}

// Werte aus einem gerade angezeigten Formular-Screen in die Einstellungen übernehmen
function collectOnboardingFormValues(){
  const s = ONBOARDING_SLIDES[onboardingIdx];
  if(s.type !== 'form') return;
  const fields = ONBOARDING_FORM_FIELDS[s.form];
  fields.forEach(f => {
    const el = document.getElementById(f.id);
    if(!el) return;
    settings[f.settingsKey] = (f.type === 'number') ? (parseFloat(el.value)||0) : el.value.trim();
  });
  saveSettings(settings);
}

function closeOnboarding(){
  collectOnboardingFormValues();
  document.getElementById('onboarding').style.display = 'none';
  try{ localStorage.setItem('sz_onboarding_done', '1'); }catch(e){}
  render();
}

document.getElementById('onboardingNext').addEventListener('click', () => {
  collectOnboardingFormValues();
  if(onboardingIdx === ONBOARDING_SLIDES.length-1){
    closeOnboarding();
  } else {
    onboardingIdx++;
    renderOnboardingSlide();
  }
});
document.getElementById('onboardingSkip').addEventListener('click', closeOnboarding);

function checkOnboarding(){
  let done = false;
  try{ done = localStorage.getItem('sz_onboarding_done') === '1'; }catch(e){}
  if(!done){
    renderOnboardingSlide();
    document.getElementById('onboarding').style.display = 'flex';
  }
}

/* ===== Automatische Notfall-Sicherheitskopien (alle 14 Tage, max. 3, mit Strukturprüfung) ===== */
const SNAPSHOT_INTERVAL_DAYS = 14;
const SNAPSHOT_MAX = 3;

function isAutoSnapshotEnabled(){
  try{
    const v = localStorage.getItem('sz_auto_snapshot_enabled');
    return v === null ? true : v === '1'; // Standard: aktiviert
  }catch(e){ return true; }
}
function setAutoSnapshotEnabled(on){
  try{ localStorage.setItem('sz_auto_snapshot_enabled', on ? '1' : '0'); }catch(e){}
}
function loadAutoSnapshots(){
  try{
    const raw = localStorage.getItem('sz_auto_snapshots');
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function saveAutoSnapshots(list){
  try{ localStorage.setItem('sz_auto_snapshots', JSON.stringify(list.slice(0,SNAPSHOT_MAX))); }catch(e){}
}

function checkAutoSnapshot(){
  if(!isAutoSnapshotEnabled()) return;
  const snapshots = loadAutoSnapshots();
  const last = snapshots[0];
  if(last && (Date.now() - new Date(last.timestamp).getTime()) < SNAPSHOT_INTERVAL_DAYS*24*60*60*1000){
    return; // noch nicht fällig
  }
  // Strukturprüfung: nur bei sauberen Daten wird überhaupt ein neuer Snapshot angelegt.
  // Schlägt sie fehl, bleibt der letzte gute Snapshot einfach unangetastet stehen.
  const { valid, rejected } = sanitizeImportedDays(days);
  if(rejected > 0) return;

  const entry = {
    timestamp: new Date().toISOString(),
    dayCount: valid.length,
    settings: {...settings},
    days: valid
  };
  saveAutoSnapshots([entry, ...snapshots]);
}

const snapshotModal = document.getElementById('snapshotModal');
document.getElementById('btnShowSnapshots').addEventListener('click', () => {
  renderSnapshotList();
  settingsModal.classList.remove('open');
  snapshotModal.classList.add('open');
});
document.getElementById('closeSnapshotModal').addEventListener('click', () => snapshotModal.classList.remove('open'));
snapshotModal.addEventListener('click', (e) => { if(e.target === snapshotModal) snapshotModal.classList.remove('open'); });

function renderSnapshotList(){
  const snapshots = loadAutoSnapshots();
  const list = document.getElementById('snapshotList');
  if(snapshots.length === 0){
    list.innerHTML = `<div class="settings-hint">Noch keine Sicherheitskopie vorhanden (erste entsteht automatisch nach 14 Tagen Nutzung).</div>`;
    return;
  }
  list.innerHTML = snapshots.map((s, idx) => {
    const dt = new Date(s.timestamp);
    const dateStr = `${dt.toLocaleDateString('de-DE')} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    return `<div class="share-history-row">
      <div class="info">
        <div class="d">${dateStr}</div>
        <div class="s">${s.dayCount} Tag(e) im Bestand</div>
      </div>
      <button type="button" data-idx="${idx}" class="history-redo">Wiederherstellen</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.history-redo').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = snapshots[parseInt(btn.dataset.idx)];
      const dt = new Date(s.timestamp);
      const ok = window.confirm(`Auf den Stand vom ${dt.toLocaleDateString('de-DE')} ${pad(dt.getHours())}:${pad(dt.getMinutes())} zurücksetzen (${s.dayCount} Tage)? Alles, was du seitdem eingetragen hast, geht dabei verloren.`);
      if(!ok) return;
      days = s.days;
      settings = {...settings, ...s.settings};
      saveDays(days);
      saveSettings(settings);
      snapshotModal.classList.remove('open');
      render();
      toast('Sicherheitskopie wiederhergestellt');
    });
  });
}

/* ===== Changelog: "Was ist neu" nach Updates ===== */
// Hier bei jedem Update eine neue Zeile ergänzen (Version → Liste der Änderungen).
const CHANGELOG = {
  'v49': [
    'Neu: Dieser "Was ist neu"-Hinweis selbst – erscheint ab jetzt automatisch nach jedem Update.',
  ],
  'v50': [
    'Neu: "Feiertag" als eigener, wählbarer Tagestyp neben Urlaub/Krankheit/Schule/Abbau – erscheint jetzt auch im PDF/CSV/Excel-Export.',
  ],
  'v51': [
    'PDF-Design komplett überarbeitet: schlichte, sachliche Tabellenoptik statt bunter Karten – bessere Lesbarkeit und leichter nachzuvollziehen.',
    'Neu: große Monats-/Zeitraum-Überschrift oben auf jeder PDF-Seite.',
  ],
  'v52': [
    'PDF: Nachtarbeit/Schmutzzulage jetzt als eigene, gut sichtbare Spalte statt kleinem Buchstaben im Fließtext.',
  ],
  'v53': [
    'Feiertag-Kennzeichnung vereinheitlicht: automatische Erkennung und manueller "Feiertag"-Typ nutzen jetzt dieselbe Farbe.',
  ],
  'v54': [
    'Neu: "📋 Änderungsverlauf"-Button in den Einstellungen – zeigt alle bisherigen Updates zum manuellen Nachschauen, falls der automatische Hinweis mal verpasst wurde.',
  ],
  'v55': [
    'PDF (Standard): dünne Linie unter jeder Zeile plus etwas mehr Zeilenabstand – leichter zu lesen, ohne in der Zeile zu verrutschen.',
  ],
  'v56': [
    'Neuer Bereich "Über diese App" in den Einstellungen (Firmenname, Entwickler-Credit).',
    'Vollständiger Firmenname "John Haustechnik GmbH & Co KG" jetzt auch im PDF.',
    'Kleines Extra: 5x auf die Versionsnummer tippen.',
  ],
  'v57': [
    'Neu: automatische Notfall-Sicherheitskopien alle 14 Tage im Hintergrund (in den Einstellungen unter Datensicherung, deaktivierbar) – ersetzt keine echte Sicherung, aber ein zusätzliches Netz gegen Programmfehler.',
  ],
  'v58': [
    'Neu: automatische Überstunden-Bilanz – Arbeitstage werden mit den hinterlegten Standard-Arbeitszeiten verglichen (Ist minus Soll), zusammen mit den manuellen Abbau-Einträgen als laufendes Gesamtkonto. Neue Dashboard-Kachel "Überstunden" (ein-/ausschaltbar), bestehende Saldo-Grafik in der Jahresübersicht nutzt jetzt dieselbe Berechnung.',
  ],
  'v59': [
    'Neu in den Profil-Einstellungen: Startwerte für den Einstieg mitten im Jahr – "schon genommene Urlaubstage" und "Überstunden-Saldo beim Start" werden jetzt korrekt in Urlaubskonto und Überstunden-Bilanz eingerechnet.',
  ],
  'v60': [
    'Neuer Schalter "Σ anzeigen/ausblenden" neben "KW anzeigen" – blendet die Wochensummen-Spalte im Kalender bei Bedarf aus.',
  ],
  'v61': [
    'Einführung beim ersten Start fragt jetzt aktiv alle wichtigen Daten ab: Name & Adresse, Arbeitszeiten, Jahresurlaubstage sowie die Startwerte für Urlaub/Überstunden beim Einstieg – kein Suchen mehr in den Einstellungen nötig.',
  ],
  'v62': [
    'App-Icon überarbeitet: nutzt jetzt nur noch das Haus-Symbol des neuen Logos statt des vollen Schriftzugs – deutlich besser erkennbar auf dem Homescreen.',
  ],
  'v63': [
    'Neu: eigenes einfarbiges App-Icon für Androids "Themen-Symbole" (Material You) – bleibt jetzt auch bei eingefärbten Icons klar als Haus-Symbol erkennbar, statt zu verblassen.',
  ],
};

const changelogModal = document.getElementById('changelogModal');
document.getElementById('closeChangelog').addEventListener('click', () => changelogModal.classList.remove('open'));
document.getElementById('changelogOkBtn').addEventListener('click', () => changelogModal.classList.remove('open'));
changelogModal.addEventListener('click', (e) => { if(e.target === changelogModal) changelogModal.classList.remove('open'); });

function showChangelogModal(version, changes){
  document.getElementById('changelogTitle').textContent = `🆕 Was ist neu in ${version}`;
  document.getElementById('changelogList').innerHTML = changes.map(c => `<div style="margin-bottom:8px;">• ${escapeHtml(c)}</div>`).join('');
  changelogModal.classList.add('open');
}

function showFullChangelogModal(){
  const versions = Object.keys(CHANGELOG).sort().reverse();
  document.getElementById('changelogTitle').textContent = '📋 Änderungsverlauf';
  document.getElementById('changelogList').innerHTML = versions.map(v => `
    <div style="margin-bottom:14px;">
      <div style="font-weight:700;color:var(--primary);margin-bottom:4px;">${escapeHtml(v)}</div>
      ${CHANGELOG[v].map(c => `<div style="margin-bottom:4px;">• ${escapeHtml(c)}</div>`).join('')}
    </div>
  `).join('');
  changelogModal.classList.add('open');
}
document.getElementById('btnShowChangelog').addEventListener('click', () => {
  settingsModal.classList.remove('open');
  showFullChangelogModal();
});

function checkChangelog(){
  let lastSeen = null;
  try{ lastSeen = localStorage.getItem('sz_last_seen_version'); }catch(e){}

  if(lastSeen === null){
    // Erster Start überhaupt – nichts anzeigen, nur den aktuellen Stand merken
    try{ localStorage.setItem('sz_last_seen_version', APP_VERSION); }catch(e){}
    return;
  }
  if(lastSeen !== APP_VERSION && CHANGELOG[APP_VERSION]){
    showChangelogModal(APP_VERSION, CHANGELOG[APP_VERSION]);
  }
  try{ localStorage.setItem('sz_last_seen_version', APP_VERSION); }catch(e){}
}

/* ===== Init ===== */
const APP_VERSION = 'v63'; // wird bei jedem Update zusammen mit der Cache-Version in sw.js erhöht
document.getElementById('appVersionLabel').textContent = `Version ${APP_VERSION}`;
let versionTapCount = 0;
let versionTapTimer;
document.getElementById('appVersionLabel').addEventListener('click', () => {
  versionTapCount++;
  clearTimeout(versionTapTimer);
  versionTapTimer = setTimeout(() => { versionTapCount = 0; }, 1500);
  if(versionTapCount >= 5){
    versionTapCount = 0;
    toast('Made with ❤️ by Marcus Lüschen');
  }
});
applyDarkMode();
const logoImg = new Image();
logoImg.src = 'logo.png';

render();
checkAppLock();
checkOnboarding();
checkChangelog();
checkAutoSnapshot();

// App-Verknüpfung "Heute erfassen" (Homescreen-Shortcut)
const urlParams = new URLSearchParams(window.location.search);
if(urlParams.get('action') === 'today'){
  setTimeout(() => openDayModal(toISODate(new Date())), 300);
}
