/* Generates a clean, table-based Stundenzettel PDF (sachlich, eine Akzentfarbe) */

const COMPANY = { name: 'John Haustechnik', street: 'Friedrichsfehner Str. 8', city: '26188 Edewecht' };
const PDF_WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];

const PRIMARY = [27,75,102];
const MUTED = [90,101,112];
const TEXT_DARK = [20,20,20];
const BORDER_GREY = [222,225,222];
const STRIPE_A = [255,255,255];
const STRIPE_B = [246,247,246];

function pdfPad(n){ return String(n).padStart(2,'0'); }
function pdfFmtDate(dObj){ return `${pdfPad(dObj.getDate())}.${pdfPad(dObj.getMonth()+1)}.${dObj.getFullYear()}`; }
function pdfFmtHours(n){ return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2).replace('.', ','); }

function dayTotalPdf(day){
  if(day.type === 'work') return (day.items||[]).reduce((s,i)=>s+(parseFloat(i.stunden)||0),0);
  if(day.type === 'abbau') return parseFloat(day.abbauStunden)||0;
  return 0;
}

function specialLabel(day){
  if(day.type==='urlaub') return 'Urlaub';
  if(day.type==='krankheit') return 'Krankheit';
  if(day.type==='schule') return 'Schule';
  if(day.type==='feiertag') return 'Feiertag';
  const v = parseFloat(day.abbauStunden)||0;
  return `Überstundenabbau · ${v>0?'+':''}${pdfFmtHours(v)} Std`;
}

// Liefert die anzuzeigenden Zeilen eines Tages: bei Arbeit ein Eintrag pro Kunde,
// sonst eine einzelne Zeile mit der Sonderbezeichnung (Urlaub/Krankheit/...).
function dayRows(day){
  if(day.type === 'work'){
    return (day.items||[]).map(it => {
      let desc = it.kunde || 'Büroarbeiten';
      if(it.taetigkeit) desc += ` – ${it.taetigkeit}`;
      const tags = [];
      if(it.nachtarbeit) tags.push('N');
      if(it.schmutzzulage) tags.push('S');
      return { desc, hours: parseFloat(it.stunden)||0, italic:false, zuschlag: tags.join('/') };
    });
  }
  return [{ desc: specialLabel(day), hours: dayTotalPdf(day), italic:true, zuschlag:'' }];
}

// Große Monats-/Zeitraum-Überschrift, passt sich automatisch an den gewählten Zeitraum an.
function periodHeading(firstDate, lastDate){
  const sameMonth = firstDate.getFullYear()===lastDate.getFullYear() && firstDate.getMonth()===lastDate.getMonth();
  if(sameMonth) return `${MONTHS[firstDate.getMonth()]} ${firstDate.getFullYear()}`;
  const sameYear = firstDate.getFullYear()===lastDate.getFullYear();
  if(sameYear) return `${MONTHS[firstDate.getMonth()]} – ${MONTHS[lastDate.getMonth()]} ${firstDate.getFullYear()}`;
  return `${MONTHS[firstDate.getMonth()]} ${firstDate.getFullYear()} – ${MONTHS[lastDate.getMonth()]} ${lastDate.getFullYear()}`;
}

function truncateToWidth(doc, text, maxW){
  let shown = text;
  while(doc.getTextWidth(shown) > maxW && shown.length > 3){
    shown = shown.slice(0, -2);
  }
  if(shown !== text) shown = shown.trim() + '…';
  return shown;
}

function loadImageAsDataURL(imgEl){
  return new Promise((resolve) => {
    if(!imgEl){ resolve(null); return; }
    const ready = () => {
      try{
        const canvas = document.createElement('canvas');
        canvas.width = imgEl.naturalWidth;
        canvas.height = imgEl.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgEl, 0, 0);
        resolve({dataUrl: canvas.toDataURL('image/png'), ratio: imgEl.naturalHeight / imgEl.naturalWidth});
      }catch(e){ resolve(null); }
    };
    if(imgEl.complete && imgEl.naturalWidth > 0){ ready(); }
    else{
      imgEl.onload = ready;
      imgEl.onerror = () => resolve(null);
    }
  });
}

