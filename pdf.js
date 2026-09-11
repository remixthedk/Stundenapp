/* Generates a clean, card-based Stundenzettel PDF */

const COMPANY = { name: 'John Haustechnik', street: 'Friedrichsfehner Str. 8', city: '26188 Edewecht' };
const PDF_WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];

const TYPE_COLORS = {
  work:      { accent:[27,75,102],  tint:[234,241,245] },
  urlaub:    { accent:[124,154,174],tint:[238,241,242] },
  krankheit: { accent:[179,67,43],  tint:[247,234,231] },
  schule:    { accent:[75,94,170],  tint:[235,237,247] },
  abbau:     { accent:[201,98,42],  tint:[247,238,227] },
};

function mixWithWhite(rgb, amount){
  // amount 0 = pure white, 1 = full color
  return rgb.map(c => Math.round(c*amount + 255*(1-amount)));
}

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
  const v = parseFloat(day.abbauStunden)||0;
  return `Überstundenabbau · ${v>0?'+':''}${pdfFmtHours(v)} Std`;
}

function cardHeight(day){
  let h = 6; // top+bottom padding
  h += 5.2; // header row (weekday/date + total)
  if(day.type === 'work'){
    h += 4.4; // meta row
    (day.items||[]).forEach(it => {
      h += 4.3;
      if(it.taetigkeit) h += 3.9;
      h += 1.4;
    });
  } else {
    h += 4.6; // special label row
  }
  return h;
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

async function generateStundenzettelPDF(monthDays, settings, viewDate, logoImgEl){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'a4' });

  const logo = await loadImageAsDataURL(logoImgEl);
  const LOGO_W = 20; // mm, dezent
  const logoH = logo ? LOGO_W * logo.ratio : 0;

  const PW = 210, PH = 297, M = 14;
  const contentW = PW - M*2;

  const HEADER_H = 26;
  const FOOTER_H = 24;
  const WEEKHEAD_H = 8;
  const CARD_GAP = 3;
  const BOTTOMBAR_H = 9;

  const weekTotals = {};
  monthDays.forEach(d => {
    const wk = isoWeek(new Date(d.date+'T00:00:00'));
    weekTotals[wk] = (weekTotals[wk]||0) + dayTotalPdf(d);
  });

  // ----- Pass 1: paginate -----
  const availableBase = PH - M*2 - HEADER_H - FOOTER_H - BOTTOMBAR_H - 4;
  const pages = [];
  let current = [];
  let usedH = 0;
  let lastWeekOnPage = null;

  monthDays.forEach(day => {
    const wk = isoWeek(new Date(day.date+'T00:00:00'));
    const needsWeekHead = wk !== lastWeekOnPage;
    const blockH = (needsWeekHead ? WEEKHEAD_H : 0) + cardHeight(day) + CARD_GAP;
    if(current.length > 0 && usedH + blockH > availableBase){
      pages.push(current);
      current = [];
      usedH = 0;
      lastWeekOnPage = null; // week header repeats on new page
    }
    current.push(day);
    usedH += (wk !== lastWeekOnPage ? WEEKHEAD_H : 0) + cardHeight(day) + CARD_GAP;
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
    const firstDate = new Date(pageDays[0].date + 'T00:00:00');
    const lastDate = new Date(pageDays[pageDays.length-1].date + 'T00:00:00');

    // ---- Header ----
    doc.setFont('helvetica','bold'); doc.setFontSize(13);
    doc.setTextColor(27,75,102);
    doc.text('John Haustechnik', M, M+5);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,128,133);
    doc.text(`${COMPANY.street} · ${COMPANY.city}`, M, M+9.5);

    const textRightX = logo ? (M+contentW-LOGO_W-4) : (M+contentW);

    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(20,20,20);
    doc.text(settings.name || '', textRightX, M+5, {align:'right'});
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,128,133);
    const addr = [settings.street, settings.city].filter(Boolean).join(' · ');
    doc.text(addr, textRightX, M+9.5, {align:'right'});

    if(logo){
      doc.addImage(logo.dataUrl, 'PNG', M+contentW-LOGO_W, M, LOGO_W, logoH);
    }

    doc.setDrawColor(27,75,102); doc.setLineWidth(0.6);
    doc.line(M, M+13.5, M+contentW, M+13.5);

    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(90,101,112);
    doc.text(`Zeitraum: ${pdfFmtDate(firstDate)} – ${pdfFmtDate(lastDate)}`, M, M+18.5);
    doc.setFont('helvetica','bold'); doc.setTextColor(27,75,102);
    doc.text(`Seite ${pageNum} von ${totalPages}`, M+contentW, M+18.5, {align:'right'});
    doc.setLineWidth(0.2);

    let y = M + HEADER_H;
    let lastWeek = null;

    pageDays.forEach(day => {
      const dt = new Date(day.date + 'T00:00:00');
      const wk = isoWeek(dt);

      if(wk !== lastWeek){
        doc.setFillColor(246,247,245);
        doc.roundedRect(M, y, contentW, WEEKHEAD_H-1.5, 1.5, 1.5, 'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(90,101,112);
        doc.text(`KALENDERWOCHE ${wk}`, M+3, y+4.6);
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(27,75,102);
        doc.text(`Wochensumme: ${pdfFmtHours(weekTotals[wk]||0)} Std`, M+contentW-3, y+4.6, {align:'right'});
        y += WEEKHEAD_H;
        lastWeek = wk;
      }

      const colors = TYPE_COLORS[day.type];
      const h = cardHeight(day);

      doc.setFillColor(...colors.tint);
      doc.roundedRect(M, y, contentW, h, 2, 2, 'F');
      doc.setFillColor(...colors.accent);
      doc.roundedRect(M, y, 2.6, h, 1.3, 1.3, 'F');
      doc.setFillColor(...colors.accent);
      doc.rect(M+1.3, y, 1.3, h, 'F'); // square off inner edge

      const cx = M + 7;
      let cy = y + 5.2;

      doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(20,20,20);
      doc.text(`${PDF_WEEKDAYS[dt.getDay()]}, ${pdfFmtDate(dt)}`, cx, cy);
      doc.setFont('helvetica','bold'); doc.setFontSize(9.5);
      doc.setTextColor(...colors.accent);
      doc.text(`${pdfFmtHours(dayTotalPdf(day))} Std`, M+contentW-3, cy, {align:'right'});
      cy += 4.2;

      if(day.type === 'work'){
        doc.setFont('helvetica','normal'); doc.setFontSize(7.6); doc.setTextColor(120,128,133);
        doc.text(`${day.start||'--:--'} – ${day.end||'--:--'} Uhr  ·  Pause ${day.pause||0} min`, cx, cy);
        cy += 4.4;

        const stripeColor = mixWithWhite(colors.accent, 0.16);

        (day.items||[]).forEach((it, idx) => {
          const rowH = 3.9 + (it.taetigkeit ? 3.9 : 0);
          if(idx % 2 === 0){
            doc.setFillColor(...stripeColor);
            doc.rect(M+3.2, cy-3.4, contentW-4.7, rowH, 'F');
          }

          doc.setFont('helvetica','bold'); doc.setFontSize(8.6); doc.setTextColor(20,20,20);
          doc.text(it.kunde || 'Büroarbeiten', cx, cy);
          doc.setFont('helvetica','bold'); doc.setFontSize(8.6); doc.setTextColor(60,68,75);
          doc.text(pdfFmtHours(parseFloat(it.stunden)||0), M+contentW-3, cy, {align:'right'});
          cy += 3.9;
          if(it.taetigkeit){
            doc.setFont('helvetica','italic'); doc.setFontSize(7.6); doc.setTextColor(110,118,124);
            doc.text(it.taetigkeit, cx, cy);
            cy += 3.9;
          }
          cy += 1.4;
        });
      } else {
        doc.setFont('helvetica','italic'); doc.setFontSize(8.6);
        doc.setTextColor(...colors.accent);
        doc.text(specialLabel(day), cx, cy);
      }

      y += h + CARD_GAP;
      runningTotal += dayTotalPdf(day);
    });

    // ---- Bottom bar ----
    doc.setFillColor(27,75,102);
    doc.roundedRect(M, y+1, contentW, BOTTOMBAR_H, 2, 2, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(255,255,255);
    const bottomLabel = isLast ? 'Gesamtsumme' : 'Übertrag auf nächste Seite';
    doc.text(bottomLabel, M+5, y+1+BOTTOMBAR_H/2+1.4);
    doc.text(`${pdfFmtHours(runningTotal)} Std`, M+contentW-5, y+1+BOTTOMBAR_H/2+1.4, {align:'right'});

    // ---- Footer / signatures ----
    let fy = PH - M - FOOTER_H + 6;
    doc.setFont('helvetica','normal'); doc.setFontSize(6.8); doc.setTextColor(140,146,150);
    doc.text('Durch die nachfolgenden Unterschriften wird die Richtigkeit und Vollständigkeit der obigen Angaben bestätigt.', M, fy);
    fy += 4;

    const boxW = contentW/2 - 3;
    doc.setDrawColor(210,214,217); doc.setLineWidth(0.3);
    doc.roundedRect(M, fy, boxW, 15, 2, 2);
    doc.roundedRect(M+contentW-boxW, fy, boxW, 15, 2, 2);
    doc.setFontSize(7); doc.setTextColor(140,146,150);
    doc.text(`Datum: ${pdfFmtDate(new Date())}`, M+3, fy+5);
    doc.text('Datum:', M+contentW-boxW+3, fy+5);
    doc.setFont('helvetica','italic'); doc.setFontSize(10); doc.setTextColor(30,30,30);
    doc.text(settings.name || '', M+3, fy+11);
    doc.setFont('helvetica','normal'); doc.setFontSize(6.8); doc.setTextColor(140,146,150);
    doc.text('Ausführender', M+3, fy+14);
    doc.text('Betrieb / Firma', M+contentW-boxW+3, fy+14);

    doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(140,146,150);
    doc.text(`Seite ${pageNum}/${totalPages}`, M+contentW/2, fy+17.5, {align:'center'});
  });

  const fname = `${(settings.name||'Unbekannt').replace(/\s+/g,'-')}-${MONTHS[viewDate.getMonth()]}-${viewDate.getFullYear()}.pdf`;

  const blob = doc.output('blob');
  if(navigator.canShare){
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
