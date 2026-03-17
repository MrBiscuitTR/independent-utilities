document.addEventListener('DOMContentLoaded', () => {
  const input               = document.getElementById('source-file');
  const btn                 = document.getElementById('generate-btn');
  const results             = document.getElementById('results');
  const downloadZipBtn      = document.getElementById('download-zip-btn');
  const downloadMultiIcoBtn = document.getElementById('download-multisize-ico-btn');
  const multisizeIcoSection = document.getElementById('multisize-ico-section');
  const multisizeIcoDesc    = document.getElementById('multisize-ico-desc');
  const customSizeInput     = document.getElementById('custom-size-input');
  const addCustomBtn        = document.getElementById('add-custom-size-btn');
  const customChips         = document.getElementById('custom-chips');

  // Custom sizes added by the user
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
    // If the size exists as a default checkbox, just check it instead of adding a custom chip
    const existingCb = document.querySelector(`#size-presets input[value="${n}"]`);
    if (existingCb) {
      existingCb.checked = true;
      customSizeInput.value = '';
      return;
    }
    customSizes.add(n);

    const chip = document.createElement('label');
    chip.className = 'size-chip custom-chip';
    chip.innerHTML = `<input type="checkbox" checked disabled /> ${n} <button class="chip-remove" aria-label="Remove ${n}">&times;</button>`;
    chip.querySelector('.chip-remove').addEventListener('click', () => {
      customSizes.delete(n);
      chip.remove();
    });
    customChips.appendChild(chip);
    customSizeInput.value = '';
  }

  addCustomBtn.addEventListener('click', () => addCustomSize(customSizeInput.value));
  customSizeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomSize(customSizeInput.value); }
  });

  // ICO info panel — shown when an ICO file is selected
  const icoSourceInfo = document.getElementById('ico-source-info');

  function isIcoFile(file) {
    return /\.ico$/i.test(file.name) ||
           file.type === 'image/x-icon' ||
           file.type === 'image/vnd.microsoft.icon';
  }

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file || !isIcoFile(file)) { icoSourceInfo.style.display = 'none'; return; }

    try {
      const buf    = await blobToArrayBuffer(file);
      const layers = parseIcoLayers(buf);
      const best   = layers.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));

      const chips = layers.map(l => {
        const cls = (l.width === best.width && l.height === best.height) ? ' ico-layer-best' : '';
        return `<span class="ico-layer-chip${cls}">${l.width}&times;${l.height}</span>`;
      }).join('');

      icoSourceInfo.innerHTML =
        `<div class="ico-info-title">Source ICO &mdash; ${layers.length} layer${layers.length !== 1 ? 's' : ''} detected</div>` +
        `<div class="ico-info-layers">${chips}</div>` +
        `<div class="ico-info-note">Highlighted layer (${best.width}&times;${best.height}) will be used as resize source.</div>`;
      icoSourceInfo.style.display = '';
    } catch (e) {
      icoSourceInfo.innerHTML = `<div class="ico-info-error">Could not read ICO layers: ${e.message}</div>`;
      icoSourceInfo.style.display = '';
    }
  });

  // Preset handler
  function applyPreset(sizes) {
    // Uncheck all default checkboxes
    document.querySelectorAll('#size-presets input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
    // Clear all custom sizes
    customSizes.clear();
    customChips.innerHTML = '';
    // Apply preset sizes
    for (const s of sizes) {
      const cb = document.querySelector(`#size-presets input[value="${s}"]`);
      if (cb) {
        cb.checked = true;
      } else {
        addCustomSize(s);
      }
    }
  }

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sizes = btn.dataset.sizes.split(',').map(s => parseInt(s, 10));
      applyPreset(sizes);
    });
  });

  // Storage for zip and multi-size ICO
  let allFiles    = [];
  let allPngBufs  = []; // { size, buf } — used for multi-size ICO
  let multiIcoBlob = null;

  btn.addEventListener('click', async () => {
    results.innerHTML = '';
    allFiles    = [];
    allPngBufs  = [];
    multiIcoBlob = null;
    downloadZipBtn.style.display      = 'none';
    multisizeIcoSection.style.display = 'none';

    if (!input.files || !input.files.length) {
      alert('Please select a source image (PNG, JPG or ICO).');
      return;
    }

    const file     = input.files[0];
    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'image';

    // Load source image
    const img = await loadImageFromFile(file);

    const sizes = getSelectedSizes();
    if (!sizes.length) { alert('Please select at least one size.'); return; }

    for (const size of sizes) {
      try {
        const pngBlob = await resizeImageToPNG(img, size, size);
        const pngBuf  = await blobToArrayBuffer(pngBlob);
        const icoBuf  = pngToSingleIco(pngBuf);
        const icoBlob = new Blob([icoBuf], { type: 'image/x-icon' });

        const pngUrl = URL.createObjectURL(pngBlob);
        const icoUrl = URL.createObjectURL(icoBlob);

        // Save for zip and multi-ICO
        allFiles.push({
          pngName: `${baseName}-${size}.png`,
          pngBlob,
          icoName: `${baseName}-${size}.ico`,
          icoBlob
        });
        allPngBufs.push({ size, buf: pngBuf });

        // Build UI card
        const card = document.createElement('div');
        card.className = 'preview-card';
        card.innerHTML = `
          <div class="preview-size">${size} &times; ${size}</div>
          <img class="preview-img" src="${pngUrl}" alt="${size}x${size} preview" />
        `;

        const actions = document.createElement('div');
        actions.className = 'action-row';

        const dlIco = document.createElement('a');
        dlIco.href       = icoUrl;
        dlIco.download   = `${baseName}-${size}.ico`;
        dlIco.className  = 'action-btn';
        dlIco.textContent = 'Download .ico';

        const dlPng = document.createElement('a');
        dlPng.href       = pngUrl;
        dlPng.download   = `${baseName}-${size}.png`;
        dlPng.className  = 'action-btn';
        dlPng.textContent = 'Download PNG';

        const openPng = document.createElement('a');
        openPng.href       = pngUrl;
        openPng.target     = '_blank';
        openPng.rel        = 'noopener';
        openPng.className  = 'action-btn secondary';
        openPng.textContent = 'Open PNG';

        actions.appendChild(dlIco);
        actions.appendChild(dlPng);
        actions.appendChild(openPng);
        card.appendChild(actions);

        const note = document.createElement('div');
        note.className   = 'small-note';
        note.textContent  = 'iPhone: tap "Open PNG" \u2192 long-press the image \u2192 Save Image to Photos.';
        card.appendChild(note);

        results.appendChild(card);

      } catch (err) {
        const errCard = document.createElement('div');
        errCard.className   = 'preview-card';
        errCard.textContent = `Error creating size ${size}: ${err.message || err}`;
        results.appendChild(errCard);
        console.error(err);
      }
    }

    // Build multi-size ICO from all generated PNGs (smallest first)
    if (allPngBufs.length) {
      allPngBufs.sort((a, b) => a.size - b.size);
      const multiBuf = pngsToMultiIco(allPngBufs.map(x => x.buf));
      multiIcoBlob = new Blob([multiBuf], { type: 'image/x-icon' });

      const sizeList = allPngBufs.map(x => x.size).join(', ');
      const n        = allPngBufs.length;
      multisizeIcoDesc.textContent = `${n} size${n !== 1 ? 's' : ''} combined: ${sizeList}\u00a0px`;
      multisizeIcoSection.style.display = '';

      // Wire up the download button (captures baseName in closure)
      downloadMultiIcoBtn.onclick = () => {
        const url = URL.createObjectURL(multiIcoBlob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = `${baseName}-multisize.ico`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      };

      downloadZipBtn.style.display = 'inline-block';
    }
  });

  // ZIP download handler
  downloadZipBtn.addEventListener('click', async () => {
    if (!allFiles.length) return;

    downloadZipBtn.disabled    = true;
    downloadZipBtn.textContent = 'Preparing ZIP\u2026';

    try {
      const zip       = new JSZip();
      const pngFolder = zip.folder('png');
      const icoFolder = zip.folder('ico');

      for (const f of allFiles) {
        pngFolder.file(f.pngName, f.pngBlob);
        icoFolder.file(f.icoName, f.icoBlob);
      }

      // Include the multi-size ICO at the root of the zip
      if (multiIcoBlob) {
        const baseName = (input.files[0]?.name.replace(/\.[^/.]+$/, '') || 'image');
        zip.file(`${baseName}-multisize.ico`, multiIcoBlob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const baseName = (input.files[0]?.name.replace(/\.[^/.]+$/, '') || 'image');
      const zipName  = `${baseName}-icons.zip`;

      const url = URL.createObjectURL(content);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      alert('Error creating ZIP: ' + e.message);
      console.error(e);
    } finally {
      downloadZipBtn.disabled    = false;
      downloadZipBtn.textContent = 'Download All as ZIP';
    }
  });

  // Helpers ---------------------------------------------------

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

  // Extracts the largest layer from an ICO file and loads it as an HTMLImageElement.
  // PNG-stored layers are extracted directly; BMP-stored layers fall back to browser native.
  async function loadBestIcoLayer(file) {
    const buf = await blobToArrayBuffer(file);
    const u8  = new Uint8Array(buf);
    const layers = parseIcoLayers(buf);
    if (!layers.length) throw new Error('ICO file has no layers.');

    const best = layers.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));

    if (best.isPng) {
      if (best.offset + best.size > u8.length) throw new Error('ICO layer data exceeds file bounds.');
      const pngBytes = u8.slice(best.offset, best.offset + best.size);
      return loadImageFromBlob(new Blob([pngBytes], { type: 'image/png' }));
    }
    // BMP DIB layer — let the browser load the ICO natively
    return loadImageFromBlob(file);
  }

  // Parse ICO directory entries; returns [{ width, height, bpp, isPng, offset, size }]
  function parseIcoLayers(buf) {
    const u8 = new Uint8Array(buf);
    if (u8.length < 6 || u8[0] !== 0 || u8[1] !== 0 || u8[2] !== 1 || u8[3] !== 0) {
      throw new Error('Not a valid ICO file.');
    }
    const count  = readUInt16LE(u8, 4);
    const layers = [];
    for (let i = 0; i < count; i++) {
      const base   = 6 + i * 16;
      if (base + 16 > u8.length) break;
      const w      = u8[base + 0] === 0 ? 256 : u8[base + 0];
      const h      = u8[base + 1] === 0 ? 256 : u8[base + 1];
      const bpp    = readUInt16LE(u8, base + 6);
      const sz     = readUInt32LE(u8, base + 8);
      const off    = readUInt32LE(u8, base + 12);
      const isPng  = off + 4 <= u8.length &&
                     u8[off] === 0x89 && u8[off+1] === 0x50 &&
                     u8[off+2] === 0x4E && u8[off+3] === 0x47;
      layers.push({ width: w, height: h, bpp, isPng, offset: off, size: sz });
    }
    return layers;
  }

  function resizeImageToPNG(img, w, h) {
    return new Promise(async (resolve, reject) => {
      try {
        const canvas   = document.createElement('canvas');
        canvas.width   = w;
        canvas.height  = h;

        if (window.pica) {
          await pica().resize(img, canvas, {
            unsharpAmount: 80, unsharpRadius: 0.6, unsharpThreshold: 2
          });
          const blob = await pica().toBlob(canvas, 'image/png', 0.92);
          resolve(blob);
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
      const fr    = new FileReader();
      fr.onload   = () => res(fr.result);
      fr.onerror  = rej;
      fr.readAsArrayBuffer(blob);
    });
  }

  // Build ICO with a single PNG image entry
  function pngToSingleIco(pngArrayBuffer) {
    const pngBytes = new Uint8Array(pngArrayBuffer);
    const size     = pngBytes.length;

    if (pngBytes[0] !== 0x89 || pngBytes[1] !== 0x50 || pngBytes[2] !== 0x4E || pngBytes[3] !== 0x47) {
      throw new Error('Not a PNG file.');
    }

    const width  = readUInt32BE(pngBytes, 16);
    const height = readUInt32BE(pngBytes, 20);

    const header = new Uint8Array(6);
    header[0] = 0; header[1] = 0;
    header[2] = 1; header[3] = 0;
    header[4] = 1; header[5] = 0;

    const entry = new Uint8Array(16);
    entry[0]  = width  >= 256 ? 0 : width;
    entry[1]  = height >= 256 ? 0 : height;
    entry[2]  = 0; entry[3] = 0;
    entry[4]  = 1; entry[5] = 0;
    entry[6]  = 32; entry[7] = 0;
    entry[8]  = size & 0xFF;
    entry[9]  = (size >> 8)  & 0xFF;
    entry[10] = (size >> 16) & 0xFF;
    entry[11] = (size >> 24) & 0xFF;

    const offset = 6 + 16;
    entry[12] = offset & 0xFF;
    entry[13] = (offset >> 8)  & 0xFF;
    entry[14] = (offset >> 16) & 0xFF;
    entry[15] = (offset >> 24) & 0xFF;

    const out = new Uint8Array(offset + size);
    let pos = 0;
    out.set(header, pos); pos += header.length;
    out.set(entry,  pos); pos += entry.length;
    out.set(pngBytes, pos);

    return out.buffer;
  }

  // Build ICO with multiple PNG image entries (multi-layer)
  function pngsToMultiIco(pngArrayBuffers) {
    const pngBytesArr = pngArrayBuffers.map(buf => new Uint8Array(buf));
    const count       = pngBytesArr.length;
    const headerSize  = 6;
    const entrySize   = 16;
    const dirSize     = headerSize + count * entrySize;

    let totalDataSize = 0;
    for (const b of pngBytesArr) totalDataSize += b.length;

    const out = new Uint8Array(dirSize + totalDataSize);

    // ICO header
    out[0] = 0; out[1] = 0;                                    // reserved
    out[2] = 1; out[3] = 0;                                    // type = ICO
    out[4] = count & 0xFF; out[5] = (count >> 8) & 0xFF;       // image count

    let dataOffset = dirSize;
    let pos        = headerSize;

    for (let i = 0; i < count; i++) {
      const bytes = pngBytesArr[i];
      const w     = readUInt32BE(bytes, 16);
      const h     = readUInt32BE(bytes, 20);
      const sz    = bytes.length;

      out[pos + 0]  = w  >= 256 ? 0 : w;
      out[pos + 1]  = h  >= 256 ? 0 : h;
      out[pos + 2]  = 0;   // color count (0 = PNG)
      out[pos + 3]  = 0;   // reserved
      out[pos + 4]  = 1; out[pos + 5] = 0;  // color planes
      out[pos + 6]  = 32; out[pos + 7] = 0; // bits per pixel

      // byte-size of image data (little-endian dword)
      out[pos + 8]  = sz & 0xFF;
      out[pos + 9]  = (sz >> 8)  & 0xFF;
      out[pos + 10] = (sz >> 16) & 0xFF;
      out[pos + 11] = (sz >> 24) & 0xFF;

      // offset of image data in file (little-endian dword)
      out[pos + 12] = dataOffset & 0xFF;
      out[pos + 13] = (dataOffset >> 8)  & 0xFF;
      out[pos + 14] = (dataOffset >> 16) & 0xFF;
      out[pos + 15] = (dataOffset >> 24) & 0xFF;

      dataOffset += sz;
      pos        += entrySize;
    }

    // Write all PNG image data after the directory
    for (const bytes of pngBytesArr) {
      out.set(bytes, pos);
      pos += bytes.length;
    }

    return out.buffer;
  }

  function readUInt32BE(u8, idx) {
    return (u8[idx] << 24) | (u8[idx+1] << 16) | (u8[idx+2] << 8) | (u8[idx+3]);
  }

  function readUInt16LE(u8, idx) {
    return u8[idx] | (u8[idx+1] << 8);
  }

  function readUInt32LE(u8, idx) {
    return ((u8[idx] | (u8[idx+1] << 8) | (u8[idx+2] << 16) | (u8[idx+3] << 24)) >>> 0);
  }
});
