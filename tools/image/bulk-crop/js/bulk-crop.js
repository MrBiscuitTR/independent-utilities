/**
 * bulk-crop.js
 * Interactive drag-cropper for bulk image dataset preparation.
 *
 * Architecture:
 *  - Each uploaded image gets a CropCard instance.
 *  - CropCard renders a <canvas> that shows the source image + an interactive
 *    crop rectangle the user can drag and resize.
 *  - Global settings (output W/H, format, quality, AR lock, prefix/suffix) are
 *    read at export time; per-image overrides take priority.
 *  - Export uses pica for high-quality downscaling.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── Global settings DOM refs ──────────────────────────────────────────────
  const gWidth       = document.getElementById('g-width');
  const gHeight      = document.getElementById('g-height');
  const gFormat      = document.getElementById('g-format');
  const gQualityWrap = document.getElementById('g-quality-wrap');
  const gQuality     = document.getElementById('g-quality');
  const gArLock      = document.getElementById('g-ar-lock');
  const gArCustomW   = document.getElementById('g-ar-cw');
  const gArCustomH   = document.getElementById('g-ar-ch');
  const gArCustomWrap= document.getElementById('g-ar-custom-wrap');
  const gPrefix      = document.getElementById('g-prefix');
  const gSuffix      = document.getElementById('g-suffix');

  const dropZone     = document.getElementById('drop-zone');
  const fileInput    = document.getElementById('file-input');
  const toolbar      = document.getElementById('toolbar');
  const cardsContainer = document.getElementById('cards-container');
  const progressWrap = document.getElementById('progress-wrap');
  const progressFill = document.getElementById('progress-fill');
  const progressLabel= document.getElementById('progress-label');

  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

  // ── Global settings reactive updates ─────────────────────────────────────
  gFormat.addEventListener('change', () => {
    gQualityWrap.style.display = gFormat.value === 'image/png' ? 'none' : '';
    refreshAllCroppers();
  });
  gArLock.addEventListener('change', () => {
    gArCustomWrap.style.display = gArLock.value === 'custom' ? '' : 'none';
    refreshAllCroppers();
  });
  [gWidth, gHeight, gArCustomW, gArCustomH].forEach(el =>
    el.addEventListener('input', refreshAllCroppers)
  );

  function refreshAllCroppers() {
    cards.forEach(c => c.applyGlobalAR());
  }

  // ── File ingestion ────────────────────────────────────────────────────────
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('bc-drop-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('bc-drop-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('bc-drop-over');
    addFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  /** @type {CropCard[]} */
  const cards = [];

  function addFiles(fileList) {
    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue;
      const card = new CropCard(file, removeCard);
      cards.push(card);
      cardsContainer.appendChild(card.el);
    }
    toolbar.style.display = cards.length ? 'flex' : 'none';
  }

  function removeCard(card) {
    const idx = cards.indexOf(card);
    if (idx !== -1) cards.splice(idx, 1);
    card.el.remove();
    toolbar.style.display = cards.length ? 'flex' : 'none';
  }

  // ── Toolbar buttons ───────────────────────────────────────────────────────
  document.getElementById('reset-all-crops-btn').addEventListener('click', () => {
    cards.forEach(c => c.resetCrop());
  });
  document.getElementById('remove-all-btn').addEventListener('click', () => {
    cards.forEach(c => c.el.remove());
    cards.length = 0;
    toolbar.style.display = 'none';
  });
  document.getElementById('export-all-btn').addEventListener('click', () => exportCards(true));
  document.getElementById('export-individuals-btn').addEventListener('click', () => exportCards(false));

  // ── Export ────────────────────────────────────────────────────────────────
  async function exportCards(asZip) {
    if (!cards.length) return;

    progressWrap.style.display = 'block';
    progressFill.style.width = '0%';

    const results = [];
    for (let i = 0; i < cards.length; i++) {
      progressLabel.textContent = `Exporting ${i + 1} / ${cards.length}: ${cards[i].file.name}`;
      progressFill.style.width = Math.round((i / cards.length) * 100) + '%';
      try {
        const { blob, name } = await cards[i].export();
        results.push({ blob, name });
        if (!asZip) triggerDownload(blob, name);
      } catch (e) {
        console.error('Export error for', cards[i].file.name, e);
      }
    }

    progressFill.style.width = '100%';
    progressLabel.textContent = `Done! ${results.length} image(s) exported.`;

    if (asZip && results.length) {
      const zip = new JSZip();
      results.forEach(r => zip.file(r.name, r.blob));
      const content = await zip.generateAsync({ type: 'blob' });
      triggerDownload(content, 'bulk-crop.zip');
    }
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ── Global settings helpers ───────────────────────────────────────────────
  function getGlobalAR() {
    const mode = gArLock.value;
    if (mode === 'free')   return null;
    if (mode === 'output') return { w: Math.max(1, +gWidth.value), h: Math.max(1, +gHeight.value) };
    if (mode === '1:1')    return { w: 1, h: 1 };
    if (mode === '4:3')    return { w: 4, h: 3 };
    if (mode === '16:9')   return { w: 16, h: 9 };
    if (mode === '3:2')    return { w: 3, h: 2 };
    if (mode === '2:3')    return { w: 2, h: 3 };
    if (mode === 'custom') return { w: Math.max(1, +gArCustomW.value), h: Math.max(1, +gArCustomH.value) };
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CropCard class
  // ══════════════════════════════════════════════════════════════════════════
  class CropCard {
    constructor(file, onRemove) {
      this.file     = file;
      this.onRemove = onRemove;
      this.img      = null;   // HTMLImageElement (natural size)
      this.imgUrl   = null;

      // Crop rect in *image* coordinates (natural px)
      this.crop = { x: 0, y: 0, w: 0, h: 0 };

      // Per-image overrides (null = use global)
      this.ovWidth   = null;
      this.ovHeight  = null;
      this.ovFormat  = null;
      this.ovQuality = null;
      this.ovArMode  = null;   // same values as gArLock
      this.ovArCW    = null;
      this.ovArCH    = null;

      // Canvas display scale: canvas CSS px / image natural px
      this.scale = 1;

      // Interaction state
      this._drag = null; // { type: 'move'|'nw'|'ne'|'sw'|'se'|'n'|'s'|'e'|'w', startX, startY, startCrop }

      this._buildDOM();
      this._loadImage();
    }

    // ── DOM ─────────────────────────────────────────────────────────────────
    _buildDOM() {
      const el = document.createElement('div');
      el.className = 'bc-card';
      this.el = el;

      // Header row
      const header = document.createElement('div');
      header.className = 'bc-card-header';

      const fname = document.createElement('span');
      fname.className = 'bc-card-fname';
      fname.textContent = this.file.name;
      fname.title = this.file.name;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'bc-card-remove';
      removeBtn.title = 'Remove image';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => this.onRemove(this));

      header.appendChild(fname);
      header.appendChild(removeBtn);
      el.appendChild(header);

      // Canvas wrapper
      const canvasWrap = document.createElement('div');
      canvasWrap.className = 'bc-canvas-wrap';
      this.canvasWrap = canvasWrap;

      this.canvas = document.createElement('canvas');
      this.canvas.className = 'bc-canvas';
      canvasWrap.appendChild(this.canvas);
      el.appendChild(canvasWrap);

      // Crop info bar
      const infoBar = document.createElement('div');
      infoBar.className = 'bc-info-bar';
      this.infoBar = infoBar;
      el.appendChild(infoBar);

      // Per-image overrides (collapsible)
      const overrideToggle = document.createElement('button');
      overrideToggle.className = 'bc-override-toggle';
      overrideToggle.textContent = '⚙ Per-image overrides';
      overrideToggle.setAttribute('aria-expanded', 'false');
      el.appendChild(overrideToggle);

      const overridePanel = document.createElement('div');
      overridePanel.className = 'bc-override-panel';
      overridePanel.style.display = 'none';
      overrideToggle.addEventListener('click', () => {
        const open = overridePanel.style.display !== 'none';
        overridePanel.style.display = open ? 'none' : '';
        overrideToggle.setAttribute('aria-expanded', String(!open));
      });

      // Build override fields
      overridePanel.innerHTML = `
        <div class="bc-ov-grid">
          <div class="bc-field">
            <label class="tool-label">Width (px) <span class="bc-ov-hint">leave blank = global</span></label>
            <input class="tool-input bc-num bc-ov-w" type="number" min="1" max="8192" placeholder="${gWidth.value}" />
          </div>
          <div class="bc-field">
            <label class="tool-label">Height (px)</label>
            <input class="tool-input bc-num bc-ov-h" type="number" min="1" max="8192" placeholder="${gHeight.value}" />
          </div>
          <div class="bc-field">
            <label class="tool-label">Format</label>
            <select class="tool-input bc-ov-fmt">
              <option value="">— global —</option>
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPEG</option>
              <option value="image/webp">WebP</option>
            </select>
          </div>
          <div class="bc-field bc-ov-q-wrap">
            <label class="tool-label">Quality (1–100)</label>
            <input class="tool-input bc-num bc-ov-q" type="number" min="1" max="100" placeholder="${gQuality.value}" />
          </div>
          <div class="bc-field">
            <label class="tool-label">AR lock</label>
            <select class="tool-input bc-ov-ar">
              <option value="">— global —</option>
              <option value="free">Free</option>
              <option value="output">Match output W×H</option>
              <option value="1:1">1 : 1</option>
              <option value="4:3">4 : 3</option>
              <option value="16:9">16 : 9</option>
              <option value="3:2">3 : 2</option>
              <option value="2:3">2 : 3</option>
              <option value="custom">Custom…</option>
            </select>
          </div>
          <div class="bc-field bc-ov-custom-ar-wrap" style="display:none;">
            <label class="tool-label">Custom ratio W : H</label>
            <div class="bc-ratio-row">
              <input class="tool-input bc-num bc-ov-arcw" type="number" min="1" value="16" />
              <span class="bc-ratio-sep">:</span>
              <input class="tool-input bc-num bc-ov-arch" type="number" min="1" value="9" />
            </div>
          </div>
        </div>
        <div class="bc-ov-actions">
          <button class="tool-button bc-btn-sm" type="button" data-action="reset-crop">Reset crop</button>
          <button class="tool-button bc-btn-sm bc-btn-secondary" type="button" data-action="export-single">Export &amp; download</button>
        </div>
      `;

      // Wire per-image override fields
      const ovW   = overridePanel.querySelector('.bc-ov-w');
      const ovH   = overridePanel.querySelector('.bc-ov-h');
      const ovFmt = overridePanel.querySelector('.bc-ov-fmt');
      const ovQ   = overridePanel.querySelector('.bc-ov-q');
      const ovAr  = overridePanel.querySelector('.bc-ov-ar');
      const ovARCustomWrap = overridePanel.querySelector('.bc-ov-custom-ar-wrap');
      const ovARCW = overridePanel.querySelector('.bc-ov-arcw');
      const ovARCH = overridePanel.querySelector('.bc-ov-arch');

      const sync = () => {
        this.ovWidth   = ovW.value   ? +ovW.value   : null;
        this.ovHeight  = ovH.value   ? +ovH.value   : null;
        this.ovFormat  = ovFmt.value ? ovFmt.value  : null;
        this.ovQuality = ovQ.value   ? +ovQ.value   : null;
        this.ovArMode  = ovAr.value  ? ovAr.value   : null;
        this.ovArCW    = ovARCW.value ? +ovARCW.value : null;
        this.ovArCH    = ovARCH.value ? +ovARCH.value : null;
        ovARCustomWrap.style.display = ovAr.value === 'custom' ? '' : 'none';
        this.applyGlobalAR();
      };
      [ovW, ovH, ovFmt, ovQ, ovAr, ovARCW, ovARCH].forEach(el => el.addEventListener('input', sync));

      overridePanel.querySelector('[data-action="reset-crop"]').addEventListener('click', () => this.resetCrop());
      overridePanel.querySelector('[data-action="export-single"]').addEventListener('click', async () => {
        const { blob, name } = await this.export();
        triggerDownload(blob, name);
      });

      el.appendChild(overridePanel);
    }

    // ── Image load ───────────────────────────────────────────────────────────
    _loadImage() {
      const url = URL.createObjectURL(this.file);
      this.imgUrl = url;
      const img = new Image();
      img.onload = () => {
        this.img = img;
        this._initCanvas();
        this._initCrop();
        this._bindEvents();
        this._draw();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        this.el.classList.add('bc-card-error');
        this.infoBar.textContent = 'Could not load image';
      };
      img.src = url;
    }

    // ── Canvas init ──────────────────────────────────────────────────────────
    _initCanvas() {
      const MAX_DISPLAY = 480; // max canvas CSS width/height
      const iw = this.img.naturalWidth;
      const ih = this.img.naturalHeight;
      this.scale = Math.min(1, MAX_DISPLAY / iw, MAX_DISPLAY / ih);
      this.canvas.width  = Math.round(iw * this.scale);
      this.canvas.height = Math.round(ih * this.scale);
    }

    // ── Crop helpers ─────────────────────────────────────────────────────────
    _getAR() {
      // Returns {w,h} ratio or null (free)
      const mode = this.ovArMode !== null ? this.ovArMode : gArLock.value;
      if (mode === 'free') return null;
      const ow = this.ovWidth  ?? +gWidth.value;
      const oh = this.ovHeight ?? +gHeight.value;
      if (mode === 'output') return { w: ow, h: oh };
      if (mode === '1:1')    return { w: 1, h: 1 };
      if (mode === '4:3')    return { w: 4, h: 3 };
      if (mode === '16:9')   return { w: 16, h: 9 };
      if (mode === '3:2')    return { w: 3, h: 2 };
      if (mode === '2:3')    return { w: 2, h: 3 };
      if (mode === 'custom') {
        const cw = this.ovArCW ?? +gArCustomW.value;
        const ch = this.ovArCH ?? +gArCustomH.value;
        return { w: Math.max(1, cw), h: Math.max(1, ch) };
      }
      return null;
    }

    _initCrop() {
      const iw = this.img.naturalWidth;
      const ih = this.img.naturalHeight;
      const ar = this._getAR();

      if (!ar) {
        this.crop = { x: 0, y: 0, w: iw, h: ih };
        return;
      }

      // Largest centered rect matching AR
      const arRatio = ar.w / ar.h;
      let cw, ch;
      if (iw / ih > arRatio) {
        ch = ih; cw = Math.round(ch * arRatio);
      } else {
        cw = iw; ch = Math.round(cw / arRatio);
      }
      this.crop = {
        x: Math.round((iw - cw) / 2),
        y: Math.round((ih - ch) / 2),
        w: cw,
        h: ch
      };
    }

    resetCrop() { this._initCrop(); this._draw(); }

    applyGlobalAR() {
      // Re-center crop to match new AR without shrinking below minimum
      this._initCrop();
      this._draw();
    }

    _clampCrop() {
      const iw = this.img.naturalWidth;
      const ih = this.img.naturalHeight;
      const MIN = 4;
      this.crop.w = Math.max(MIN, Math.min(this.crop.w, iw));
      this.crop.h = Math.max(MIN, Math.min(this.crop.h, ih));
      this.crop.x = Math.max(0, Math.min(this.crop.x, iw - this.crop.w));
      this.crop.y = Math.max(0, Math.min(this.crop.y, ih - this.crop.h));
    }

    // ── Draw ─────────────────────────────────────────────────────────────────
    _draw() {
      const canvas = this.canvas;
      const ctx    = canvas.getContext('2d');
      const s      = this.scale;
      const { x, y, w, h } = this.crop;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Source image
      ctx.drawImage(this.img, 0, 0, canvas.width, canvas.height);

      // Dim outside crop
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0,             0,             canvas.width, y * s);           // top
      ctx.fillRect(0,             (y + h) * s,   canvas.width, canvas.height);    // bottom
      ctx.fillRect(0,             y * s,          x * s,        h * s);            // left
      ctx.fillRect((x + w) * s,  y * s,          canvas.width, h * s);            // right

      // Crop border
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(x * s + 0.5, y * s + 0.5, w * s - 1, h * s - 1);

      // Rule-of-thirds grid
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth   = 0.75;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo((x + w * i / 3) * s, y * s);
        ctx.lineTo((x + w * i / 3) * s, (y + h) * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x * s, (y + h * i / 3) * s);
        ctx.lineTo((x + w) * s, (y + h * i / 3) * s);
        ctx.stroke();
      }

      // Corner handles
      const HS = 8;
      ctx.fillStyle = '#fff';
      const corners = [
        [x * s,           y * s],
        [(x + w) * s - HS, y * s],
        [x * s,           (y + h) * s - HS],
        [(x + w) * s - HS, (y + h) * s - HS],
      ];
      corners.forEach(([cx, cy]) => {
        ctx.fillRect(cx, cy, HS, HS);
        ctx.strokeStyle = '#4a90e2';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, HS, HS);
      });

      // Edge mid-handles
      const edgeMids = [
        [x * s + w * s / 2 - HS / 2, y * s - HS / 2],              // N
        [x * s + w * s / 2 - HS / 2, (y + h) * s - HS / 2],        // S
        [x * s - HS / 2,             y * s + h * s / 2 - HS / 2],  // W
        [(x + w) * s - HS / 2,       y * s + h * s / 2 - HS / 2],  // E
      ];
      edgeMids.forEach(([mx, my]) => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(mx, my, HS, HS);
        ctx.strokeStyle = '#4a90e2';
        ctx.lineWidth = 1;
        ctx.strokeRect(mx, my, HS, HS);
      });

      // Info bar
      const ow = this.ovWidth  ?? +gWidth.value;
      const oh = this.ovHeight ?? +gHeight.value;
      this.infoBar.textContent =
        `Crop: ${this.crop.w} × ${this.crop.h} px  →  Output: ${ow} × ${oh} px`;
    }

    // ── Pointer interaction ───────────────────────────────────────────────────
    _bindEvents() {
      const c = this.canvas;
      c.addEventListener('mousedown',  e => this._onDown(e));
      c.addEventListener('mousemove',  e => this._onMove(e));
      c.addEventListener('mouseup',    e => this._onUp(e));
      c.addEventListener('mouseleave', e => this._onUp(e));

      c.addEventListener('touchstart', e => { e.preventDefault(); this._onDown(e.touches[0]); }, { passive: false });
      c.addEventListener('touchmove',  e => { e.preventDefault(); this._onMove(e.touches[0]); }, { passive: false });
      c.addEventListener('touchend',   e => this._onUp(e));
    }

    _canvasXY(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (this.canvas.width  / rect.width),
        y: (e.clientY - rect.top)  * (this.canvas.height / rect.height),
      };
    }

    _hitTest(cx, cy) {
      const { x, y, w, h } = this.crop;
      const s  = this.scale;
      const HS = 10; // hit size in canvas px

      const cropX  = x * s, cropY = y * s, cropW = w * s, cropH = h * s;
      const inside = cx > cropX && cx < cropX + cropW && cy > cropY && cy < cropY + cropH;

      // Corners first
      if (Math.abs(cx - cropX)           < HS && Math.abs(cy - cropY)           < HS) return 'nw';
      if (Math.abs(cx - (cropX + cropW)) < HS && Math.abs(cy - cropY)           < HS) return 'ne';
      if (Math.abs(cx - cropX)           < HS && Math.abs(cy - (cropY + cropH)) < HS) return 'sw';
      if (Math.abs(cx - (cropX + cropW)) < HS && Math.abs(cy - (cropY + cropH)) < HS) return 'se';

      // Edges
      if (Math.abs(cx - (cropX + cropW / 2)) < HS && Math.abs(cy - cropY)           < HS) return 'n';
      if (Math.abs(cx - (cropX + cropW / 2)) < HS && Math.abs(cy - (cropY + cropH)) < HS) return 's';
      if (Math.abs(cx - cropX)               < HS && Math.abs(cy - (cropY + cropH / 2)) < HS) return 'w';
      if (Math.abs(cx - (cropX + cropW))     < HS && Math.abs(cy - (cropY + cropH / 2)) < HS) return 'e';

      if (inside) return 'move';
      return null;
    }

    _updateCursor(hit) {
      const map = { move: 'move', nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize',
                    n: 'n-resize', s: 's-resize', w: 'w-resize', e: 'e-resize' };
      this.canvas.style.cursor = hit ? (map[hit] || 'default') : 'crosshair';
    }

    _onDown(e) {
      const { x, y } = this._canvasXY(e);
      const hit = this._hitTest(x, y);
      if (!hit) {
        // Start new crop drag from scratch
        const imgX = x / this.scale;
        const imgY = y / this.scale;
        this._drag = { type: 'new', startImgX: imgX, startImgY: imgY };
        return;
      }
      this._drag = { type: hit, startX: x, startY: y, startCrop: { ...this.crop } };
    }

    _onMove(e) {
      const { x, y } = this._canvasXY(e);
      const s = this.scale;
      const iw = this.img.naturalWidth;
      const ih = this.img.naturalHeight;

      if (!this._drag) {
        this._updateCursor(this._hitTest(x, y));
        return;
      }

      if (this._drag.type === 'new') {
        // Draw a new crop rect from the start point
        const sx = this._drag.startImgX;
        const sy = this._drag.startImgY;
        const ex = Math.max(0, Math.min(iw, x / s));
        const ey = Math.max(0, Math.min(ih, y / s));

        let cx = Math.min(sx, ex), cy = Math.min(sy, ey);
        let cw = Math.abs(ex - sx),  ch = Math.abs(ey - sy);
        if (cw < 1 || ch < 1) return;

        const ar = this._getAR();
        if (ar) {
          const arRatio = ar.w / ar.h;
          ch = cw / arRatio;
          // Clamp
          if (cy + ch > ih) { ch = ih - cy; cw = ch * arRatio; }
          if (cx + cw > iw) { cw = iw - cx; ch = cw / arRatio; }
        }

        this.crop = { x: Math.round(cx), y: Math.round(cy), w: Math.round(cw), h: Math.round(ch) };
        this._draw();
        return;
      }

      const dx = (x - this._drag.startX) / s;
      const dy = (y - this._drag.startY) / s;
      const sc = { ...this._drag.startCrop };
      const ar = this._getAR();

      let { x: cx, y: cy, w: cw, h: ch } = sc;

      const applyAR = (newW, newH, anchorW) => {
        if (!ar) return { w: newW, h: newH };
        const ratio = ar.w / ar.h;
        if (anchorW) return { w: newW, h: newW / ratio };
        return { w: newH * ratio, h: newH };
      };

      switch (this._drag.type) {
        case 'move':
          cx = sc.x + dx;
          cy = sc.y + dy;
          break;
        case 'se': { const d = applyAR(sc.w + dx, sc.h + dy, true); cw = d.w; ch = d.h; break; }
        case 'sw': { const d = applyAR(sc.w - dx, sc.h + dy, false); cx = sc.x + sc.w - d.w; cw = d.w; ch = d.h; break; }
        case 'ne': { const d = applyAR(sc.w + dx, sc.h - dy, true); ch = d.h; cy = sc.y + sc.h - d.h; cw = d.w; break; }
        case 'nw': { const d = applyAR(sc.w - dx, sc.h - dy, false); cx = sc.x + sc.w - d.w; cy = sc.y + sc.h - d.h; cw = d.w; ch = d.h; break; }
        case 'e':  { const d = applyAR(sc.w + dx, sc.h, true); cw = d.w; if (ar) ch = d.h; break; }
        case 'w':  { const d = applyAR(sc.w - dx, sc.h, true); cx = sc.x + sc.w - d.w; cw = d.w; if (ar) ch = d.h; break; }
        case 's':  { const d = applyAR(sc.w, sc.h + dy, false); ch = d.h; if (ar) cw = d.w; break; }
        case 'n':  { const d = applyAR(sc.w, sc.h - dy, false); cy = sc.y + sc.h - d.h; ch = d.h; if (ar) cw = d.w; break; }
      }

      this.crop = { x: Math.round(cx), y: Math.round(cy), w: Math.round(cw), h: Math.round(ch) };
      this._clampCrop();
      this._draw();
    }

    _onUp() {
      this._drag = null;
    }

    // ── Export ───────────────────────────────────────────────────────────────
    async export() {
      const ow  = Math.max(1, this.ovWidth  ?? +gWidth.value);
      const oh  = Math.max(1, this.ovHeight ?? +gHeight.value);
      const fmt = this.ovFormat  ?? gFormat.value;
      const q   = Math.min(1, Math.max(0.01, (this.ovQuality ?? +gQuality.value) / 100));

      const { x, y, w, h } = this.crop;

      // 1. Draw cropped region to a tmp canvas (natural size)
      const tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      tmp.getContext('2d').drawImage(this.img, x, y, w, h, 0, 0, w, h);

      // 2. Resize to output with pica
      const out = document.createElement('canvas');
      out.width = ow; out.height = oh;

      if (window.pica) {
        await pica().resize(tmp, out, { unsharpAmount: 80, unsharpRadius: 0.6, unsharpThreshold: 2 });
      } else {
        out.getContext('2d').drawImage(tmp, 0, 0, ow, oh);
      }

      // 3. Encode
      const blob = await (window.pica
        ? pica().toBlob(out, fmt, q)
        : new Promise(res => out.toBlob(res, fmt, q)));

      // 4. Build filename
      const prefix = gPrefix.value.trim();
      const suffix = gSuffix.value.trim();
      const base   = this.file.name.replace(/\.[^/.]+$/, '');
      const ext    = EXT[fmt] || 'png';
      const name   = `${prefix}${base}${suffix}.${ext}`;

      return { blob, name };
    }
  } // end CropCard
});
