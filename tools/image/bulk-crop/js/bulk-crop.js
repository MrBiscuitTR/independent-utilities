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

  // Circle (profile picture) mode
  const mainEl         = document.querySelector('.bc-main');
  const gShape         = document.getElementById('g-shape');
  const gWidthLabel    = document.getElementById('g-width-label');
  const gCInside       = document.getElementById('g-c-inside');
  const gCFill         = document.getElementById('g-c-fill');
  const gCFillColor    = document.getElementById('g-c-fillcolor');
  const gCBlur         = document.getElementById('g-c-blur');
  const gCBright       = document.getElementById('g-c-bright');
  const gCBgZoom       = document.getElementById('g-c-bgzoom');
  const gCCorners      = document.getElementById('g-c-corners');
  const gCCornerColor  = document.getElementById('g-c-cornercolor');
  const gCRing         = document.getElementById('g-c-ring');
  const gCRingColor    = document.getElementById('g-c-ringcolor');
  const gCJpegHint     = document.getElementById('g-c-jpeg-hint');

  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

  const VIEW       = 420;   // circle-mode viewport size (canvas px)
  const FRAME_PX   = Math.round(VIEW * 0.72); // output frame size inside the viewport
  const ZOOM_MIN   = 0.1;   // 100% = circle exactly spans the image's short side
  const ZOOM_MAX   = 20;
  const BG_MAX     = 1024;  // max dimension of the low-res copy used for fills

  const isCircleMode = () => gShape.value === 'circle';
  const clamp   = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const normDeg = d => ((d + 180) % 360 + 360) % 360 - 180;

  // ── Global settings reactive updates ─────────────────────────────────────
  gFormat.addEventListener('change', () => {
    gQualityWrap.style.display = gFormat.value === 'image/png' ? 'none' : '';
    updateCirclePanel();
    refreshAllCroppers();
  });
  gShape.addEventListener('change', () => {
    const circle = isCircleMode();
    mainEl.classList.toggle('bc-mode-circle', circle);
    gWidthLabel.textContent = circle ? 'Output size (px)' : 'Output width (px)';
    // JPEG has no alpha, so a round picture would get filled corners.
    // Default to PNG for circles; the user can still pick JPEG afterwards.
    if (circle && gFormat.value === 'image/jpeg') {
      gFormat.value = 'image/png';
      gQualityWrap.style.display = 'none';
      updateCirclePanel();
    }
    cards.forEach(c => c.onModeChange());
  });
  [gCInside, gCFill, gCFillColor, gCBlur, gCBright, gCBgZoom, gCCorners, gCCornerColor, gCRing, gCRingColor]
    .forEach(el => el.addEventListener('input', () => {
      updateCirclePanel();
      cards.forEach(c => c.refresh());
    }));

  function updateCirclePanel() {
    const fill = gCFill.value;
    const show = (id, on) => { document.getElementById(id).style.display = on ? '' : 'none'; };
    show('g-c-fillcolor-wrap',   fill === 'color');
    show('g-c-blur-wrap',        fill === 'blur' || fill === 'edge' || fill === 'mirror');
    show('g-c-bright-wrap',      fill === 'blur' || fill === 'edge' || fill === 'mirror');
    show('g-c-bgzoom-wrap',      fill === 'blur');
    show('g-c-cornercolor-wrap', gCCorners.value !== 'keep');
    // Fill settings only apply once the circle can leave the image
    document.querySelectorAll('.bc-fill-opt').forEach(el => el.classList.toggle('bc-faded', gCInside.checked));
    document.getElementById('g-c-blur-val').textContent   = `(${gCBlur.value}%)`;
    document.getElementById('g-c-bright-val').textContent = `(${gCBright.value}%)`;
    document.getElementById('g-c-bgzoom-val').textContent = `(${gCBgZoom.value}%)`;
    gCJpegHint.style.display = gFormat.value === 'image/jpeg' &&
      (fill === 'transparent' || gCCorners.value === 'transparent') ? '' : 'none';
  }
  updateCirclePanel();
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

  // ── Canvas helpers (circle mode) ──────────────────────────────────────────
  // ctx.filter is missing or a no-op in some browsers (older Safari), so test
  // that a blur actually spreads a pixel before relying on it.
  const CANVAS_FILTER = (() => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 9;
      const x = c.getContext('2d');
      if (!('filter' in x)) return false;
      x.filter = 'blur(2px)';
      x.fillStyle = '#000';
      x.fillRect(4, 4, 1, 1);
      return x.getImageData(2, 4, 1, 1).data[3] > 0;
    } catch { return false; }
  })();

  function drawChecker(ctx, w, h, sq = 10) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d6d6d6';
    for (let y = 0; y < h; y += sq)
      for (let x = (y / sq) % 2 ? sq : 0; x < w; x += sq * 2)
        ctx.fillRect(x, y, sq, sq);
  }

  /** Draws `src` at (dx,dy) with a gaussian blur (px) and brightness multiplier. */
  function drawFiltered(ctx, src, dx, dy, blurPx, bright) {
    if (CANVAS_FILTER) {
      ctx.save();
      ctx.filter = `blur(${blurPx}px) brightness(${bright})`;
      ctx.drawImage(src, dx, dy);
      ctx.restore();
      return;
    }
    // Fallback: a downscale/upscale round trip approximates the blur and a
    // black/white overlay approximates the brightness change.
    const out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    const oc = out.getContext('2d');
    oc.imageSmoothingQuality = 'high';
    if (blurPx > 0.5) {
      const f = Math.max(1, blurPx / 1.5);
      const small = document.createElement('canvas');
      small.width  = Math.max(1, Math.round(src.width / f));
      small.height = Math.max(1, Math.round(src.height / f));
      const sc = small.getContext('2d');
      sc.imageSmoothingQuality = 'high';
      sc.drawImage(src, 0, 0, small.width, small.height);
      oc.drawImage(small, 0, 0, out.width, out.height);
    } else {
      oc.drawImage(src, 0, 0);
    }
    if (bright !== 1) {
      oc.globalCompositeOperation = 'source-atop';
      oc.fillStyle = bright < 1 ? `rgba(0,0,0,${1 - bright})` : `rgba(255,255,255,${Math.min(1, bright - 1)})`;
      oc.fillRect(0, 0, out.width, out.height);
    }
    ctx.drawImage(out, dx, dy);
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
      this.ovCFill   = null;   // circle mode: outside-image fill override
      this.ovCInside = null;   // circle mode: true/false override of "keep inside"

      // Circle mode: circle center + radius in *image* coordinates, rotation
      // in degrees and a horizontal flip. The circle stays fixed in the
      // viewport; these describe which part of the image sits under it.
      this.circ = { cx: 0, cy: 0, r: 1, rot: 0, flip: false };

      // Canvas display scale: canvas CSS px / image natural px
      this.scale = 1;

      // Interaction state
      this._drag = null; // { type: 'move'|'nw'|'ne'|'sw'|'se'|'n'|'s'|'e'|'w', startX, startY, startCrop }
      this._ptrs = new Map(); // circle mode: active pointers (id → canvas xy)
      this._gesture = null;   // circle mode: { c, pts } snapshot at gesture start
      this._raf = 0;

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

      // Circle-mode controls
      const circ = document.createElement('div');
      circ.className = 'bc-circ-controls bc-circle-only';
      circ.innerHTML = `
        <div class="bc-circ-top">
          <canvas class="bc-thumb" width="128" height="128" title="Output preview"></canvas>
          <p class="bc-circ-hint">Drag to move · scroll or pinch to zoom · two fingers or Shift+scroll to rotate ·
            double-click to reset. Arrow keys / + − / [ ] work when the image is focused.</p>
        </div>
        <div class="bc-slider-row">
          <span class="bc-slider-name">Zoom</span>
          <input class="bc-range bc-c-zoom" type="range" aria-label="Zoom"
                 min="${Math.round(1000 * Math.log10(ZOOM_MIN))}" max="${Math.round(1000 * Math.log10(ZOOM_MAX))}" step="1" value="0" />
          <span class="bc-slider-val bc-c-zoom-val">100%</span>
        </div>
        <div class="bc-slider-row">
          <span class="bc-slider-name">Rotate</span>
          <input class="bc-range bc-c-rot" type="range" aria-label="Rotation" min="-180" max="180" step="0.5" value="0" />
          <span class="bc-slider-val bc-c-rot-val">0°</span>
        </div>
        <div class="bc-circ-btns">
          <button class="tool-button bc-btn-ghost" type="button" data-c="rotl" title="Rotate 90° left">&#10226; 90°</button>
          <button class="tool-button bc-btn-ghost" type="button" data-c="rotr" title="Rotate 90° right">&#10227; 90°</button>
          <button class="tool-button bc-btn-ghost" type="button" data-c="flip" title="Mirror horizontally">&#8646; Flip</button>
          <button class="tool-button bc-btn-ghost" type="button" data-c="center" title="Center the image, keep zoom">Center</button>
          <button class="tool-button bc-btn-ghost" type="button" data-c="fill" title="Largest zoom-out that stays fully inside the image">Fill</button>
          <button class="tool-button bc-btn-ghost" type="button" data-c="fit" title="Show the whole image inside the frame">Fit whole image</button>
          <button class="tool-button bc-btn-ghost" type="button" data-c="reset" title="Reset position, zoom, rotation and flip">Reset</button>
        </div>
      `;
      this.thumb     = circ.querySelector('.bc-thumb');
      this.cZoom     = circ.querySelector('.bc-c-zoom');
      this.cZoomVal  = circ.querySelector('.bc-c-zoom-val');
      this.cRot      = circ.querySelector('.bc-c-rot');
      this.cRotVal   = circ.querySelector('.bc-c-rot-val');
      this.cFitBtn   = circ.querySelector('[data-c="fit"]');
      this.cZoom.addEventListener('input', () => {
        if (!this.img) return;
        this._zoomTo(this._baseR() / Math.pow(10, +this.cZoom.value / 1000));
      });
      this.cRot.addEventListener('input', () => {
        if (!this.img) return;
        this.circ.rot = +this.cRot.value;
        this._afterCircleChange();
      });
      circ.querySelectorAll('[data-c]').forEach(b =>
        b.addEventListener('click', () => this._circleAction(b.dataset.c)));
      el.appendChild(circ);

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
          <div class="bc-field bc-rect-only">
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
          <div class="bc-field bc-circle-only">
            <label class="tool-label">Outside fill</label>
            <select class="tool-input bc-ov-cfill">
              <option value="">— global —</option>
              <option value="blur">Blurred image</option>
              <option value="edge">Stretched edges</option>
              <option value="mirror">Mirrored image</option>
              <option value="color">Solid color</option>
              <option value="transparent">Transparent</option>
            </select>
          </div>
          <div class="bc-field bc-circle-only">
            <label class="tool-label">Edges</label>
            <select class="tool-input bc-ov-cinside">
              <option value="">— global —</option>
              <option value="1">Keep inside image</option>
              <option value="0">Allow outside</option>
            </select>
          </div>
          <div class="bc-field bc-rect-only">
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
          <div class="bc-field bc-rect-only bc-ov-custom-ar-wrap" style="display:none;">
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
      const ovCFill   = overridePanel.querySelector('.bc-ov-cfill');
      const ovCInside = overridePanel.querySelector('.bc-ov-cinside');

      [ovCFill, ovCInside].forEach(el => el.addEventListener('input', () => {
        this.ovCFill   = ovCFill.value || null;
        this.ovCInside = ovCInside.value ? ovCInside.value === '1' : null;
        this.refresh();
      }));

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
        this._circleFill();
        this._syncCircControls();
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
      if (this._isCircle()) {
        this.canvas.width = this.canvas.height = VIEW;
        this.canvas.tabIndex = 0;
        this.canvas.style.cursor = 'grab';
        return;
      }
      this.canvas.removeAttribute('tabindex');
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

    resetCrop() {
      if (!this.img) return;
      if (this._isCircle()) { this._circleAction('reset'); return; }
      this._initCrop(); this._draw();
    }

    applyGlobalAR() {
      if (!this.img) return;
      // Re-center crop to match new AR without shrinking below minimum
      this._initCrop();
      this.refresh();
    }

    /** Re-validate against the current settings and redraw, keeping the crop. */
    refresh() {
      if (!this.img) return;
      if (this._isCircle()) { this._clampCircle(); this._syncCircControls(); }
      this._draw();
    }

    onModeChange() {
      if (!this.img) return;
      this._ptrs.clear();
      this._drag = null;
      this._initCanvas();
      this.refresh();
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
      if (this._isCircle()) this._drawCircle();
      else this._drawRect();
    }

    _drawRect() {
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
      this._bindCircleEvents();
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
      if (this._isCircle()) return;
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
      if (this._isCircle()) return;
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

    // ══ Circle (profile picture) mode ═════════════════════════════════════
    _isCircle() { return isCircleMode(); }
    _fmt()      { return this.ovFormat ?? gFormat.value; }
    _outSize()  { return Math.max(1, this.ovWidth ?? +gWidth.value); }
    _baseR()    { return Math.min(this.img.naturalWidth, this.img.naturalHeight) / 2; }

    _circOpts() {
      return {
        inside:      this.ovCInside ?? gCInside.checked,
        fill:        this.ovCFill ?? gCFill.value,
        fillColor:   gCFillColor.value,
        blur:        +gCBlur.value,                   // % of the output size
        bright:      +gCBright.value / 100,
        bgZoom:      +gCBgZoom.value / 100,
        corners:     gCCorners.value,
        cornerColor: gCCornerColor.value,
        ring:        Math.max(0, +gCRing.value || 0), // output px
        ringColor:   gCRingColor.value,
      };
    }

    // Half-extent of the output shape per unit radius, measured along the
    // image axes: 1 for the circle, |cos|+|sin| for a rotated square.
    _ext(st = this.circ) {
      if (this._circOpts().corners !== 'keep') return 1;
      const t = st.rot * Math.PI / 180;
      return Math.abs(Math.cos(t)) + Math.abs(Math.sin(t));
    }

    _clampR(r) {
      const base = this._baseR();
      const hi = this._circOpts().inside ? base / this._ext() : base / ZOOM_MIN;
      return clamp(r, base / ZOOM_MAX, Math.max(base / ZOOM_MAX, hi));
    }

    _clampCircle() {
      const iw = this.img.naturalWidth, ih = this.img.naturalHeight;
      const c = this.circ;
      c.rot = normDeg(c.rot);
      c.r = this._clampR(c.r);
      if (this._circOpts().inside) {
        const e = c.r * this._ext();
        c.cx = clamp(c.cx, e, iw - e);
        c.cy = clamp(c.cy, e, ih - e);
      } else {
        // Anywhere, as long as the image still touches the frame.
        c.cx = clamp(c.cx, -c.r, iw + c.r);
        c.cy = clamp(c.cy, -c.r, ih + c.r);
      }
    }

    _isOutside() {
      const iw = this.img.naturalWidth, ih = this.img.naturalHeight;
      const c = this.circ, e = c.r * this._ext(), eps = 0.5;
      return c.cx - e < -eps || c.cy - e < -eps || c.cx + e > iw + eps || c.cy + e > ih + eps;
    }

    /** Largest view that stays fully inside the image, centered. */
    _circleFill() {
      const c = this.circ;
      c.cx = this.img.naturalWidth / 2;
      c.cy = this.img.naturalHeight / 2;
      c.r  = this._baseR() / this._ext();
      this._clampCircle();
    }

    /** Smallest view that shows the whole image, centered. */
    _circleFit() {
      const iw = this.img.naturalWidth, ih = this.img.naturalHeight;
      const c = this.circ;
      c.cx = iw / 2; c.cy = ih / 2;
      if (this._circOpts().corners === 'keep') {
        const t = c.rot * Math.PI / 180, cs = Math.abs(Math.cos(t)), sn = Math.abs(Math.sin(t));
        c.r = Math.max(iw * cs + ih * sn, iw * sn + ih * cs) / 2;
      } else {
        c.r = Math.hypot(iw, ih) / 2;
      }
      this._clampCircle();
    }

    _circleAction(action) {
      if (!this.img) return;
      const c = this.circ;
      switch (action) {
        case 'rotl':   c.rot -= 90; break;
        case 'rotr':   c.rot += 90; break;
        // Mirror across the screen's vertical axis whatever the rotation.
        case 'flip':   c.flip = !c.flip; c.rot = -c.rot; break;
        case 'center': c.cx = this.img.naturalWidth / 2; c.cy = this.img.naturalHeight / 2; break;
        case 'fill':   this._circleFill(); break;
        case 'fit':    this._circleFit(); break;
        case 'reset':  c.rot = 0; c.flip = false; this._circleFill(); break;
      }
      this._afterCircleChange();
    }

    _afterCircleChange() {
      this._clampCircle();
      this._syncCircControls();
      this._scheduleDraw();
    }

    _scheduleDraw() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this._draw(); });
    }

    _syncCircControls() {
      const zoom = this._baseR() / this.circ.r;
      this.cZoom.value = Math.round(1000 * Math.log10(zoom));
      this.cZoomVal.textContent = Math.round(zoom * 100) + '%';
      this.cRot.value = this.circ.rot;
      this.cRotVal.textContent = `${+this.circ.rot.toFixed(1)}°`;
      this.cFitBtn.disabled = this._circOpts().inside;
    }

    // ── Circle geometry ──────────────────────────────────────────────────────
    // view = C + k·R(rot)·F·(img − center), F = horizontal flip.
    _viewK(r = this.circ.r) { return FRAME_PX / 2 / r; }

    /** Screen-space delta → image-space delta (before dividing by k). */
    _unrotate(dx, dy, st = this.circ) {
      const t = st.rot * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
      const x = dx * cs + dy * sn;
      return { x: st.flip ? -x : x, y: -dx * sn + dy * cs };
    }

    _toView(px, py) {
      const c = this.circ, k = this._viewK(), t = c.rot * Math.PI / 180;
      const dx = (px - c.cx) * (c.flip ? -1 : 1), dy = py - c.cy;
      return [VIEW / 2 + k * (dx * Math.cos(t) - dy * Math.sin(t)),
              VIEW / 2 + k * (dx * Math.sin(t) + dy * Math.cos(t))];
    }

    /** Image-space bounding box of a target rect, for a frame centered at (cx,cy) with scale k. */
    _bboxInImage(x0, y0, x1, y1, cx, cy, k) {
      const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
        const d = this._unrotate(x - cx, y - cy);
        const ix = this.circ.cx + d.x / k, iy = this.circ.cy + d.y / k;
        b.x0 = Math.min(b.x0, ix); b.x1 = Math.max(b.x1, ix);
        b.y0 = Math.min(b.y0, iy); b.y1 = Math.max(b.y1, iy);
      }
      return b;
    }

    /** Change the radius keeping the image point under (sx,sy) fixed. */
    _zoomTo(r, sx = VIEW / 2, sy = VIEW / 2) {
      const d = this._unrotate(sx - VIEW / 2, sy - VIEW / 2);
      const k0 = this._viewK();
      const px = this.circ.cx + d.x / k0, py = this.circ.cy + d.y / k0;
      this.circ.r = this._clampR(r);
      const k1 = this._viewK();
      this.circ.cx = px - d.x / k1;
      this.circ.cy = py - d.y / k1;
      this._afterCircleChange();
    }

    // ── Fill sources (low-res copies, cached) ────────────────────────────────
    _bgSource() {
      if (!this._bg) {
        const iw = this.img.naturalWidth, ih = this.img.naturalHeight;
        const s = Math.min(1, BG_MAX / Math.max(iw, ih));
        const c = document.createElement('canvas');
        c.width  = Math.max(1, Math.round(iw * s));
        c.height = Math.max(1, Math.round(ih * s));
        const x = c.getContext('2d');
        x.imageSmoothingQuality = 'high';
        x.drawImage(this.img, 0, 0, c.width, c.height);
        this._bg = { canvas: c, sx: c.width / iw, sy: c.height / ih };
      }
      return this._bg;
    }

    /** 2×2 tile of the image and its reflections; repeats as an endless mirror. */
    _mirrorTile() {
      if (!this._mirror) {
        const src = this._bgSource().canvas, w = src.width, h = src.height;
        const t = document.createElement('canvas');
        t.width = w * 2; t.height = h * 2;
        const x = t.getContext('2d');
        [[1, 1, 0, 0], [-1, 1, 2 * w, 0], [1, -1, 0, 2 * h], [-1, -1, 2 * w, 2 * h]].forEach(([sx, sy, tx, ty]) => {
          x.setTransform(sx, 0, 0, sy, tx, ty);
          x.drawImage(src, 0, 0);
        });
        this._mirror = t;
      }
      return this._mirror;
    }

    /**
     * The image with its border pixels smeared outward by `need` image px.
     * Built at a resolution that keeps the canvas bounded; `need` is bucketed
     * to powers of two so dragging doesn't rebuild it every frame.
     */
    _edgeCanvas(need) {
      const bucket = Math.pow(2, Math.ceil(Math.log2(Math.max(16, need))));
      if (this._edge && this._edge.bucket === bucket) return this._edge;
      const iw = this.img.naturalWidth, ih = this.img.naturalHeight;
      const s = Math.min(this._bgSource().sx, 1536 / bucket);
      const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
      const p = Math.ceil(bucket * s);
      const c = document.createElement('canvas');
      c.width = w + 2 * p; c.height = h + 2 * p;
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(this._bgSource().canvas, p, p, w, h);
      x.imageSmoothingEnabled = false;
      x.drawImage(c, p, p, w, 1, p, 0, w, p);                             // top
      x.drawImage(c, p, p + h - 1, w, 1, p, p + h, w, p);                 // bottom
      x.drawImage(c, p, 0, 1, h + 2 * p, 0, 0, p, h + 2 * p);             // left (incl. corners)
      x.drawImage(c, p + w - 1, 0, 1, h + 2 * p, p + w, 0, p, h + 2 * p); // right (incl. corners)
      this._edge = { canvas: c, bucket, p, sx: w / iw, sy: h / ih };
      return this._edge;
    }

    // ── Compositing ──────────────────────────────────────────────────────────
    /**
     * Renders the circle-mode result into ctx (tw × th). `frame` is where the
     * output square sits in target px; anything beyond it is rendered too
     * (the preview uses that to show context around the frame).
     */
    _compose(ctx, tw, th, frame, o, { mask, jpeg, fg = this.img }) {
      const iw = this.img.naturalWidth, ih = this.img.naturalHeight;
      const c  = this.circ;
      const L  = frame.size, k = L / (2 * c.r);
      const cx = frame.x + L / 2, cy = frame.y + L / 2;
      const t  = c.rot * Math.PI / 180, fx = c.flip ? -1 : 1;
      const toImageSpace = (x, ox = 0, oy = 0) => {
        x.translate(cx + ox, cy + oy);
        x.rotate(t);
        x.scale(k * fx, k);
        x.translate(-c.cx, -c.cy);
      };

      // 1. Fill around the image
      let fill = o.fill;
      if (fill === 'transparent' && jpeg) fill = 'color';
      const vis = this._bboxInImage(0, 0, tw, th, cx, cy, k);
      const covered = vis.x0 >= 0 && vis.y0 >= 0 && vis.x1 <= iw && vis.y1 <= ih;

      if (fill === 'color') {
        ctx.fillStyle = o.fillColor;
        ctx.fillRect(0, 0, tw, th);
      } else if (fill !== 'transparent' && !covered) {
        // Render the fill on an oversized layer so the blur has real pixels
        // to sample at the edges instead of fading to transparent.
        const blurPx = o.blur / 100 * L;
        const m = Math.ceil(blurPx * 3) + 2;
        const layer = document.createElement('canvas');
        layer.width = tw + 2 * m; layer.height = th + 2 * m;
        const lc = layer.getContext('2d');
        lc.imageSmoothingQuality = 'high';
        const bg = this._bgSource();

        if (fill === 'blur') {
          // Whole image, scaled to cover the frame, centered on it.
          const cover = (L + 2 * m) * (Math.abs(Math.cos(t)) + Math.abs(Math.sin(t)))
                        / Math.min(iw, ih) * o.bgZoom;
          lc.translate(cx + m, cy + m);
          lc.rotate(t);
          lc.scale(cover * fx, cover);
          lc.drawImage(bg.canvas, -iw / 2, -ih / 2, iw, ih);
        } else {
          const bb = this._bboxInImage(-m, -m, tw + m, th + m, cx, cy, k);
          toImageSpace(lc, m, m);
          if (fill === 'mirror') {
            lc.scale(1 / bg.sx, 1 / bg.sy);
            lc.fillStyle = lc.createPattern(this._mirrorTile(), 'repeat');
            lc.fillRect(bb.x0 * bg.sx, bb.y0 * bg.sy, (bb.x1 - bb.x0) * bg.sx, (bb.y1 - bb.y0) * bg.sy);
          } else { // 'edge'
            const ed = this._edgeCanvas(Math.max(-bb.x0, -bb.y0, bb.x1 - iw, bb.y1 - ih));
            lc.drawImage(ed.canvas, -ed.p / ed.sx, -ed.p / ed.sy, ed.canvas.width / ed.sx, ed.canvas.height / ed.sy);
          }
        }
        drawFiltered(ctx, layer, -m, -m, blurPx, o.bright);
      }

      // 2. The image
      ctx.save();
      toImageSpace(ctx);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(fg, 0, 0, iw, ih);
      ctx.restore();

      // 3. Corners outside the circle
      if (mask && o.corners !== 'keep') {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        ctx.beginPath();
        ctx.arc(cx, cy, L / 2, 0, Math.PI * 2);
        ctx.fill();
        if (o.corners === 'color' || jpeg) {
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = o.cornerColor;
          ctx.fillRect(frame.x, frame.y, L, L);
        }
        ctx.restore();
      }

      // 4. Ring (width is in output px)
      if (o.ring > 0) {
        const w = Math.min(L / 2, o.ring * L / this._outSize());
        ctx.save();
        ctx.strokeStyle = o.ringColor;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(cx, cy, L / 2 - w / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    /** Final output (size × size), exactly what gets exported. */
    _renderCircle(size, fg = this.img) {
      const out = document.createElement('canvas');
      out.width = out.height = size;
      const ctx = out.getContext('2d');
      const jpeg = this._fmt() === 'image/jpeg';
      this._compose(ctx, size, size, { x: 0, y: 0, size }, this._circOpts(), { mask: true, jpeg, fg });
      if (jpeg) {
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
      }
      return out;
    }

    _drawCircle() {
      const ctx = this.canvas.getContext('2d');
      const o   = this._circOpts();
      const D   = FRAME_PX, f0 = (VIEW - D) / 2, C = VIEW / 2;

      const jpeg = this._fmt() === 'image/jpeg';
      ctx.save();
      // Checkerboard only when the fill really is transparent; otherwise a dark
      // backdrop, so the far edges of the viewport beyond the fill aren't noisy.
      if (o.fill === 'transparent' && !jpeg) {
        drawChecker(ctx, VIEW, VIEW);
      } else {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, VIEW, VIEW);
      }
      this._compose(ctx, VIEW, VIEW, { x: f0, y: f0, size: D }, o, { mask: false, jpeg });

      // Dim everything outside the output shape
      ctx.beginPath();
      ctx.rect(0, 0, VIEW, VIEW);
      if (o.corners === 'keep') ctx.rect(f0, f0, D, D);
      else ctx.arc(C, C, D / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill('evenodd');

      // Where the real image ends
      const iw = this.img.naturalWidth, ih = this.img.naturalHeight;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      [[0, 0], [iw, 0], [iw, ih], [0, ih]].forEach(([x, y], i) => {
        const [vx, vy] = this._toView(x, y);
        if (i) ctx.lineTo(vx, vy); else ctx.moveTo(vx, vy);
      });
      ctx.closePath();
      ctx.stroke();

      // Frame outline (in square mode the circle is only a guide)
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash(o.corners === 'keep' ? [4, 4] : []);
      ctx.beginPath();
      ctx.arc(C, C, D / 2, 0, Math.PI * 2);
      ctx.stroke();
      if (o.corners === 'keep') {
        ctx.setLineDash([]);
        ctx.strokeRect(f0, f0, D, D);
      }
      ctx.restore();

      // Output thumbnail
      const T  = this.thumb.width;
      const tc = this.thumb.getContext('2d');
      drawChecker(tc, T, T, 8);
      tc.drawImage(this._renderCircle(T), 0, 0);

      const c = this.circ, n = this._outSize();
      this.infoBar.textContent =
        `Circle: ⌀ ${Math.round(c.r * 2)} px · zoom ${Math.round(this._baseR() / c.r * 100)}% · ` +
        `${+c.rot.toFixed(1)}°${c.flip ? ' · flipped' : ''}  →  Output: ${n} × ${n} px` +
        (this._isOutside() ? '  ·  extends past image' : '');
    }

    // ── Circle interaction ───────────────────────────────────────────────────
    // Pointer events: one pointer pans, two pointers pinch-zoom + rotate + pan.
    _bindCircleEvents() {
      const cv = this.canvas;
      cv.addEventListener('pointerdown', e => {
        if (!this._isCircle()) return;
        cv.setPointerCapture(e.pointerId);
        this._ptrs.set(e.pointerId, this._canvasXY(e));
        this._startGesture();
        cv.style.cursor = 'grabbing';
      });
      cv.addEventListener('pointermove', e => {
        if (!this._isCircle() || !this._ptrs.has(e.pointerId)) return;
        this._ptrs.set(e.pointerId, this._canvasXY(e));
        this._moveGesture();
      });
      const end = e => {
        if (!this._ptrs.delete(e.pointerId)) return;
        this._startGesture();
        if (!this._ptrs.size && this._isCircle()) cv.style.cursor = 'grab';
      };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);

      cv.addEventListener('wheel', e => {
        if (!this._isCircle()) return;
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
        if (e.shiftKey) {
          // Some browsers turn Shift+wheel into a horizontal scroll.
          this.circ.rot += (e.deltaY || e.deltaX) * unit * 0.05;
          this._afterCircleChange();
          return;
        }
        // ctrlKey = trackpad pinch, which sends small, frequent deltas
        const p = this._canvasXY(e);
        this._zoomTo(this.circ.r * Math.exp(e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y);
      }, { passive: false });

      cv.addEventListener('dblclick', () => { if (this._isCircle()) this._circleAction('reset'); });
      cv.addEventListener('keydown', e => this._onCircleKey(e));
    }

    _startGesture() {
      this._gesture = { c: { ...this.circ }, pts: [...this._ptrs.values()].map(p => ({ ...p })) };
    }

    _moveGesture() {
      const g = this._gesture;
      if (!g || !this.img) return;
      const pts = [...this._ptrs.values()];
      const st = this.circ, C = VIEW / 2;

      if (pts.length === 1 && g.pts.length === 1) {
        const d = this._unrotate(pts[0].x - g.pts[0].x, pts[0].y - g.pts[0].y, g.c);
        const k = this._viewK(g.c.r);
        st.cx = g.c.cx - d.x / k;
        st.cy = g.c.cy - d.y / k;
      } else if (pts.length >= 2 && g.pts.length >= 2) {
        const [a0, b0] = g.pts, [a1, b1] = pts;
        const m0x = (a0.x + b0.x) / 2, m0y = (a0.y + b0.y) / 2;
        const m1x = (a1.x + b1.x) / 2, m1y = (a1.y + b1.y) / 2;
        // The image point under the starting midpoint follows the current midpoint
        const k0 = this._viewK(g.c.r);
        const u0 = this._unrotate(m0x - C, m0y - C, g.c);
        const px = g.c.cx + u0.x / k0, py = g.c.cy + u0.y / k0;
        st.rot = g.c.rot + (Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x)) * 180 / Math.PI;
        st.r = this._clampR(g.c.r * Math.hypot(b0.x - a0.x, b0.y - a0.y) / Math.max(1, Math.hypot(b1.x - a1.x, b1.y - a1.y)));
        const k1 = this._viewK(st.r);
        const u1 = this._unrotate(m1x - C, m1y - C, st);
        st.cx = px - u1.x / k1;
        st.cy = py - u1.y / k1;
      }
      this._afterCircleChange();
    }

    _onCircleKey(e) {
      if (!this._isCircle() || !this.img) return;
      const step = (e.shiftKey ? 0.1 : 0.02) * FRAME_PX;
      const pan = (dx, dy) => {
        const d = this._unrotate(dx, dy), k = this._viewK();
        this.circ.cx -= d.x / k;
        this.circ.cy -= d.y / k;
      };
      switch (e.key) {
        case 'ArrowLeft':  pan(-step, 0); break;
        case 'ArrowRight': pan(step, 0);  break;
        case 'ArrowUp':    pan(0, -step); break;
        case 'ArrowDown':  pan(0, step);  break;
        case '[': this.circ.rot -= 1;  break;
        case ']': this.circ.rot += 1;  break;
        case '{': this.circ.rot -= 15; break;
        case '}': this.circ.rot += 15; break;
        case '+': case '=': e.preventDefault(); this._zoomTo(this.circ.r / 1.1); return;
        case '-': case '_': e.preventDefault(); this._zoomTo(this.circ.r * 1.1); return;
        case '0':           e.preventDefault(); this._circleAction('reset'); return;
        default: return;
      }
      e.preventDefault();
      this._afterCircleChange();
    }

    // ── Export ───────────────────────────────────────────────────────────────
    async export() {
      const fmt = this._fmt();
      const q   = Math.min(1, Math.max(0.01, (this.ovQuality ?? +gQuality.value) / 100));

      const out = this._isCircle() ? await this._exportCanvasCircle() : await this._exportCanvasRect(fmt);

      // Encode
      const blob = await (window.pica
        ? pica().toBlob(out, fmt, q)
        : new Promise(res => out.toBlob(res, fmt, q)));

      // Build filename
      const prefix = gPrefix.value.trim();
      const suffix = gSuffix.value.trim();
      const base   = this.file.name.replace(/\.[^/.]+$/, '');
      const ext    = EXT[fmt] || 'png';
      const name   = `${prefix}${base}${suffix}.${ext}`;

      return { blob, name };
    }

    async _exportCanvasCircle() {
      const size = this._outSize();
      const k = size / (2 * this.circ.r);
      let fg = this.img;
      // Large downscales alias badly through drawImage, so pre-shrink the
      // image with pica to the final scale and let the composite draw it ~1:1.
      if (window.pica && k < 1) {
        const tmp = document.createElement('canvas');
        tmp.width  = Math.max(1, Math.round(this.img.naturalWidth * k));
        tmp.height = Math.max(1, Math.round(this.img.naturalHeight * k));
        await pica().resize(this.img, tmp, { unsharpAmount: 80, unsharpRadius: 0.6, unsharpThreshold: 2 });
        fg = tmp;
      }
      return this._renderCircle(size, fg);
    }

    async _exportCanvasRect(fmt) {
      const ow  = Math.max(1, this.ovWidth  ?? +gWidth.value);
      const oh  = Math.max(1, this.ovHeight ?? +gHeight.value);

      const { x, y, w, h } = this.crop;

      // 1. Draw cropped region to a tmp canvas (natural size)
      const tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      const tctx = tmp.getContext('2d');
      // JPEG has no alpha channel: transparent pixels would encode as black.
      // Matte them onto white first, which is what every other tool does.
      if (fmt === 'image/jpeg') {
        tctx.fillStyle = '#ffffff';
        tctx.fillRect(0, 0, w, h);
      }
      tctx.drawImage(this.img, x, y, w, h, 0, 0, w, h);

      // 2. Resize to output with pica
      const out = document.createElement('canvas');
      out.width = ow; out.height = oh;

      if (window.pica) {
        await pica().resize(tmp, out, { unsharpAmount: 80, unsharpRadius: 0.6, unsharpThreshold: 2 });
      } else {
        out.getContext('2d').drawImage(tmp, 0, 0, ow, oh);
      }
      return out;
    }
  } // end CropCard
});
