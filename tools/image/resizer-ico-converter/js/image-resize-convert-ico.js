document.addEventListener('DOMContentLoaded', () => {

  // DOM refs
  const dropZone           = document.getElementById('drop-zone');
  const input              = document.getElementById('source-file');
  const uploadPreviews     = document.getElementById('upload-previews');
  const icoSizeWarning     = document.getElementById('ico-size-warning');
  const icoWarnSizes       = icoSizeWarning.querySelector('.ico-warn-sizes');
  const btn                = document.getElementById('generate-btn');
  const results            = document.getElementById('results');
  const downloadAllSection = document.getElementById('download-all-section');
  const downloadAllBtn     = document.getElementById('download-all-zip-btn');
  const downloadAllDesc    = document.getElementById('download-all-desc');
  const customSizeInput    = document.getElementById('custom-size-input');
  const addCustomBtn       = document.getElementById('add-custom-size-btn');
  const customChips        = document.getElementById('custom-chips');

  // ----------------------------------------------------------------
  // Size selection
  // ----------------------------------------------------------------

  const customSizes = new Set();

  function getSelectedSizes() {
    const preset = Array.from(
      document.querySelectorAll('#size-presets input[type="checkbox"]:checked')
    ).map(cb => parseInt(cb.value, 10));
    return [...new Set([...preset, ...customSizes])].sort((a, b) => a - b);
  }

  function addCustomSize(val) {
    const n = parseInt(val, 10);
    if (!n || n < 1 || n > 4096) { alert('Enter a size between 1 and 4096.'); return; }
    if (customSizes.has(n)) return;
    const existingCb = document.querySelector(`#size-presets input[value="${n}"]`);
    if (existingCb) {
      existingCb.checked = true;
      customSizeInput.value = '';
      updateIcoSizeWarning();
      return;
    }
    customSizes.add(n);
    const chip = document.createElement('label');
    chip.className = 'size-chip custom-chip';
    chip.innerHTML = `<input type="checkbox" checked disabled /> ${n} <button class="chip-remove" aria-label="Remove ${n}">&times;</button>`;
    chip.querySelector('.chip-remove').addEventListener('click', () => {
      customSizes.delete(n);
      chip.remove();
      updateIcoSizeWarning();
    });
    customChips.appendChild(chip);
    customSizeInput.value = '';
    updateIcoSizeWarning();
  }

  addCustomBtn.addEventListener('click', () => addCustomSize(customSizeInput.value));
  customSizeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomSize(customSizeInput.value); }
  });

  function applyPreset(sizes) {
    document.querySelectorAll('#size-presets input[type="checkbox"]').forEach(cb => cb.checked = false);
    customSizes.clear();
    customChips.innerHTML = '';
    for (const s of sizes) {
      const cb = document.querySelector(`#size-presets input[value="${s}"]`);
      if (cb) cb.checked = true;
      else addCustomSize(s);
    }
    updateIcoSizeWarning();
  }

  document.querySelectorAll('.preset-btn').forEach(pbtn => {
    pbtn.addEventListener('click', () => {
      applyPreset(pbtn.dataset.sizes.split(',').map(s => parseInt(s, 10)));
    });
  });

  document.querySelectorAll('#size-presets input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateIcoSizeWarning);
  });

  updateIcoSizeWarning(); // initialise on load (512 is checked by default)

  function updateIcoSizeWarning() {
    const over = getSelectedSizes().filter(s => s > 256);
    if (over.length) {
      icoWarnSizes.textContent = over.join(', ') + '\u00a0px';
      icoSizeWarning.style.display = '';
    } else {
      icoSizeWarning.style.display = 'none';
    }
  }

  // ----------------------------------------------------------------
  // File staging & drop zone
  // ----------------------------------------------------------------

  let stagedFiles = [];  // File[]
  let allResults  = [];  // processed result objects

  function isAcceptedFile(f) {
    return /\.(png|jpe?g|ico)$/i.test(f.name) ||
           ['image/png', 'image/jpeg', 'image/jpg',
            'image/x-icon', 'image/vnd.microsoft.icon'].includes(f.type);
  }

  function addFiles(files) {
    let added = 0;
    for (const f of files) {
      if (!isAcceptedFile(f)) continue;
      if (stagedFiles.some(sf => sf.name === f.name && sf.size === f.size)) continue;
      stagedFiles.push(f);
      added++;
    }
    if (added) renderUploadPreviews();
  }

  function removeFile(idx) {
    stagedFiles.splice(idx, 1);
    renderUploadPreviews();
  }

  // Drop zone interaction
  dropZone.addEventListener('click', e => { if (e.target !== input) input.click(); });
  dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => {
    if (input.files.length) addFiles(Array.from(input.files));
    input.value = ''; // allow re-selecting same file
  });
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', e => {
    if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    addFiles(Array.from(e.dataTransfer.files));
  });

  // ----------------------------------------------------------------
  // Upload previews
  // ----------------------------------------------------------------

  function renderUploadPreviews() {
    uploadPreviews.innerHTML = '';
    if (!stagedFiles.length) { uploadPreviews.style.display = 'none'; return; }
    uploadPreviews.style.display = '';

    for (let i = 0; i < stagedFiles.length; i++) {
      const f   = stagedFiles[i];
      const idx = i;
      const url = URL.createObjectURL(f);

      const card = document.createElement('div');
      card.className = 'upload-preview-card';

      const removeBtn = document.createElement('button');
      removeBtn.type      = 'button';
      removeBtn.className = 'upload-preview-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.setAttribute('aria-label', 'Remove ' + f.name);
      removeBtn.addEventListener('click', () => removeFile(idx));

      const img = document.createElement('img');
      img.className = 'upload-preview-img';
      img.src       = url;
      img.alt       = f.name;
      img.onerror   = () => img.remove();

      const name = document.createElement('div');
      name.className   = 'upload-preview-name';
      name.textContent = f.name;
      name.title       = f.name;

      const body = document.createElement('div');
      body.className = 'upload-preview-body';
      body.appendChild(name);

      card.appendChild(removeBtn);
      card.appendChild(img);
      card.appendChild(body);

      // ICO layer details
      if (isIcoFile(f)) {
        const info = document.createElement('div');
        info.className   = 'upload-preview-ico-info';
        info.textContent = 'Reading\u2026';
        body.appendChild(info);

        blobToArrayBuffer(f).then(buf => {
          try {
            const layers = parseIcoLayers(buf);
            const best   = layers.reduce((a, b) => a.width * a.height >= b.width * b.height ? a : b);
            info.innerHTML = layers.map(l => {
              const cls = (l.width === best.width && l.height === best.height) ? ' ico-layer-best' : '';
              return `<span class="ico-layer-chip${cls}">${l.width}&times;${l.height}</span>`;
            }).join(' ');
          } catch (_) {
            info.textContent = 'Could not read layers';
          }
        });
      }

      uploadPreviews.appendChild(card);
    }
  }

  // ----------------------------------------------------------------
  // Generate
  // ----------------------------------------------------------------

  btn.addEventListener('click', async () => {
    if (!stagedFiles.length) { alert('Please select at least one image.'); return; }
    const sizes = getSelectedSizes();
    if (!sizes.length) { alert('Please select at least one size.'); return; }

    results.innerHTML            = '';
    allResults                   = [];
    downloadAllSection.style.display = 'none';
    btn.disabled                 = true;
    btn.textContent              = 'Generating\u2026';

    try {
      for (const file of stagedFiles) {
        const group = await processFile(file, sizes);
        allResults.push(group);
        renderResultGroup(group);
      }

      if (allResults.length) {
        const totalOk = allResults.reduce((s, g) => s + g.items.filter(x => !x.error).length, 0);
        if (allResults.length === 1) {
          downloadAllDesc.textContent = `${totalOk} size${totalOk !== 1 ? 's' : ''} generated \u2014 1 image`;
        } else {
          downloadAllDesc.textContent =
            `${totalOk} total outputs across ${allResults.length} images`;
        }
        downloadAllSection.style.display = '';
      }
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Generate Sizes \u0026 ICOs';
    }
  });

  async function processFile(file, sizes) {
    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'image';
    const img      = await loadImageFromFile(file);
    const items    = [];

    for (const size of sizes) {
      try {
        const pngBlob = await resizeImageToPNG(img, size, size);
        const pngBuf  = await blobToArrayBuffer(pngBlob);
        const icoBuf  = pngToSingleIco(pngBuf);
        const icoBlob = new Blob([icoBuf], { type: 'image/x-icon' });
        items.push({ size, pngBlob, icoBlob, pngBuf, error: null });
      } catch (err) {
        items.push({ size, pngBlob: null, icoBlob: null, pngBuf: null, error: err.message || String(err) });
        console.error(err);
      }
    }

    // Multi-size ICO: only sizes ≤ 256.
    // Sizes >256 map to 0 in the ICO directory byte field (same as 256),
    // creating indistinguishable duplicate entries — excluded to stay standards-compliant.
    const icoEligible = items
      .filter(x => !x.error && x.size <= 256)
      .sort((a, b) => a.size - b.size);
    let multiIcoBlob = null;
    if (icoEligible.length) {
      const multiBuf = pngsToMultiIco(icoEligible.map(x => x.pngBuf));
      multiIcoBlob   = new Blob([multiBuf], { type: 'image/x-icon' });
    }

    return { file, baseName, sizes, items, multiIcoBlob };
  }

  // ----------------------------------------------------------------
  // Render result group
  // ----------------------------------------------------------------

  function renderResultGroup(group) {
    const { file, baseName, items, multiIcoBlob } = group;

    const section = document.createElement('section');
    section.className = 'image-result-group';

    // Header
    const thumbUrl = URL.createObjectURL(file);
    const header   = document.createElement('div');
    header.className = 'result-group-header';

    const thumb = document.createElement('img');
    thumb.className = 'result-group-thumb';
    thumb.src       = thumbUrl;
    thumb.alt       = file.name;
    thumb.onerror   = () => thumb.remove();

    const meta  = document.createElement('div');
    meta.className = 'result-group-meta';

    const fname = document.createElement('div');
    fname.className   = 'result-group-filename';
    fname.textContent = file.name;
    fname.title       = file.name;

    const stats = document.createElement('div');
    stats.className = 'result-group-stats';
    const ok = items.filter(x => !x.error).length;
    stats.textContent = `${ok} of ${items.length} size${items.length !== 1 ? 's' : ''} generated`;

    meta.appendChild(fname);
    meta.appendChild(stats);
    header.appendChild(thumb);
    header.appendChild(meta);
    section.appendChild(header);

    // Multi-size ICO banner
    if (multiIcoBlob) {
      const icoSizes  = items.filter(x => !x.error && x.size <= 256).map(x => x.size);
      const overCount = items.filter(x => !x.error && x.size > 256).length;

      const banner = document.createElement('div');
      banner.className = 'multisize-banner-wrap group-banner';
      banner.innerHTML =
        `<div class="multisize-banner">` +
          `<div class="multisize-banner-info">` +
            `<strong>Multi-Size .ICO</strong>` +
            `<span>${icoSizes.length} layer${icoSizes.length !== 1 ? 's' : ''}: ` +
              `${icoSizes.join(', ')}\u00a0px` +
              `${overCount ? ` &mdash; ${overCount} oversized excluded` : ''}` +
            `</span>` +
          `</div>` +
          `<button class="tool-button multisize-dl-btn" type="button">Download Multi-Size .ICO</button>` +
        `</div>`;
      banner.querySelector('.multisize-dl-btn').addEventListener('click', () => {
        triggerDownload(multiIcoBlob, `${baseName}-multisize.ico`);
      });
      section.appendChild(banner);
    } else {
      // All sizes were >256 — no multi-ICO possible
      const note = document.createElement('div');
      note.className   = 'info-banner info-banner--info group-info-note';
      note.innerHTML   =
        `<span class="info-banner-icon">&#8505;</span>` +
        `<span>No combined Multi-Size .ICO — all selected sizes are above 256&nbsp;px.</span>`;
      section.appendChild(note);
    }

    // Per-image ZIP button row
    const actionsRow = document.createElement('div');
    actionsRow.className = 'result-group-actions';

    const zipBtn = document.createElement('button');
    zipBtn.type      = 'button';
    zipBtn.className = 'tool-button secondary-btn';
    zipBtn.textContent = `Download ${file.name} as ZIP`;
    zipBtn.addEventListener('click', async () => {
      zipBtn.disabled    = true;
      zipBtn.textContent = 'Preparing ZIP\u2026';
      try { await downloadGroupZip(group); }
      catch (e) { alert('Error: ' + e.message); }
      finally { zipBtn.disabled = false; zipBtn.textContent = `Download ${file.name} as ZIP`; }
    });
    actionsRow.appendChild(zipBtn);
    section.appendChild(actionsRow);

    // Cards grid
    const grid = document.createElement('div');
    grid.className = 'preview-grid';
    for (const item of items) grid.appendChild(buildSizeCard(item, baseName));
    section.appendChild(grid);

    results.appendChild(section);
  }

  function buildSizeCard(item, baseName) {
    const card = document.createElement('div');
    card.className = 'preview-card';

    if (item.error) {
      card.innerHTML =
        `<div class="preview-size">${item.size}&times;${item.size}</div>` +
        `<div class="preview-error">${escHtml(item.error)}</div>`;
      return card;
    }

    const pngUrl = URL.createObjectURL(item.pngBlob);
    const icoUrl = URL.createObjectURL(item.icoBlob);

    const sizeDiv       = document.createElement('div');
    sizeDiv.className   = 'preview-size';
    sizeDiv.textContent = `${item.size} \u00d7 ${item.size}`;

    const img       = document.createElement('img');
    img.className   = 'preview-img';
    img.src         = pngUrl;
    img.alt         = `${item.size}x${item.size}`;

    const actions     = document.createElement('div');
    actions.className = 'action-row';
    const dlIco  = makeAnchor(icoUrl, `${baseName}-${item.size}.ico`, 'Download .ico');
    const dlPng  = makeAnchor(pngUrl, `${baseName}-${item.size}.png`, 'Download PNG');
    const openPng = Object.assign(document.createElement('a'), {
      href: pngUrl, target: '_blank', rel: 'noopener',
      className: 'action-btn secondary', textContent: 'Open PNG'
    });
    actions.append(dlIco, dlPng, openPng);

    const note       = document.createElement('div');
    note.className   = 'small-note';
    if (item.size > 256) {
      note.innerHTML = '<em>Excluded from combined .ICO &mdash; above 256&nbsp;px ICO layer limit</em>';
    } else {
      note.textContent = 'iPhone: \u201cOpen PNG\u201d \u2192 long-press \u2192 Save to Photos.';
    }

    card.append(sizeDiv, img, actions, note);
    return card;
  }

  function makeAnchor(href, download, text) {
    return Object.assign(document.createElement('a'), { href, download, className: 'action-btn', textContent: text });
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ----------------------------------------------------------------
  // ZIP downloads
  // ----------------------------------------------------------------

  downloadAllBtn.addEventListener('click', async () => {
    if (!allResults.length) return;
    downloadAllBtn.disabled    = true;
    downloadAllBtn.textContent = 'Preparing ZIP\u2026';
    try { await downloadEverythingZip(); }
    catch (e) { alert('Error creating ZIP: ' + e.message); console.error(e); }
    finally {
      downloadAllBtn.disabled    = false;
      downloadAllBtn.textContent = '\u2193 Download Everything as ZIP';
    }
  });

  async function downloadGroupZip(group) {
    const { baseName, items, multiIcoBlob } = group;
    const zip  = new JSZip();
    const pngF = zip.folder('png');
    const icoF = zip.folder('ico');
    for (const item of items) {
      if (item.error) continue;
      pngF.file(`${baseName}-${item.size}.png`, item.pngBlob);
      icoF.file(`${baseName}-${item.size}.ico`, item.icoBlob);
    }
    if (multiIcoBlob) zip.file(`${baseName}-multisize.ico`, multiIcoBlob);
    triggerDownload(await zip.generateAsync({ type: 'blob' }), `${baseName}-icons.zip`);
  }

  async function downloadEverythingZip() {
    const zip      = new JSZip();
    const isSingle = allResults.length === 1;

    if (isSingle) {
      // Flat layout: png/ and ico/ folders at root + multi-ICO named icon.ico
      const { baseName, items, multiIcoBlob } = allResults[0];
      const pngF = zip.folder('png');
      const icoF = zip.folder('ico');
      for (const item of items) {
        if (item.error) continue;
        pngF.file(`${baseName}-${item.size}.png`, item.pngBlob);
        icoF.file(`${baseName}-${item.size}.ico`, item.icoBlob);
      }
      if (multiIcoBlob) zip.file('icon.ico', multiIcoBlob);
    } else {
      // Per-image subfolders; multi-size ICOs at root named after source file
      for (const { baseName, items, multiIcoBlob } of allResults) {
        const imgFolder = zip.folder(baseName);
        const pngF      = imgFolder.folder('png');
        const icoF      = imgFolder.folder('ico');
        for (const item of items) {
          if (item.error) continue;
          pngF.file(`${baseName}-${item.size}.png`, item.pngBlob);
          icoF.file(`${baseName}-${item.size}.ico`, item.icoBlob);
        }
        if (multiIcoBlob) zip.file(`${baseName}.ico`, multiIcoBlob);
      }
    }

    const zipName = isSingle ? `${allResults[0].baseName}-icons.zip` : 'icons.zip';
    triggerDownload(await zip.generateAsync({ type: 'blob' }), zipName);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ----------------------------------------------------------------
  // Image loading helpers
  // ----------------------------------------------------------------

  function isIcoFile(f) {
    return /\.ico$/i.test(f.name) ||
           f.type === 'image/x-icon' ||
           f.type === 'image/vnd.microsoft.icon';
  }

  function loadImageFromFile(file) {
    if (isIcoFile(file)) return loadBestIcoLayer(file);
    return loadImageFromBlob(file);
  }

  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
      img.src = url;
    });
  }

  // Extracts the largest layer from an ICO.
  // PNG-stored layers are extracted directly; BMP layers fall back to browser native loading.
  async function loadBestIcoLayer(file) {
    const buf    = await blobToArrayBuffer(file);
    const u8     = new Uint8Array(buf);
    const layers = parseIcoLayers(buf);
    if (!layers.length) throw new Error('ICO file has no layers.');
    const best = layers.reduce((a, b) => a.width * a.height >= b.width * b.height ? a : b);
    if (best.isPng) {
      if (best.offset + best.size > u8.length) throw new Error('ICO layer data exceeds file bounds.');
      return loadImageFromBlob(new Blob([u8.slice(best.offset, best.offset + best.size)], { type: 'image/png' }));
    }
    return loadImageFromBlob(file); // BMP DIB fallback
  }

  // Parse ICO directory → [{ width, height, bpp, isPng, offset, size }]
  function parseIcoLayers(buf) {
    const u8 = new Uint8Array(buf);
    if (u8.length < 6 || u8[0] !== 0 || u8[1] !== 0 || u8[2] !== 1 || u8[3] !== 0)
      throw new Error('Not a valid ICO file.');
    const count  = readUInt16LE(u8, 4);
    const layers = [];
    for (let i = 0; i < count; i++) {
      const base  = 6 + i * 16;
      if (base + 16 > u8.length) break;
      const w     = u8[base + 0] === 0 ? 256 : u8[base + 0];
      const h     = u8[base + 1] === 0 ? 256 : u8[base + 1];
      const bpp   = readUInt16LE(u8, base + 6);
      const sz    = readUInt32LE(u8, base + 8);
      const off   = readUInt32LE(u8, base + 12);
      const isPng = off + 4 <= u8.length &&
                    u8[off] === 0x89 && u8[off+1] === 0x50 &&
                    u8[off+2] === 0x4E && u8[off+3] === 0x47;
      layers.push({ width: w, height: h, bpp, isPng, offset: off, size: sz });
    }
    return layers;
  }

  // ----------------------------------------------------------------
  // Resize & ICO building
  // ----------------------------------------------------------------

  function resizeImageToPNG(img, w, h) {
    return new Promise(async (resolve, reject) => {
      try {
        const canvas  = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        if (window.pica) {
          await pica().resize(img, canvas, { unsharpAmount: 80, unsharpRadius: 0.6, unsharpThreshold: 2 });
          resolve(await pica().toBlob(canvas, 'image/png', 0.92));
        } else {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(b => resolve(b), 'image/png', 0.92);
        }
      } catch (e) { reject(e); }
    });
  }

  function blobToArrayBuffer(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload  = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsArrayBuffer(blob);
    });
  }

  // Single-layer ICO wrapping one PNG
  function pngToSingleIco(pngArrayBuffer) {
    const pngBytes = new Uint8Array(pngArrayBuffer);
    if (pngBytes[0] !== 0x89 || pngBytes[1] !== 0x50 || pngBytes[2] !== 0x4E || pngBytes[3] !== 0x47)
      throw new Error('Not a PNG file.');
    const w  = readUInt32BE(pngBytes, 16);
    const h  = readUInt32BE(pngBytes, 20);
    const sz = pngBytes.length;
    const out = new Uint8Array(22 + sz); // 6 header + 16 entry + data
    let p = 0;
    // ICO header
    out[p++]=0; out[p++]=0; out[p++]=1; out[p++]=0; out[p++]=1; out[p++]=0;
    // Directory entry
    out[p++] = w >= 256 ? 0 : w;
    out[p++] = h >= 256 ? 0 : h;
    out[p++] = 0; out[p++] = 0;   // colorCount, reserved
    out[p++] = 1; out[p++] = 0;   // planes
    out[p++] = 32; out[p++] = 0;  // bpp
    out[p++] = sz&0xFF; out[p++] = (sz>>8)&0xFF; out[p++] = (sz>>16)&0xFF; out[p++] = (sz>>24)&0xFF;
    out[p++] = 22; out[p++] = 0; out[p++] = 0; out[p++] = 0; // data offset = 22
    out.set(pngBytes, p);
    return out.buffer;
  }

  // Multi-layer ICO (only pass PNG buffers for sizes ≤ 256)
  function pngsToMultiIco(pngArrayBuffers) {
    const pngArr  = pngArrayBuffers.map(buf => new Uint8Array(buf));
    const count   = pngArr.length;
    const dirSize = 6 + count * 16;
    let   dataLen = 0;
    for (const b of pngArr) dataLen += b.length;

    const out = new Uint8Array(dirSize + dataLen);
    out[0]=0; out[1]=0; out[2]=1; out[3]=0;
    out[4]=count&0xFF; out[5]=(count>>8)&0xFF;

    let dataOffset = dirSize;
    let pos        = 6;
    for (let i = 0; i < count; i++) {
      const bytes = pngArr[i];
      const w     = readUInt32BE(bytes, 16);
      const h     = readUInt32BE(bytes, 20);
      const sz    = bytes.length;
      out[pos++] = w>=256?0:w; out[pos++] = h>=256?0:h;
      out[pos++] = 0; out[pos++] = 0;
      out[pos++] = 1; out[pos++] = 0;
      out[pos++] = 32; out[pos++] = 0;
      out[pos++]=sz&0xFF; out[pos++]=(sz>>8)&0xFF; out[pos++]=(sz>>16)&0xFF; out[pos++]=(sz>>24)&0xFF;
      out[pos++]=dataOffset&0xFF; out[pos++]=(dataOffset>>8)&0xFF;
      out[pos++]=(dataOffset>>16)&0xFF; out[pos++]=(dataOffset>>24)&0xFF;
      dataOffset += sz;
    }
    for (const bytes of pngArr) { out.set(bytes, pos); pos += bytes.length; }
    return out.buffer;
  }

  function readUInt32BE(u8, idx) {
    return (u8[idx]<<24)|(u8[idx+1]<<16)|(u8[idx+2]<<8)|u8[idx+3];
  }
  function readUInt16LE(u8, idx) { return u8[idx]|(u8[idx+1]<<8); }
  function readUInt32LE(u8, idx) {
    return ((u8[idx]|(u8[idx+1]<<8)|(u8[idx+2]<<16)|(u8[idx+3]<<24))>>>0);
  }
});