async function saveOrSharePdf(doc, fname, forceDownload){
  const blob = doc.output('blob');
  if(!forceDownload && navigator.canShare){
    try{
      const file = new File([blob], fname, {type:'application/pdf'});
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file], title:fname});
        return;
      }
    }catch(e){ return; } // Nutzer hat abgebrochen oder Teilen fehlgeschlagen -> kein Zwangs-Download
  }
  doc.save(fname);
}

async function generateStundenzettelPDF(monthDays, settings, viewDate, logoImgEl, forceDownload, periodLabel){
  if(typeof window.jspdf === 'undefined'){
    if(typeof toast === 'function') toast('PDF-Funktion nicht verfügbar – bitte einmal mit Internet öffnen, dann klappt es auch offline');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'a4' });

  const createdAt = new Date();
  const createdAtStr = `${pdfFmtDate(createdAt)}, ${pdfPad(createdAt.getHours())}:${pdfPad(createdAt.getMinutes())} Uhr`;

  const logo = await loadImageAsDataURL(logoImgEl);
  const LOGO_W = 32;
  const logoH = logo ? LOGO_W * logo.ratio : 0;

  const PW = 210, PH = 297, M = 14;
  const contentW = PW - M*2;
  const colDate = M, colKw = M + 22, colDesc = M + 32;
  const colZuschlagRight = M + contentW - 22;

  const HEADER_H = 33;
  const TABLEHEAD_H = 6;
  const FOOTER_H = 10;
  const ROW_H = 5;
  const DAY_GAP = 3.2;
  const BOTTOMBAR_H = 9;

  const hasZulagen = monthDays.some(d => (d.items||[]).some(it => it.nachtarbeit || it.schmutzzulage));
  const allDates = monthDays.map(d => new Date(d.date+'T00:00:00'));
  const overallFirst = allDates[0], overallLast = allDates[allDates.length-1];
  const heading = periodHeading(overallFirst, overallLast);

  // ----- Pass 1: paginate -----
  const availableBase = PH - M*2 - HEADER_H - TABLEHEAD_H - FOOTER_H - BOTTOMBAR_H - 2;
  const pages = [];
  let current = [];
  let usedH = 0;

  monthDays.forEach(day => {
    const rows = dayRows(day);
    const blockH = (rows.length + 1) * ROW_H + DAY_GAP;
    if(current.length > 0 && usedH + blockH > availableBase){
      pages.push(current);
      current = [];
      usedH = 0;
    }
    current.push(day);
    usedH += blockH;
  });
  if(current.length) pages.push(current);
  const totalPages = pages.length;

  // ----- Pass 2: render -----
  let runningTotal = 0;

  pages.forEach((pageDays, pIdx) => {
    if(pIdx > 0) doc.addPage();
    const pageNum = pIdx + 1;
    const isLast = pageNum === totalPages;

    // ---- Kopf: Logo, Firmen-/Mitarbeiteradresse ----
    if(logo){
      doc.addImage(logo.dataUrl, 'PNG', M, M, LOGO_W, logoH);
    } else {
      doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...PRIMARY);
      doc.text('John Haustechnik', M, M+5);
    }
    const logoBottomY = logo ? M + logoH + 3.5 : M + 9.5;
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`${COMPANY.street} · ${COMPANY.city}`, M, logoBottomY);

    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...TEXT_DARK);
    doc.text(settings.name || '', M+contentW, M+5, {align:'right'});
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    const addr = [settings.street, settings.city].filter(Boolean).join(' · ');
    doc.text(addr, M+contentW, M+9.5, {align:'right'});

    doc.setDrawColor(...PRIMARY); doc.setLineWidth(0.7);
    doc.line(M, M+19, M+contentW, M+19);

    // ---- Große Monats-/Zeitraum-Überschrift ----
    doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(...PRIMARY);
    doc.text(heading, M, M+27);

    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
    doc.text(`Zeitraum: ${pdfFmtDate(overallFirst)} – ${pdfFmtDate(overallLast)}`, M+contentW, M+25.5, {align:'right'});
    doc.setFont('helvetica','bold'); doc.setTextColor(...PRIMARY);
    doc.text(`Seite ${pageNum} von ${totalPages}`, M+contentW, M+29.5, {align:'right'});

    doc.setDrawColor(...BORDER_GREY); doc.setLineWidth(0.4);
    doc.line(M, M+HEADER_H-1, M+contentW, M+HEADER_H-1);

    let y = M + HEADER_H;

    // ---- Tabellenkopf ----
    doc.setFillColor(...PRIMARY);
    doc.rect(M, y, contentW, TABLEHEAD_H, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(255,255,255);
    doc.text('DATUM', colDate+2, y+4.2);
    doc.text('KW', colKw+1, y+4.2);
    doc.text('KUNDE / TÄTIGKEIT', colDesc, y+4.2);
    doc.text('ZUSCHLAG', colZuschlagRight, y+4.2, {align:'right'});
    doc.text('STUNDEN', M+contentW-2, y+4.2, {align:'right'});
    y += TABLEHEAD_H;

    // ---- Tagesblöcke ----
    let stripeToggle = true;
    const descMaxW = colZuschlagRight - 18 - colDesc - 2;

    pageDays.forEach(day => {
      const dt = new Date(day.date + 'T00:00:00');
      const wk = isoWeek(dt);
      const rows = dayRows(day);
      const blockH = (rows.length + 1) * ROW_H;
      const blockTop = y;

      const bg = stripeToggle ? STRIPE_A : STRIPE_B;
      stripeToggle = !stripeToggle;
      doc.setFillColor(...bg);
      doc.rect(M, blockTop, contentW, blockH, 'F');
      doc.setFillColor(...PRIMARY);
      doc.rect(M, blockTop, 0.9, blockH, 'F');

      let yy = blockTop;
      const dateLabel = `${PDF_WEEKDAYS[dt.getDay()].slice(0,2)} ${pdfPad(dt.getDate())}.${pdfPad(dt.getMonth()+1)}.`;
      doc.setFont('helvetica','bold'); doc.setFontSize(8.3); doc.setTextColor(...TEXT_DARK);
      doc.text(dateLabel, colDate+2.5, yy+3.6);
      doc.setFont('helvetica','normal'); doc.setTextColor(...MUTED);
      doc.text(String(wk), colKw+1, yy+3.6);

      rows.forEach(row => {
        doc.setFont('helvetica', row.italic ? 'italic' : 'normal');
        doc.setFontSize(8.3); doc.setTextColor(...TEXT_DARK);
        doc.text(truncateToWidth(doc, row.desc, descMaxW), colDesc, yy+3.6);
        if(row.zuschlag){
          doc.setFont('helvetica','bold'); doc.setTextColor(...PRIMARY);
          doc.text(row.zuschlag, colZuschlagRight, yy+3.6, {align:'right'});
        }
        doc.setFont('helvetica','normal'); doc.setTextColor(...TEXT_DARK);
        doc.text(pdfFmtHours(row.hours), M+contentW-2, yy+3.6, {align:'right'});
        yy += ROW_H;
      });

      doc.setDrawColor(...PRIMARY); doc.setLineWidth(0.3);
      doc.line(colDesc-2, yy, M+contentW-2, yy);
      doc.setFont('helvetica','bold'); doc.setFontSize(8.3); doc.setTextColor(...PRIMARY);
      doc.text(`Tagessumme ${dateLabel}`, colDesc, yy+3.6);
      doc.text(pdfFmtHours(dayTotalPdf(day)), M+contentW-2, yy+3.6, {align:'right'});

      y = blockTop + blockH + DAY_GAP;
      runningTotal += dayTotalPdf(day);
    });

    doc.setDrawColor(...BORDER_GREY); doc.setLineWidth(0.3);
    doc.line(M, y-DAY_GAP+1.5, M+contentW, y-DAY_GAP+1.5);

    // ---- Summenbalken ----
    doc.setFillColor(...PRIMARY);
    doc.rect(M, y, contentW, BOTTOMBAR_H, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(255,255,255);
    const bottomLabel = isLast ? 'Gesamtsumme' : 'Übertrag auf nächste Seite';
    doc.text(bottomLabel, M+4, y+BOTTOMBAR_H/2+1.4);
    doc.text(`${pdfFmtHours(runningTotal)} Std`, M+contentW-4, y+BOTTOMBAR_H/2+1.4, {align:'right'});

    // ---- Legende ----
    if(hasZulagen){
      doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(...MUTED);
      doc.text('(N) = Nachtarbeit   (S) = Schmutzzulage – gesondert abgerechnet', M, y+BOTTOMBAR_H+6);
    }

    // ---- Fußzeile ----
    const fy = PH - M - 6;
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(150,156,159);
    doc.text(`Seite ${pageNum}/${totalPages}`, PW/2, fy, {align:'center'});
    doc.setFontSize(6); doc.setTextColor(175,180,183);
    doc.text(`Erstellt am ${createdAtStr}`, M+contentW, fy, {align:'right'});

    // ---- Schmaler Farbstreifen am linken Blattrand ----
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, 2.2, PH, 'F');
  });

  const fname = `${(settings.name||'Unbekannt').replace(/\s+/g,'-')}-${periodLabel || (MONTHS[viewDate.getMonth()]+'-'+viewDate.getFullYear())}.pdf`;
  await saveOrSharePdf(doc, fname, forceDownload);
}

