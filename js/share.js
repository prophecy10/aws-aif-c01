/* share.js — score card image + share (WhatsApp / any app), no backend.
   Draws a 1080×1080 card on a canvas. On phones that can share files (most Android Chrome,
   iOS Safari 15+) it opens the share sheet with the image + a link; otherwise it opens WhatsApp
   with the text and link, and offers the image as a download. */
const Share = (() => {
  const W = 1080, H = 1080;
  const FONT = 'Inter, system-ui, sans-serif';

  function siteUrl(){ return location.origin + location.pathname.replace(/index\.html$/, ''); }
  function shortUrl(){ return siteUrl().replace(/^https?:\/\//, '').replace(/\/$/, ''); }

  function wrap(ctx, text, maxW){
    const words = String(text).split(' '); const lines = []; let line = '';
    for (const w of words){
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line){ lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function roundRect(ctx, x, y, w, h, r){
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }

  /* info: { heading, mode, big, small, line, rows:[[label,value]], badge, cta, accent } */
  async function draw(info){
    try { await Promise.all([document.fonts.load(`700 80px ${FONT}`), document.fonts.load(`500 40px ${FONT}`)]); } catch(e){}
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#4338ca'); g.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // soft decorative circles
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.arc(W-90, 110, 230, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(80, H-60, 180, 0, Math.PI*2); ctx.fill();

    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.font = `700 58px ${FONT}`; ctx.fillText(info.heading, W/2, 130);
    ctx.font = `500 36px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.fillText(info.mode, W/2, 188);

    // white card
    const cx = 90, cy = 240, cw = W-180, ch = 560;
    ctx.fillStyle = '#ffffff'; roundRect(ctx, cx, cy, cw, ch, 36); ctx.fill();

    const hasRows = info.rows && info.rows.length;
    const bigY = cy + (hasRows ? 190 : 300), lineY = bigY + (hasRows ? 60 : 90);
    ctx.fillStyle = info.accent || '#4338ca';
    ctx.font = `700 ${hasRows?160:190}px ${FONT}`;
    const bigW = ctx.measureText(info.big).width;
    ctx.font = `600 64px ${FONT}`;
    const smallW = info.small ? ctx.measureText(info.small).width : 0;
    const startX = W/2 - (bigW + smallW)/2;
    ctx.textAlign = 'left';
    ctx.font = `700 ${hasRows?160:190}px ${FONT}`; ctx.fillText(info.big, startX, bigY);
    if (info.small){ ctx.font = `600 64px ${FONT}`; ctx.fillStyle = '#5a6b72'; ctx.fillText(info.small, startX+bigW+6, bigY); }

    ctx.textAlign = 'center'; ctx.fillStyle = '#1a2b32'; ctx.font = `500 38px ${FONT}`;
    let y = lineY;
    for (const ln of wrap(ctx, info.line || '', cw-80).slice(0,2)){ ctx.fillText(ln, W/2, y); y += 50; }

    if (info.rows && info.rows.length){
      const rowH = info.rows.length > 3 ? 46 : 66;
      y += 10; ctx.font = `500 ${rowH<60?28:32}px ${FONT}`;
      for (const [label, value] of info.rows.slice(0,5)){
        ctx.fillStyle = '#f1f0fb'; roundRect(ctx, cx+40, y-32, cw-80, rowH-8, 12); ctx.fill();
        ctx.textAlign = 'left'; ctx.fillStyle = '#1a2b32'; ctx.fillText(label, cx+64, y);
        ctx.textAlign = 'right'; ctx.fillStyle = '#3730a3'; ctx.fillText(value, cx+cw-64, y);
        y += rowH;
      }
      ctx.textAlign = 'center';
    }
    if (info.badge){   // below the white card, so it never overlaps the part rows
      ctx.font = `600 38px ${FONT}`;
      const bw = ctx.measureText(info.badge).width + 60;
      ctx.fillStyle = '#fff4e6'; roundRect(ctx, W/2-bw/2, cy+ch+22, bw, 62, 31); ctx.fill();
      ctx.fillStyle = '#c2410c'; ctx.fillText(info.badge, W/2, cy+ch+66);
    }

    ctx.fillStyle = '#fff'; ctx.font = `600 40px ${FONT}`; ctx.fillText(info.cta, W/2, 935);
    ctx.font = `500 34px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(shortUrl(), W/2, 985);
    ctx.font = `400 26px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText('Free · No sign-up · No ads', W/2, 1035);

    return new Promise(res => c.toBlob(b => res(b), 'image/png'));
  }

  async function share(info, text){
    const full = `${text}\n${siteUrl()}`;
    let blob = null;
    try { blob = await draw(info); } catch(e){}
    const file = blob ? new File([blob], 'aif-c01-score.png', {type:'image/png'}) : null;
    if (file && navigator.canShare && navigator.canShare({files:[file]})){
      try { await navigator.share({files:[file], text: full}); return 'shared'; }
      catch(e){ if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    if (navigator.share){
      try { await navigator.share({text: full}); return 'shared'; }
      catch(e){ if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    // Desktop / old browsers: download the image and open WhatsApp with the text
    if (blob){
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'aif-c01-score.png';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(full), '_blank', 'noopener');
    return 'fallback';
  }

  return { share, draw, siteUrl };
})();
