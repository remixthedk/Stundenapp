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

/* ===== Storage ===== */
const DEFAULT_SETTINGS = {
  name:'', street:'', city:'',
  monThuStart:'07:00', monThuEnd:'16:15', monThuPause:60,
  friStart:'07:00', friEnd:'12:30', friPause:30,
  darkMode:false, lastBackupAt:null, urlaubstage:30
};

function loadSettings(){
  try{
    const raw = localStorage.getItem('sz_settings');
    return raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : {...DEFAULT_SETTINGS};
  }catch(e){ return {...DEFAULT_SETTINGS}; }
}
function saveSettings(s){ localStorage.setItem('sz_settings', JSON.stringify(s)); }

function loadDays(){
  try{
    const raw = localStorage.getItem('sz_days');
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function saveDays(days){ localStorage.setItem('sz_days', JSON.stringify(days)); }

function loadLockedMonths(){
  try{
    const raw = localStorage.getItem('sz_locked_months');
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function saveLockedMonths(list){ localStorage.setItem('sz_locked_months', JSON.stringify(list)); }
function monthKey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }

/* ===== State ===== */
let settings = loadSettings();
let days = loadDays();
let lockedMonths = loadLockedMonths();
let viewDate = new Date();
let editingDate = null; // ISO date of day currently being edited, null = new

/* ===== Day total calc ===== */
function dayTotal(day){
  if(day.type === 'work'){
    return (day.items||[]).reduce((s,i)=> s + (parseFloat(i.stunden)||0), 0);
  }
  if(day.type === 'abbau'){
    return parseFloat(day.abbauStunden)||0;
  }
  return 0; // urlaub, krankheit
}

/* ===== Dashboard ===== */
function renderDashboard(monthDays){
  const total = monthDays.reduce((s,d)=> s + dayTotal(d), 0);
  const urlaubTage = monthDays.filter(d=>d.type==='urlaub').length;
  const krankTage = monthDays.filter(d=>d.type==='krankheit').length;
  const schuleTage = monthDays.filter(d=>d.type==='schule').length;
  const abbau = monthDays.filter(d=>d.type==='abbau').reduce((s,d)=> s + dayTotal(d), 0);

  document.getElementById('dashboard').innerHTML = `
    <div class="dash-card"><div class="v">${fmtHours(total)}</div><div class="l">STD GESAMT</div></div>
    <div class="dash-card"><div class="v">${urlaubTage}</div><div class="l">URLAUB</div></div>
    <div class="dash-card"><div class="v">${krankTage}</div><div class="l">KRANK</div></div>
    <div class="dash-card"><div class="v">${schuleTage}</div><div class="l">SCHULE</div></div>
    <div class="dash-card"><div class="v">${fmtHours(abbau)}</div><div class="l">ABBAU</div></div>
  `;
}

/* ===== Month lock ===== */
function isMonthLocked(d){ return lockedMonths.includes(monthKey(d)); }

function renderLockState(){
  const locked = isMonthLocked(viewDate);
  const btn = document.getElementById('lockMonth');
  btn.textContent = locked ? '🔒' : '🔓';
  btn.title = locked ? 'Monat entsperren' : 'Monat abschließen';
  document.getElementById('btnAddDay').style.opacity = locked ? '0.5' : '1';
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

  // 1x pro Tag prüfen, nicht bei jedem Render nerven
  const lastCheck = localStorage.getItem('sz_lastNoticeCheck');
  let message = null;

  // fehlender Werktag (gestern, falls Mo-Fr und kein Eintrag)
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
  const yDow = yesterday.getDay();
  const yISO = toISODate(yesterday);
  if(lastCheck !== todayISO && yDow >= 1 && yDow <= 5 && !days.find(d=>d.date===yISO)){
    message = `Für ${fmtDate(yesterday)} (${WEEKDAYS[yDow]}) wurde noch nichts erfasst.`;
  }

  // Backup-Erinnerung (nur wenn kein dringenderer Hinweis ansteht)
  if(!message && lastCheck !== todayISO){
    const last = settings.lastBackupAt ? new Date(settings.lastBackupAt) : null;
    const daysSince = last ? (Date.now() - last.getTime())/86400000 : Infinity;
    if(daysSince > 30){
      message = last
        ? `Letzte Datensicherung ist ${Math.floor(daysSince)} Tage her. Zeit für eine neue?`
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
function renderCalendar(monthDays){
  const y = viewDate.getFullYear(), m = viewDate.getMonth();
  const byDate = {};
  monthDays.forEach(d => byDate[d.date] = d);

  const firstOfMonth = new Date(y, m, 1);
  const offset = (firstOfMonth.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();
  const todayISO = toISODate(new Date());

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  // leading muted cells (previous month)
  for(let i=offset-1; i>=0; i--){
    const cell = document.createElement('div');
    cell.className = 'cal-cell muted';
    cell.textContent = daysInPrevMonth - i;
    grid.appendChild(cell);
  }

  // actual days
  for(let day=1; day<=daysInMonth; day++){
    const dateObj = new Date(y, m, day);
    const iso = toISODate(dateObj);
    const entry = byDate[iso];
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if(iso === todayISO) cell.classList.add('today');
    if(entry){
      cell.classList.add('has-entry', 'type-'+entry.type);
      cell.innerHTML = `<span>${day}</span><span class="hrs">${fmtHours(dayTotal(entry))}</span>`;
    } else {
      cell.innerHTML = `<span>${day}</span>`;
    }
    cell.addEventListener('click', () => openDayModal(iso));
    grid.appendChild(cell);
  }

  // trailing muted cells to complete the last row
  const totalCells = offset + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for(let i=1; i<=trailing; i++){
    const cell = document.createElement('div');
    cell.className = 'cal-cell muted';
    cell.textContent = i;
    grid.appendChild(cell);
  }
}

/* ===== Rendering: month list ===== */
function render(){
  document.getElementById('monthLabel').textContent = `${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
  document.getElementById('employeeSubline').textContent = settings.name ? settings.name : 'John Haustechnik';

  const y = viewDate.getFullYear(), m = viewDate.getMonth();
  const monthDays = days
    .filter(d => { const dt = fromISODate(d.date); return dt.getFullYear()===y && dt.getMonth()===m; })
    .sort((a,b)=> a.date.localeCompare(b.date));

  renderCalendar(monthDays);
  renderDashboard(monthDays);
  renderLockState();
  renderNotices();

  const container = document.getElementById('listContainer');
  container.innerHTML = '';

  if(monthDays.length === 0){
    container.innerHTML = `<div class="empty-state">Noch keine Einträge für diesen Monat.<br>Tippe unten auf „+ Tag erfassen“.</div>`;
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
      const dt = fromISODate(d.date);
      const card = document.createElement('div');
      card.className = 'day-card';
      card.dataset.date = d.date;

      let bodyHtml = '';
      if(d.type === 'work'){
        const items = d.items || [];
        bodyHtml = items.map(it => `
          <div class="item-line">
            <span class="k"><b>${escapeHtml(it.kunde || 'Büroarbeiten')}</b>${it.taetigkeit ? ' · ' + escapeHtml(it.taetigkeit) : ''}</span>
            <span>${fmtHours(parseFloat(it.stunden)||0)}</span>
          </div>`).join('');
      } else {
        const labels = {urlaub:'Urlaub', krankheit:'Krankheit', schule:'Schule', abbau:'Überstundenabbau'};
        const label = labels[d.type] || d.type;
        bodyHtml = `<span class="badge ${d.type}">${label}</span>`;
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
      card.addEventListener('click', () => openDayModal(d.date));
      groupEl.appendChild(card);
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

function openDayModal(targetDate){
  const checkDate = targetDate ? fromISODate(targetDate) : new Date();
  if(isMonthLocked(checkDate)){
    toast('Monat ist abgeschlossen – zum Bearbeiten erst entsperren');
    return;
  }

  populateKundenDatalist();

  const existing = targetDate ? days.find(d=>d.date===targetDate) : null;
  editingDate = existing ? existing.date : null;

  document.getElementById('dayModalTitle').textContent = existing ? 'Tag bearbeiten' : 'Tag erfassen';
  document.getElementById('deleteDay').style.display = existing ? 'block' : 'none';
  document.getElementById('copyPrevDayBtn').style.display = existing ? 'none' : 'block';

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
}

document.getElementById('typeTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.type-tab');
  if(!tab) return;
  setActiveType(tab.dataset.type);
  updateDayTotalDisplay();
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
    <label>Tätigkeit</label>
    <input type="text" class="it-taetigkeit" placeholder="Ausgeführte Arbeit" value="${existing? escapeHtml(existing.taetigkeit||'') : ''}">
    <label>Stunden</label>
    <input type="number" class="it-stunden" step="0.25" value="${existing? existing.stunden : ''}">
  `;
  wrap.querySelector('.remove-item').addEventListener('click', () => {
    wrap.remove();
    updateDayTotalDisplay();
  });
  wrap.querySelectorAll('input').forEach(inp => inp.addEventListener('input', updateDayTotalDisplay));
  document.getElementById('itemsContainer').appendChild(wrap);
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
    stunden: parseFloat(card.querySelector('.it-stunden').value) || 0
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
  const date = document.getElementById('dayDate').value;
  if(!date){ toast('Bitte ein Datum wählen'); return; }
  if(isMonthLocked(fromISODate(date))){ toast('Monat ist abgeschlossen'); return; }
  const type = document.querySelector('.type-tab.active').dataset.type;

  let record = { date, type };
  if(type === 'work'){
    const items = collectItems().filter(i => i.kunde || i.taetigkeit || i.stunden);
    if(items.length === 0){ toast('Mindestens einen Eintrag hinzufügen'); return; }
    record.start = document.getElementById('dayStart').value;
    record.end = document.getElementById('dayEnd').value;
    record.pause = parseFloat(document.getElementById('dayPause').value) || 0;
    record.items = items;
  } else if(type === 'abbau'){
    record.abbauStunden = parseFloat(document.getElementById('abbauStunden').value) || 0;
  }

  days = days.filter(d => d.date !== date); // replace if exists
  days.push(record);
  saveDays(days);
  closeDayModal();
  render();
  toast('Gespeichert');
});

document.getElementById('deleteDay').addEventListener('click', () => {
  if(!editingDate) return;
  days = days.filter(d => d.date !== editingDate);
  saveDays(days);
  closeDayModal();
  render();
  toast('Tag gelöscht');
});

function closeDayModal(){ dayModal.classList.remove('open'); }
document.getElementById('closeDayModal').addEventListener('click', closeDayModal);
dayModal.addEventListener('click', (e) => { if(e.target === dayModal) closeDayModal(); });
document.getElementById('btnAddDay').addEventListener('click', () => openDayModal(null));

/* ===== Settings Modal ===== */
function openSettings(){
  document.getElementById('setName').value = settings.name;
  document.getElementById('setStreet').value = settings.street;
  document.getElementById('setCity').value = settings.city;
  document.getElementById('setUrlaubstage').value = settings.urlaubstage != null ? settings.urlaubstage : 30;
  document.getElementById('setMonThuStart').value = settings.monThuStart;
  document.getElementById('setMonThuEnd').value = settings.monThuEnd;
  document.getElementById('setMonThuPause').value = settings.monThuPause;
  document.getElementById('setFriStart').value = settings.friStart;
  document.getElementById('setFriEnd').value = settings.friEnd;
  document.getElementById('setFriPause').value = settings.friPause;
  document.getElementById('setDarkMode').checked = !!settings.darkMode;
  document.getElementById('lastBackupInfo').textContent = settings.lastBackupAt
    ? `Letzte Sicherung: ${new Date(settings.lastBackupAt).toLocaleString('de-DE')}`
    : 'Noch keine Sicherung erstellt.';
  settingsModal.classList.add('open');
}
document.getElementById('btnSettings').addEventListener('click', openSettings);
document.getElementById('closeSettings').addEventListener('click', () => settingsModal.classList.remove('open'));
settingsModal.addEventListener('click', (e) => { if(e.target === settingsModal) settingsModal.classList.remove('open'); });

function applyDarkMode(){
  document.body.classList.toggle('dark', !!settings.darkMode);
}

document.getElementById('saveSettings').addEventListener('click', () => {
  settings = {
    ...settings,
    name: document.getElementById('setName').value.trim(),
    street: document.getElementById('setStreet').value.trim(),
    city: document.getElementById('setCity').value.trim(),
    urlaubstage: parseFloat(document.getElementById('setUrlaubstage').value) || 0,
    monThuStart: document.getElementById('setMonThuStart').value,
    monThuEnd: document.getElementById('setMonThuEnd').value,
    monThuPause: parseFloat(document.getElementById('setMonThuPause').value) || 0,
    friStart: document.getElementById('setFriStart').value,
    friEnd: document.getElementById('setFriEnd').value,
    friPause: parseFloat(document.getElementById('setFriPause').value) || 0,
    darkMode: document.getElementById('setDarkMode').checked,
  };
  saveSettings(settings);
  applyDarkMode();
  settingsModal.classList.remove('open');
  render();
  toast('Einstellungen gespeichert');
});

/* ===== Search ===== */
const searchModal = document.getElementById('searchModal');
document.getElementById('btnSearch').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
  searchModal.classList.add('open');
  setTimeout(()=> document.getElementById('searchInput').focus(), 150);
});
document.getElementById('closeSearch').addEventListener('click', () => searchModal.classList.remove('open'));
searchModal.addEventListener('click', (e) => { if(e.target === searchModal) searchModal.classList.remove('open'); });

document.getElementById('searchInput').addEventListener('input', (e) => {
  runSearch(e.target.value.trim().toLowerCase());
});

function runSearch(q){
  const resultsEl = document.getElementById('searchResults');
  if(!q){ resultsEl.innerHTML = ''; return; }

  const matches = [];
  days.forEach(day => {
    if(day.type !== 'work') return;
    (day.items||[]).forEach(it => {
      const kunde = (it.kunde||'').toLowerCase();
      const taetigkeit = (it.taetigkeit||'').toLowerCase();
      if(kunde.includes(q) || taetigkeit.includes(q)){
        matches.push({date: day.date, kunde: it.kunde, taetigkeit: it.taetigkeit, stunden: it.stunden});
      }
    });
  });

  matches.sort((a,b)=> b.date.localeCompare(a.date));

  if(matches.length === 0){
    resultsEl.innerHTML = `<div class="search-empty">Keine Treffer für „${escapeHtml(q)}“</div>`;
    return;
  }

  resultsEl.innerHTML = matches.map(m => {
    const dt = fromISODate(m.date);
    return `<div class="search-result" data-date="${m.date}">
      <div class="sr-top"><span>${escapeHtml(m.kunde||'Büroarbeiten')}</span><span>${fmtHours(m.stunden)} Std</span></div>
      <div class="sr-sub">${fmtDate(dt)}${m.taetigkeit ? ' · ' + escapeHtml(m.taetigkeit) : ''}</div>
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

    const ok = window.confirm(
      `Sicherung vom ${data.exportedAt ? new Date(data.exportedAt).toLocaleString('de-DE') : 'unbekannt'} laden?\n` +
      `Alle aktuellen Daten auf diesem Handy werden dabei ersetzt.`
    );
    if(!ok) return;

    settings = Object.assign({...DEFAULT_SETTINGS}, data.settings);
    days = data.days;
    saveSettings(settings);
    saveDays(days);
    render();
    settingsModal.classList.remove('open');
    toast('Sicherung wiederhergestellt');
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

function renderAnalytics(){
  document.getElementById('yearLabel').textContent = analyticsYear;

  const yearDays = days.filter(d => fromISODate(d.date).getFullYear() === analyticsYear);

  const totalStd = yearDays.reduce((s,d)=> s + dayTotal(d), 0);
  const urlaubGenommen = yearDays.filter(d=>d.type==='urlaub').length;
  const urlaubRest = Math.max((settings.urlaubstage||0) - urlaubGenommen, 0);
  const krankTage = yearDays.filter(d=>d.type==='krankheit').length;
  const schuleTage = yearDays.filter(d=>d.type==='schule').length;
  const abbauSaldo = yearDays.filter(d=>d.type==='abbau').reduce((s,d)=> s + dayTotal(d), 0);

  document.getElementById('yearDashboard').innerHTML = `
    <div class="dash-card"><div class="v">${fmtHours(totalStd)}</div><div class="l">STD GESAMT</div></div>
    <div class="dash-card"><div class="v">${urlaubRest}</div><div class="l">URLAUB REST</div></div>
    <div class="dash-card"><div class="v">${urlaubGenommen}</div><div class="l">URLAUB WEG</div></div>
    <div class="dash-card"><div class="v">${krankTage}</div><div class="l">KRANK</div></div>
    <div class="dash-card"><div class="v">${schuleTage}</div><div class="l">SCHULE</div></div>
  `;

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

document.getElementById('btnExportCsv').addEventListener('click', () => {
  const monthDays = currentMonthDays();
  if(monthDays.length === 0){ toast('Keine Einträge in diesem Monat'); return; }

  const rows = [['Datum','Wochentag','KW','Typ','Kunde','Taetigkeit','Stunden']];
  monthDays.forEach(d => {
    const dt = fromISODate(d.date);
    const wk = isoWeek(dt);
    if(d.type === 'work'){
      (d.items||[]).forEach(it => {
        rows.push([fmtDate(dt), WEEKDAYS[dt.getDay()], wk, 'Arbeit', it.kunde||'', it.taetigkeit||'', fmtHours(parseFloat(it.stunden)||0)]);
      });
    } else {
      const csvLabels = {urlaub:'Urlaub', krankheit:'Krankheit', schule:'Schule', abbau:'Ueberstundenabbau'};
      const label = csvLabels[d.type] || d.type;
      rows.push([fmtDate(dt), WEEKDAYS[dt.getDay()], wk, label, '', '', fmtHours(dayTotal(d))]);
    }
  });

  const csv = rows.map(r => r.map(cell => {
    const s = String(cell).replace(/"/g,'""');
    return /[;"\n]/.test(s) ? `"${s}"` : s;
  }).join(';')).join('\r\n');

  const fname = `Stundenzettel_${(settings.name||'').replace(/\s+/g,'-')}_${MONTHS[viewDate.getMonth()]}-${viewDate.getFullYear()}.csv`;
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV heruntergeladen');
});

document.getElementById('btnExport').addEventListener('click', async () => {
  const monthDays = currentMonthDays();
  if(monthDays.length === 0){ toast('Keine Einträge in diesem Monat'); return; }
  if(!settings.name){ toast('Bitte zuerst Name in Einstellungen eintragen'); openSettings(); return; }
  await generateStundenzettelPDF(monthDays, settings, viewDate, logoImg);
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

/* ===== Service worker ===== */
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}

/* ===== Init ===== */
applyDarkMode();
const logoImg = new Image();
logoImg.src = 'logo.png';

render();