/* ===== Kompakte Variante: eine Zeile pro Tag statt Karte, für lange Zeiträume (z.B. ganzes Jahr) ===== */
async function generateStundenzettelPDFCompact(monthDays, settings, viewDate, logoImgEl, forceDownload, periodLabel){
  if(typeof window.jspdf === 'undefined'){
    if(typeof toast === 'function') toast('PDF-Funktion nicht verfügbar – bitte einmal mit Internet öffnen, dann klappt es auch offline');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'a4' });

  const createdAt = new Date();
  const createdAtStr = `${pdfFmtDate(createdAt)}, ${pdfPad(createdAt.getHours())}:${pdfPad(createdAt.getMinutes())} Uhr`;

  const logo = await loadImageAsDataURL(logoImgEl);
  const LOGO_W = 24;
  const logoH = logo ? LOGO_W * logo.ratio : 0;

  const PW = 210, PH = 297, M = 14;
  const contentW = PW - M*2;
  const HEADER_H = 24;
  const FOOTER_H = 8;
  const WEEKHEAD_H = 5.5;
  const ROW_H = 5;
  const BOTTOMBAR_H = 7;

  const weekTotals = {};
  monthDays.forEach(d => {
    const wk = isoWeek(new Date(d.date+'T00:00:00'));
    weekTotals[wk] = (weekTotals[wk]||0) + dayTotalPdf(d);
  });

  const hasZulagen = monthDays.some(d => (d.items||[]).some(it => it.nachtarbeit || it.schmutzzulage));
  const allDates = monthDays.map(d => new Date(d.date+'T00:00:00'));
  const overallFirst = allDates[0], overallLast = allDates[allDates.length-1];
  const heading = periodHeading(overallFirst, overallLast);

  // ----- Pass 1: paginate -----
  const availableBase = PH - M*2 - HEADER_H - FOOTER_H - BOTTOMBAR_H - 2;
  const pages = [];
  let current = [];
  let usedH = 0;
  let lastWeekOnPage = null;

  monthDays.forEach(day => {
    const wk = isoWeek(new Date(day.date+'T00:00:00'));
    const needsWeekHead = wk !== lastWeekOnPage;
    const blockH = (needsWeekHead ? WEEKHEAD_H : 0) + ROW_H;
    if(current.length > 0 && usedH + blockH > availableBase){
      pages.push(current);
      current = [];
      usedH = 0;
      lastWeekOnPage = null;
    }
    current.push(day);
    usedH += (wk !== lastWeekOnPage ? WEEKHEAD_H : 0) + ROW_H;
    lastWeekOnPage = wk;
  });
  if(current.length) pages.push(current);
  const totalPages = pages.length;

  // ----- Pass 2: render -----
  let runningTotal = 0;

  pages.forEach((pageDays, pIdx) => {
    if(pIdx > 0) doc.addPage();
    const pageNum = pIdx + 1;
    const isLast = pageNum === totalPages;

    if(logo){
      doc.addImage(logo.dataUrl, 'PNG', M, M, LOGO_W, logoH);
    } else {
      doc.setFont('helvetica','bold'); doc.setFontSize(11.5); doc.setTextColor(...PRIMARY);
      doc.text('John Haustechnik', M, M+4.5);
    }
    const logoBottomY = logo ? M + logoH + 2.8 : M + 8.5;
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text(`${COMPANY.street} · ${COMPANY.city}`, M, logoBottomY);

    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...TEXT_DARK);
    doc.text(settings.name || '', M+contentW, M+4.5, {align:'right'});
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text(`Seite ${pageNum} von ${totalPages}`, M+contentW, M+8.5, {align:'right'});

    doc.setDrawColor(...PRIMARY); doc.setLineWidth(0.6);
    doc.line(M, M+13.5, M+contentW, M+13.5);

    doc.setFont('helvetica','bold'); doc.setFontSize(12.5); doc.setTextColor(...PRIMARY);
    doc.text(heading, M, M+19.5);
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`${pdfFmtDate(overallFirst)} – ${pdfFmtDate(overallLast)}`, M+contentW, M+19.5, {align:'right'});

    let y = M + HEADER_H;
    let lastWeek = null;
    let rowIdx = 0;

    pageDays.forEach(day => {
      const dt = new Date(day.date + 'T00:00:00');
      const wk = isoWeek(dt);

      if(wk !== lastWeek){
        doc.setFillColor(246,247,245);
        doc.rect(M, y, contentW, WEEKHEAD_H-1, 'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...MUTED);
        doc.text(`KW ${wk}`, M+2, y+3.5);
        doc.setTextColor(...PRIMARY);
        doc.text(`${pdfFmtHours(weekTotals[wk]||0)} Std`, M+contentW-2, y+3.5, {align:'right'});
        y += WEEKHEAD_H;
        lastWeek = wk;
        rowIdx = 0;
      }

      if(rowIdx % 2 === 0){
        doc.setFillColor(248,249,248);
        doc.rect(M, y, contentW, ROW_H, 'F');
      }
      doc.setFillColor(...PRIMARY);
      doc.rect(M, y, 1.2, ROW_H, 'F');

      const dateStr = `${PDF_WEEKDAYS[dt.getDay()].slice(0,2)} ${pdfPad(dt.getDate())}.${pdfPad(dt.getMonth()+1)}`;
      doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...TEXT_DARK);
      doc.text(dateStr, M+4, y+3.6);

      let detailText, zuschlagTag = '';
      if(day.type === 'work'){
        const rows = dayRows(day);
        detailText = rows.map(r => r.desc).join(', ');
        const tags = new Set();
        rows.forEach(r => { if(r.zuschlag) r.zuschlag.split('/').forEach(t => tags.add(t)); });
        zuschlagTag = Array.from(tags).join('/');
      } else {
        detailText = specialLabel(day);
      }
      const colZuschlagRight = M+contentW-22;
      const detailX = M+24;
      const detailMaxW = colZuschlagRight - 14 - detailX;
      doc.setFont('helvetica','normal'); doc.setFontSize(7.2); doc.setTextColor(...MUTED);
      doc.text(truncateToWidth(doc, detailText, detailMaxW), detailX, y+3.6);

      if(zuschlagTag){
        doc.setFont('helvetica','bold'); doc.setFontSize(7.2); doc.setTextColor(...PRIMARY);
        doc.text(zuschlagTag, colZuschlagRight, y+3.6, {align:'right'});
      }

      doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...PRIMARY);
      doc.text(pdfFmtHours(dayTotalPdf(day)), M+contentW-2, y+3.6, {align:'right'});

      y += ROW_H;
      rowIdx++;
      runningTotal += dayTotalPdf(day);
    });

    doc.setFillColor(...PRIMARY);
    doc.rect(M, y+1, contentW, BOTTOMBAR_H, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(255,255,255);
    const bottomLabel = isLast ? 'Gesamtsumme' : 'Übertrag auf nächste Seite';
    doc.text(bottomLabel, M+4, y+1+BOTTOMBAR_H/2+1.2);
    doc.text(`${pdfFmtHours(runningTotal)} Std`, M+contentW-4, y+1+BOTTOMBAR_H/2+1.2, {align:'right'});

    const fy = PH - M - 6;
    if(hasZulagen){
      doc.setFont('helvetica','normal'); doc.setFontSize(6); doc.setTextColor(...MUTED);
      doc.text('(N) = Nachtarbeit   (S) = Schmutzzulage', M, fy);
    }
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(150,156,159);
    doc.text(`Seite ${pageNum}/${totalPages}`, M+contentW/2, fy, {align:'center'});
    doc.setFontSize(6); doc.setTextColor(175,180,183);
    doc.text(`Erstellt am ${createdAtStr}`, M+contentW, fy, {align:'right'});

    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, 2.2, PH, 'F');
  });

  const fname = `${(settings.name||'Unbekannt').replace(/\s+/g,'-')}-${periodLabel || (MONTHS[viewDate.getMonth()]+'-'+viewDate.getFullYear())}-kompakt.pdf`;
  await saveOrSharePdf(doc, fname, forceDownload);
}
