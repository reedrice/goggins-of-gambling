/**
 * js/share.js: "Share" on pick cards and Record slips (HANDOFF §46).
 * window.Share = { menu(info, anchor), draw(info) -> canvas, png(info) -> Promise<Blob>, link(id) }
 * info = { id, title, sub, date, legs:[{sport, text, am}], combinedAm, pay10, chance, multi }
 * Pure canvas text drawing: no logos or remote images, so the canvas never gets tainted.
 * No cents, no stakes, no bankroll: only "$10 → $X" (a fixed example amount).
 */
(function () {
  'use strict';
  const W = 1080, H0 = 1350, PAD = 72;
  const C = { bg: '#0b0b0c', card: '#18181b', line: '#2a2a2f', text: '#f4f4f5', muted: '#a1a1aa', accent: '#ff5a1f', gold: '#d4a017' };
  const brand = () => ((window.APP_CONFIG && APP_CONFIG.appName) || 'Men in Black').toUpperCase();
  const tag = () => ((window.APP_CONFIG && APP_CONFIG.tagline) || 'Stay Hard').toUpperCase();

  function link(id) {
    const u = new URL(location.href);
    u.hash = '';
    u.search = '?pick=' + encodeURIComponent(id);
    return u.toString();
  }

  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/), lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /** Lay out once to measure, then draw. Height grows past 1350 for big tickets (max 1920, then the font shrinks). */
  function draw(info, scale = 2) {
    const legs = info.legs || [];
    let fs = legs.length > 12 ? 30 : legs.length > 7 ? 34 : 40;
    const measure = document.createElement('canvas').getContext('2d');
    const legH = f => {
      measure.font = `600 ${f}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      return legs.reduce((s, l) => s + wrap(measure, l.text, W - PAD * 2 - 220).length * (f * 1.25) + f * 0.9 + 28, 0);
    };
    let need = 520 + legH(fs) + 380;
    while (need > 1920 && fs > 20) { fs -= 2; need = 520 + legH(fs) + 380; }
    const Hh = Math.max(H0, Math.min(1920, Math.ceil(need)));
    const cv = document.createElement('canvas');
    cv.width = W * scale; cv.height = Hh * scale;
    const x = cv.getContext('2d');
    x.scale(scale, scale);
    const F = (w, s) => `${w} ${s}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    x.fillStyle = C.bg; x.fillRect(0, 0, W, Hh);
    x.fillStyle = C.accent; x.fillRect(0, 0, W, 10);
    // Wordmark
    x.fillStyle = C.text; x.font = F(800, 46); x.textBaseline = 'top';
    x.fillText(brand(), PAD, 52);
    x.fillStyle = C.accent; x.font = F(700, 22); x.fillText(tag().split('').join(' '), PAD, 108);
    x.fillStyle = C.muted; x.font = F(500, 28); x.textAlign = 'right'; x.fillText(info.date || '', W - PAD, 62); x.textAlign = 'left';
    // Title
    let y = 180;
    x.fillStyle = C.text; x.font = F(800, 60);
    for (const ln of wrap(x, info.title || '', W - PAD * 2)) { x.fillText(ln, PAD, y); y += 70; }
    if (info.sub) { x.fillStyle = C.muted; x.font = F(500, 30); for (const ln of wrap(x, info.sub, W - PAD * 2).slice(0, 2)) { x.fillText(ln, PAD, y + 6); y += 38; } }
    y += 30;
    // Legs
    const top = y;
    x.fillStyle = C.card; roundRect(x, PAD - 24, top - 24, W - PAD * 2 + 48, Math.ceil(legH(fs)) + 30, 28); x.fill();
    for (const l of legs) {
      x.fillStyle = C.accent; x.font = F(800, Math.round(fs * 0.6));
      x.fillText(String(l.sport || '').toUpperCase(), PAD, y);
      y += fs * 0.9;
      x.fillStyle = C.text; x.font = F(600, fs);
      const lines = wrap(x, l.text, W - PAD * 2 - 220);
      lines.forEach((ln, i) => x.fillText(ln, PAD, y + i * fs * 1.25));
      x.textAlign = 'right'; x.fillStyle = C.gold; x.font = F(800, fs); x.fillText(l.am || '', W - PAD, y); x.textAlign = 'left';
      y += lines.length * fs * 1.25 + 14;
      x.fillStyle = C.line; x.fillRect(PAD, y, W - PAD * 2, 2); y += 14;
    }
    y += 40;
    // Totals
    x.fillStyle = C.muted; x.font = F(600, 30);
    x.fillText(info.multi ? 'All ' + legs.length + ' win · combined odds' : 'Odds', PAD, y);
    x.textAlign = 'right'; x.fillStyle = C.gold; x.font = F(800, 44); x.fillText(info.combinedAm || '', W - PAD, y - 8); x.textAlign = 'left';
    y += 70;
    x.fillStyle = C.accent; roundRect(x, PAD - 24, y, W - PAD * 2 + 48, 120, 28); x.fill();
    x.fillStyle = '#fff'; x.font = F(800, 64); x.textAlign = 'center';
    x.fillText(info.pay10 ? '$10 → $' + info.pay10 : '', W / 2, y + 26); x.textAlign = 'left';
    y += 150;
    if (info.chance) { x.fillStyle = C.text; x.font = F(600, 34); x.textAlign = 'center'; x.fillText(info.chance, W / 2, y); x.textAlign = 'left'; }
    x.fillStyle = C.muted; x.font = F(500, 22); x.textAlign = 'center';
    x.fillText('Just for fun. Prices change; check your app before you bet.', W / 2, Hh - 60); x.textAlign = 'left';
    return cv;
  }
  function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  const png = info => new Promise(res => draw(info).toBlob(res, 'image/png'));

  function toast(msg) { const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200); }

  async function copyLink(info) {
    const url = link(info.id);
    if (navigator.share) { try { await navigator.share({ title: info.title, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); } catch (e) { const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) {} ta.remove(); }
    toast('Copied!');
  }

  async function savePicture(info) {
    const blob = await png(info);
    const name = 'pick-' + String(info.id).replace(/[^a-z0-9-]+/gi, '-') + '.png';
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: info.title }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const touch = matchMedia('(pointer: coarse)').matches;
    if (!touch) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast('Saved'); return; }
    const ov = document.createElement('div');
    ov.className = 'share-overlay';
    ov.innerHTML = `<div class="share-ov-in"><p>Press and hold the picture, then tap “Save to Photos”.</p><img alt="Pick picture" src="${url}"><button type="button" class="btn">Close</button></div>`;
    ov.querySelector('button').onclick = () => { ov.remove(); URL.revokeObjectURL(url); };
    document.body.appendChild(ov);
  }

  function closeMenu() { document.querySelectorAll('.share-menu').forEach(m => m.remove()); }
  function menu(info, anchor) {
    closeMenu();
    const m = document.createElement('div');
    m.className = 'share-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = '<button type="button" role="menuitem" data-a="link">🔗 Copy link</button><button type="button" role="menuitem" data-a="pic">🖼️ Save as picture</button>';
    m.onclick = e => { const b = e.target.closest('button'); if (!b) return; closeMenu(); (b.dataset.a === 'link' ? copyLink : savePicture)(info); };
    const r = anchor.getBoundingClientRect();
    m.style.top = (window.scrollY + r.bottom + 6) + 'px';
    m.style.left = Math.max(8, Math.min(window.scrollX + r.right - 220, window.innerWidth - 228)) + 'px';
    document.body.appendChild(m);
    setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { closeMenu(); document.removeEventListener('click', off); } }), 0);
  }

  window.Share = { menu, draw, png, link, closeMenu };
})();
