document.addEventListener('DOMContentLoaded', () => {
  const sizes = [16, 32, 64, 96, 128, 192, 256, 512];
  const input = document.getElementById('source-file');
  const btn = document.getElementById('generate-btn');
  const results = document.getElementById('results');
  const downloadZipBtn = document.getElementById('download-zip-btn');

  // We'll store all generated blobs here to zip later
  let allFiles = [];

  btn.addEventListener('click', async () => {
    results.innerHTML = '';
    allFiles = [];
    downloadZipBtn.style.display = 'none';

    if (!input.files || !input.files.length) {
      alert('Please select a source image (PNG or JPG).');
      return;
    }

    const file = input.files[0];
    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'image';

    // Load source image
    const img = await loadImageFromFile(file);

    for (const size of sizes) {
      try {
        const pngBlob = await resizeImageToPNG(img, size, size);
        const pngBuf = await blobToArrayBuffer(pngBlob);
        const icoBuf = pngToSingleIco(pngBuf);
        const icoBlob = new Blob([icoBuf], { type: 'image/x-icon' });

        const pngUrl = URL.createObjectURL(pngBlob);
        const icoUrl = URL.createObjectURL(icoBlob);

        // Save blobs for zip
        allFiles.push({
          pngName: `png/${baseName}-${size}.png`,
          pngBlob,
          icoName: `ico/${baseName}-${size}.ico`,
          icoBlob
        });

        // Build UI card
        const card = document.createElement('div');
        card.className = 'preview-card';
        card.innerHTML = `
          <div class="preview-size">${size} × ${size}</div>
          <img class="preview-img" src="${pngUrl}" alt="${size}x${size} preview" />
        `;

        const actions = document.createElement('div');
        actions.className = 'action-row';

        // Download ICO link
        const dlIco = document.createElement('a');
        dlIco.href = icoUrl;
        dlIco.download = `${baseName}-${size}.ico`;
        dlIco.className = 'action-btn';
        dlIco.textContent = 'Download .ico';

        // Download PNG link
        const dlPng = document.createElement('a');
        dlPng.href = pngUrl;
        dlPng.download = `${baseName}-${size}.png`;
        dlPng.className = 'action-btn';
        dlPng.textContent = 'Download PNG';

        // Open PNG link (for mobile)
        const openPng = document.createElement('a');
        openPng.href = pngUrl;
        openPng.target = '_blank';
        openPng.rel = 'noopener';
        openPng.className = 'action-btn secondary';
        openPng.textContent = 'Open PNG';

        actions.appendChild(dlIco);
        actions.appendChild(dlPng);
        actions.appendChild(openPng);

        card.appendChild(actions);

        const note = document.createElement('div');
        note.className = 'small-note';
        note.textContent = 'iPhone: tap "Open PNG" → long-press the image → Save Image to Photos.';
        card.appendChild(note);

        results.appendChild(card);

      } catch (err) {
        const errCard = document.createElement('div');
        errCard.className = 'preview-card';
        errCard.textContent = `Error creating size ${size}: ${err.message || err}`;
        results.appendChild(errCard);
        console.error(err);
      }
    }

    if(allFiles.length) {
      downloadZipBtn.style.display = 'inline-block';
    }
  });

  // ZIP download handler
  downloadZipBtn.addEventListener('click', async () => {
    if (!allFiles.length) return;

    downloadZipBtn.disabled = true;
    downloadZipBtn.textContent = 'Preparing ZIP...';

    try {
      const zip = new JSZip();

      // folders
      const pngFolder = zip.folder('png');
      const icoFolder = zip.folder('ico');

      for (const f of allFiles) {
        pngFolder.file(f.pngName.replace(/^png\//, ''), f.pngBlob);
        icoFolder.file(f.icoName.replace(/^ico\//, ''), f.icoBlob);
      }

      const content = await zip.generateAsync({ type: 'blob' });

      const baseName = (input.files[0]?.name.replace(/\.[^/.]+$/, '') || 'image');
      const zipName = `${baseName}-icons.zip`;

      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      alert('Error creating ZIP: ' + e.message);
      console.error(e);
    } finally {
      downloadZipBtn.disabled = false;
      downloadZipBtn.textContent = 'Download All PNG + ICO as ZIP';
    }
  });

  // Helpers ---------------------------------------------------

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not load image'));
      };
      img.src = url;
    });
  }

  function resizeImageToPNG(img, w, h) {
    return new Promise(async (resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        if (window.pica) {
          await pica().resize(img, canvas, {
            unsharpAmount: 80,
            unsharpRadius: 0.6,
            unsharpThreshold: 2
          });
          const blob = await pica().toBlob(canvas, 'image/png', 0.92);
          resolve(blob);
        } else {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(b => resolve(b), 'image/png', 0.92);
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  function blobToArrayBuffer(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsArrayBuffer(blob);
    });
  }

  // Build ICO with single PNG image (PNG-compressed ICO entry)
  function pngToSingleIco(pngArrayBuffer) {
    const pngBytes = new Uint8Array(pngArrayBuffer);
    const size = pngBytes.length;

    if (pngBytes[0] !== 0x89 || pngBytes[1] !== 0x50 || pngBytes[2] !== 0x4E || pngBytes[3] !== 0x47) {
      throw new Error('Not a PNG file.');
    }

    const width = readUInt32BE(pngBytes, 16);
    const height = readUInt32BE(pngBytes, 20);

    const header = new Uint8Array(6);
    header[0] = 0; header[1] = 0;
    header[2] = 1; header[3] = 0;
    header[4] = 1; header[5] = 0;

    const entry = new Uint8Array(16);
    entry[0] = width >= 256 ? 0 : width;
    entry[1] = height >= 256 ? 0 : height;
    entry[2] = 0; entry[3] = 0;
    entry[4] = 1; entry[5] = 0;
    entry[6] = 32; entry[7] = 0;

    entry[8]  = size & 0xFF;
    entry[9]  = (size >> 8) & 0xFF;
    entry[10] = (size >> 16) & 0xFF;
    entry[11] = (size >> 24) & 0xFF;

    const offset = 6 + 16;
    entry[12] = offset & 0xFF;
    entry[13] = (offset >> 8) & 0xFF;
    entry[14] = (offset >> 16) & 0xFF;
    entry[15] = (offset >> 24) & 0xFF;

    const out = new Uint8Array(offset + size);
    let pos = 0;
    out.set(header, pos); pos += header.length;
    out.set(entry, pos); pos += entry.length;
    out.set(pngBytes, pos);

    return out.buffer;
  }

  function readUInt32BE(u8, idx) {
    return (u8[idx] << 24) | (u8[idx+1] << 16) | (u8[idx+2] << 8) | (u8[idx+3]);
  }
});
