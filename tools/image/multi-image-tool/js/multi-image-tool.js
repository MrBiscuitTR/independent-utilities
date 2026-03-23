/* multi-image-tool.js */
'use strict';

(function () {

  /* ── State ───────────────────────────────────────────────────────── */
  let currentMode = 'compress';
  let uploadedFiles = [];
  let results = [];
  let watermarkImg = null;

  // Meme state
  let memeTexts = [
    { id: 1, text: 'TOP TEXT', x: 0.5, y: 0.1 },
    { id: 2, text: 'BOTTOM TEXT', x: 0.5, y: 0.9 }
  ];
  let memeTextIdCounter = 2;

  // Watermark state
  let watermarks = [{ id: 1, x: 0.8, y: 0.9 }];
  let watermarkIdCounter = 1;

  // Blur regions
  let blurRegions = [];
  let blurRegionIdCounter = 0;
  let isDrawingBlur = false;
  let blurDrawStart = null;

  // Editor state
  let editorLayers = [];
  let editorLayerIdCounter = 0;
  let selectedLayerId = null;
  let editorTool = 'select';
  let isDrawing = false;
  let drawStart = null;
  let currentDrawing = null;
  let editorDrawings = []; // Store brush strokes, shapes, text
  let resizeHandle = null; // 'tl', 'tr', 'bl', 'br' for corners

  // Metadata state
  let fileMetadata = new Map();

  // Python preview state
  let pythonPreviewImg = null;

  const modeDescriptions = {
    'compress': 'Compress JPG, PNG, and WebP images while maintaining quality.',
    'to-svg': 'Convert raster images to scalable vector graphics (SVG).',
    'to-jpg': 'Convert PNG, GIF, WebP, SVG, HEIC, HEIF, BMP, TIFF to JPG.',
    'from-jpg': 'Convert images to PNG, WebP, or create animated GIFs from multiple images.',
    'meme': 'Add text overlays to create memes. Drag handles to reposition.',
    'watermark': 'Add text or image watermarks. Drag to position freely.',
    'remove-bg': 'Remove solid color backgrounds from images.',
    'metadata': 'View and strip EXIF, GPS, camera info from images.',
    'blur-face': 'Draw regions to blur faces, plates, or sensitive info.',
    'upscale': 'Enlarge images using interpolation.',
    'editor': 'Basic photo editor: draw, add images, rotate, resize layers.',
    'html-to-img': 'Capture webpage screenshot.',
    'python-helper': 'Generate Python code for image processing with preview.'
  };

  /* ── DOM refs ────────────────────────────────────────────────────── */
  const modeTabs = document.querySelectorAll('.mode-tab');
  const modeDescription = document.getElementById('mode-description');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const uploadPreview = document.getElementById('upload-preview');
  const uploadThumbs = document.getElementById('upload-thumbs');
  const uploadCount = document.getElementById('upload-count');
  const btnClearUploads = document.getElementById('btn-clear-uploads');
  const btnProcess = document.getElementById('btn-process');
  const processRow = document.getElementById('process-row');
  const resultsSection = document.getElementById('results-section');
  const resultsGrid = document.getElementById('results-grid');
  const resultsStats = document.getElementById('results-stats');
  const btnDownloadZip = document.getElementById('btn-download-zip');
  const previewArea = document.getElementById('preview-area');
  const previewContainer = document.getElementById('preview-container');
  const previewCanvas = document.getElementById('preview-canvas');
  const previewHint = document.getElementById('preview-hint');
  const memeHandles = document.getElementById('meme-handles');
  const watermarkHandles = document.getElementById('watermark-handles');
  const blurOverlay = document.getElementById('blur-overlay');
  const editorLayersContainer = document.getElementById('editor-layers-container');

  /* ── Mode switching ──────────────────────────────────────────────── */
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      currentMode = tab.dataset.mode;
      modeDescription.textContent = modeDescriptions[currentMode] || '';
      updateUIForMode();
    });
  });

  function updateUIForMode() {
    document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none');
    const panel = document.getElementById('settings-' + currentMode);
    if (panel) panel.style.display = '';

    const noUploadModes = ['html-to-img'];
    dropZone.style.display = noUploadModes.includes(currentMode) ? 'none' : '';
    uploadPreview.style.display = noUploadModes.includes(currentMode) ? 'none' : (uploadedFiles.length ? '' : 'none');

    const noProcessModes = ['html-to-img', 'python-helper'];
    processRow.style.display = noProcessModes.includes(currentMode) ? 'none' : '';

    const previewModes = ['meme', 'watermark', 'blur-face', 'editor'];
    if (previewModes.includes(currentMode) && uploadedFiles.length > 0) {
      showPreview();
    } else {
      previewArea.style.display = 'none';
    }

    // Reset overlays
    memeHandles.innerHTML = '';
    watermarkHandles.innerHTML = '';
    blurOverlay.innerHTML = '';
    editorLayersContainer.innerHTML = '';

    memeHandles.style.display = currentMode === 'meme' ? '' : 'none';
    watermarkHandles.style.display = currentMode === 'watermark' ? '' : 'none';
    blurOverlay.style.display = currentMode === 'blur-face' ? '' : 'none';
    editorLayersContainer.style.display = currentMode === 'editor' ? '' : 'none';

    if (currentMode === 'blur-face') setupBlurDrawing();
    if (currentMode === 'editor') setupEditor();
    if (currentMode === 'metadata' && uploadedFiles.length) showMetadata();

    updateProcessButton();
  }

  function updateProcessButton() {
    const noProcessModes = ['html-to-img', 'python-helper'];
    btnProcess.disabled = noProcessModes.includes(currentMode) || uploadedFiles.length === 0;
  }

  /* ── File handling ──────────────────────────────────────────────── */
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = '';
  });

  btnClearUploads.addEventListener('click', () => {
    uploadedFiles = [];
    fileMetadata.clear();
    renderUploadThumbs();
    updateProcessButton();
    previewArea.style.display = 'none';
    resultsSection.style.display = 'none';
    editorLayers = [];
    editorDrawings = [];
    selectedLayerId = null;
  });

  async function handleFiles(files) {
    const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'tif', 'heic', 'heif'];

    for (const file of files) {
      const ext = getExtension(file.name);
      if (file.type.startsWith('image/') || validExtensions.includes(ext)) {
        uploadedFiles.push(file);
        if (currentMode === 'metadata') {
          await readFileMetadata(file);
        }
      }
    }

    renderUploadThumbs();
    updateProcessButton();

    const previewModes = ['meme', 'watermark', 'blur-face', 'editor'];
    if (previewModes.includes(currentMode) && uploadedFiles.length > 0) {
      showPreview();
    }

    if (currentMode === 'metadata') {
      showMetadata();
    }
  }

  /* ── Metadata Reading ───────────────────────────────────────────── */
  async function readFileMetadata(file) {
    const metadata = {
      fileName: file.name,
      fileSize: formatBytes(file.size),
      fileType: file.type || 'unknown',
      lastModified: new Date(file.lastModified).toLocaleString()
    };

    try {
      // Use exifr library for comprehensive EXIF extraction
      if (typeof exifr !== 'undefined') {
        let exifData = {};
        try {
          // Try to read all possible EXIF data
          exifData = await exifr.parse(file) || {};
        } catch (e) {
          console.warn('exifr parsing failed:', e);
        }

        // Map of all possible fields with friendly names
        const fieldMappings = {
          // Camera/Device Info
          'Make': 'Camera Make',
          'Model': 'Camera Model',
          'Software': 'Software',
          'LensModel': 'Lens Model',
          'LensMake': 'Lens Make',
          'LensInfo': 'Lens Info',
          'LensSpecification': 'Lens Specification',
          'BodySerialNumber': 'Body Serial Number',
          'LensSerialNumber': 'Lens Serial Number',
          'CameraSerialNumber': 'Camera Serial Number',
          'InternalSerialNumber': 'Internal Serial Number',

          // Date/Time
          'DateTime': 'Date/Time',
          'DateTimeOriginal': 'Date Taken',
          'DateTimeDigitized': 'Date Digitized',
          'SubSecTimeOriginal': 'Subsecond Time',

          // GPS
          'latitude': 'GPS Latitude',
          'longitude': 'GPS Longitude',
          'altitude': 'GPS Altitude',
          'GPSLatitude': 'GPS Latitude',
          'GPSLongitude': 'GPS Longitude',
          'GPSAltitude': 'GPS Altitude',
          'GPSLatitudeRef': 'GPS Lat Ref',
          'GPSLongitudeRef': 'GPS Long Ref',
          'GPSAltitudeRef': 'GPS Alt Ref',
          'GPSTimeStamp': 'GPS Time',
          'GPSDateStamp': 'GPS Date',
          'GPSInfo': 'GPS Info',
          'GPSVersionID': 'GPS Version',
          'GPSMapDatum': 'GPS Map Datum',

          // Image Settings
          'ExposureTime': 'Exposure Time',
          'FNumber': 'F-Number',
          'ISOSpeedRatings': 'ISO Speed',
          'FocalLength': 'Focal Length',
          'FocalLengthIn35mmFilm': 'Focal Length (35mm)',
          'ExposureProgram': 'Exposure Program',
          'MeteringMode': 'Metering Mode',
          'Flash': 'Flash',
          'WhiteBalance': 'White Balance',
          'Brightness': 'Brightness',
          'Contrast': 'Contrast',
          'Saturation': 'Saturation',
          'Sharpness': 'Sharpness',

          // Image Dimensions
          'ImageWidth': 'Image Width',
          'ImageLength': 'Image Height',
          'PixelXDimension': 'Width',
          'PixelYDimension': 'Height',
          'Orientation': 'Orientation',
          'ResolutionUnit': 'Resolution Unit',
          'XResolution': 'X Resolution',
          'YResolution': 'Y Resolution',

          // Copyright/Author
          'Artist': 'Artist/Author',
          'Copyright': 'Copyright',
          'ImageDescription': 'Description',
          'UserComment': 'User Comment',
          'Creator': 'Creator',

          // Other
          'ColorSpace': 'Color Space',
          'ColorArea': 'Color Area',
          'ExifVersion': 'EXIF Version',
          'ProcessingSoftware': 'Processing Software',
          'FlashEnergy': 'Flash Energy',
          'SpatialFrequencyResponse': 'Spatial Frequency',
          'FileSource': 'File Source',
          'SceneType': 'Scene Type',
          'CustomRendered': 'Custom Rendered'
        };

        // Extract and format metadata
        for (const [key, label] of Object.entries(fieldMappings)) {
          if (exifData[key] !== undefined && exifData[key] !== null) {
            let value = exifData[key];

            // Format GPS coordinates if they're numbers or arrays
            if ((key === 'latitude' || key === 'longitude' || key === 'altitude') && typeof value === 'number') {
              value = value.toFixed(6) + '°';
            } else if ((key === 'GPSLatitude' || key === 'GPSLongitude') && Array.isArray(value)) {
              value = `${value[0]?.toFixed(0) || value[0]}° ${value[1]?.toFixed(0) || value[1]}' ${(value[2] || 0).toFixed(2)}"`;
            } else if (key === 'GPSAltitude' && typeof value === 'number') {
              value = value.toFixed(2) + ' m';
            }

            // Format arrays/objects
            if (Array.isArray(value)) {
              value = value.map(v => {
                if (typeof v === 'object' && v !== null) return JSON.stringify(v);
                return v;
              }).join(', ');
            } else if (typeof value === 'object' && value !== null) {
              value = JSON.stringify(value);
            }

            metadata[label] = String(value).substring(0, 500); // Limit value length
          }
        }
      } else {
        // Fallback to EXIF.js if exifr not available
        const img = new Image();
        img.onload = function() {
          if (typeof EXIF !== 'undefined') {
            EXIF.getData(img, function() {
              const allTags = EXIF.getAllTags(this);
              const importantFields = {
                'Make': 'Camera Make', 'Model': 'Camera Model', 'Software': 'Software',
                'LensModel': 'Lens Model', 'BodySerialNumber': 'Serial Number',
                'DateTime': 'Date/Time', 'DateTimeOriginal': 'Date Taken',
                'GPSLatitude': 'GPS Latitude', 'GPSLongitude': 'GPS Longitude',
                'GPSAltitude': 'GPS Altitude', 'ExposureTime': 'Exposure Time',
                'FNumber': 'F-Number', 'ISOSpeedRatings': 'ISO', 'FocalLength': 'Focal Length',
                'Artist': 'Artist/Author', 'Copyright': 'Copyright'
              };

              for (const [tag, label] of Object.entries(importantFields)) {
                if (allTags[tag] !== undefined) {
                  let value = allTags[tag];
                  if (Array.isArray(value)) value = value.join(', ');
                  metadata[label] = value;
                }
              }
              fileMetadata.set(file.name, metadata);
            });
          } else {
            fileMetadata.set(file.name, metadata);
          }
        };
        img.onerror = () => fileMetadata.set(file.name, metadata);
        img.src = URL.createObjectURL(file);
        return;
      }
    } catch (err) {
      console.warn('Metadata extraction error:', err);
    }

    fileMetadata.set(file.name, metadata);
  }

  function showMetadata() {
    const display = document.getElementById('metadata-display');
    const list = document.getElementById('metadata-list');
    if (!display || !list) return;

    if (fileMetadata.size === 0 && uploadedFiles.length > 0) {
      Promise.all(uploadedFiles.map(f => readFileMetadata(f))).then(renderMetadataList);
    } else {
      renderMetadataList();
    }
  }

  function renderMetadataList() {
    const display = document.getElementById('metadata-display');
    const list = document.getElementById('metadata-list');
    if (!display || !list) return;

    if (fileMetadata.size === 0) {
      display.style.display = 'none';
      return;
    }

    display.style.display = '';
    list.innerHTML = '';

    fileMetadata.forEach((meta, fileName) => {
      const item = document.createElement('div');
      item.className = 'metadata-item';

      const name = document.createElement('div');
      name.className = 'metadata-item-name';
      name.textContent = fileName;

      const data = document.createElement('div');
      data.className = 'metadata-item-data';

      const lines = [];
      const sensitiveFields = [
        'GPS Latitude', 'GPS Longitude', 'GPS Altitude',
        'Serial Number', 'Lens Serial Number', 'Camera Serial Number', 'Body Serial Number', 'Internal Serial Number',
        'Artist/Author', 'Copyright', 'Creator'
      ];

      for (const [key, value] of Object.entries(meta)) {
        if (key === 'fileName') continue;
        const isSensitive = sensitiveFields.some(f => key.includes(f) || key.includes('GPS'));
        const prefix = isSensitive ? '⚠️ ' : '';
        lines.push(`${prefix}${key}: ${value}`);
      }

      if (lines.length === 0) {
        data.textContent = 'No metadata found';
      } else {
        data.textContent = lines.join('\n');
      }

      item.appendChild(name);
      item.appendChild(data);
      list.appendChild(item);
    });
  }

  function renderUploadThumbs() {
    uploadThumbs.innerHTML = '';

    if (uploadedFiles.length === 0) {
      uploadPreview.style.display = 'none';
      return;
    }

    uploadPreview.style.display = '';
    uploadCount.textContent = `${uploadedFiles.length} image${uploadedFiles.length > 1 ? 's' : ''} selected`;

    uploadedFiles.forEach((file, idx) => {
      const thumb = document.createElement('div');
      thumb.className = 'upload-thumb';

      const img = document.createElement('img');
      const ext = getExtension(file.name);
      if (ext === 'heic' || ext === 'heif') {
        img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="50" x="50" text-anchor="middle" font-size="14">HEIC</text></svg>';
        convertHeicToBlob(file).then(blob => { img.src = URL.createObjectURL(blob); }).catch(() => {});
      } else {
        img.src = URL.createObjectURL(file);
      }
      img.alt = file.name;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'upload-thumb-remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        uploadedFiles.splice(idx, 1);
        fileMetadata.delete(file.name);
        renderUploadThumbs();
        updateProcessButton();
        if (currentMode === 'metadata') showMetadata();
        if (uploadedFiles.length === 0) previewArea.style.display = 'none';
        else if (['meme', 'watermark', 'blur-face', 'editor'].includes(currentMode)) showPreview();
      });

      const nameSpan = document.createElement('span');
      nameSpan.className = 'upload-thumb-name';
      nameSpan.textContent = file.name;

      thumb.appendChild(img);
      thumb.appendChild(removeBtn);
      thumb.appendChild(nameSpan);
      uploadThumbs.appendChild(thumb);
    });
  }

  /* ── Utility functions ──────────────────────────────────────────── */
  function getExtension(name) {
    return (name.split('.').pop() || '').toLowerCase();
  }

  function getBaseName(name) {
    return name.replace(/\.[^.]+$/, '');
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function convertHeicToBlob(file) {
    if (typeof heic2any === 'undefined') throw new Error('heic2any not loaded');
    const blob = await heic2any({ blob: file, toType: 'image/png' });
    return Array.isArray(blob) ? blob[0] : blob;
  }

  async function loadImageAsCanvas(file) {
    return new Promise(async (resolve, reject) => {
      try {
        let blob = file;
        const ext = getExtension(file.name);
        if (ext === 'heic' || ext === 'heif') {
          blob = await convertHeicToBlob(file);
        }

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve({ canvas, ctx, width: img.width, height: img.height, img });
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
      } catch (err) {
        reject(err);
      }
    });
  }

  function canvasToBlob(canvas, type = 'image/png', quality = 0.92) {
    return new Promise(resolve => {
      canvas.toBlob(resolve, type, quality);
    });
  }

  /* ── Preview area ───────────────────────────────────────────────── */
  async function showPreview() {
    if (uploadedFiles.length === 0) {
      previewArea.style.display = 'none';
      return;
    }

    previewArea.style.display = '';
    const file = uploadedFiles[0];

    try {
      const { canvas, width, height } = await loadImageAsCanvas(file);

      const maxW = previewContainer.clientWidth - 20;
      const maxH = 600;
      let scale = Math.min(maxW / width, maxH / height, 1);

      previewCanvas.width = Math.round(width * scale);
      previewCanvas.height = Math.round(height * scale);
      previewCanvas._originalCanvas = canvas;
      previewCanvas._originalWidth = width;
      previewCanvas._originalHeight = height;
      previewCanvas._scale = scale;

      const ctx = previewCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);

      if (currentMode === 'meme') {
        previewHint.textContent = 'Drag text labels below to reposition';
        initMemeUI();
        updateMemePreview();
      } else if (currentMode === 'watermark') {
        previewHint.textContent = 'Select "Free" position and drag handles';
        updateWatermarkPreview();
      } else if (currentMode === 'blur-face') {
        previewHint.textContent = 'Draw rectangles on areas to blur';
        setupBlurDrawing();
      } else if (currentMode === 'editor') {
        previewHint.textContent = 'Use tools to draw or add images';
        setupEditor();
        renderEditorCanvas();
      } else {
        previewHint.textContent = '';
      }
    } catch (err) {
      console.error('Preview failed:', err);
    }
  }

  /* ── Meme ───────────────────────────────────────────────────────── */
  function initMemeUI() {
    const container = document.getElementById('meme-text-fields');
    if (!container) return;

    container.innerHTML = '';
    memeTexts.forEach(t => addMemeTextFieldUI(t));
  }

  function addMemeTextFieldUI(t) {
    const container = document.getElementById('meme-text-fields');
    const row = document.createElement('div');
    row.className = 'meme-text-row';
    row.dataset.id = t.id;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = t.text;
    input.placeholder = 'Enter text...';
    input.addEventListener('input', () => {
      t.text = input.value;
      updateMemePreview();
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-text-btn';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      memeTexts = memeTexts.filter(mt => mt.id !== t.id);
      row.remove();
      updateMemePreview();
    });

    row.appendChild(input);
    row.appendChild(removeBtn);
    container.appendChild(row);
  }

  document.getElementById('btn-add-meme-text')?.addEventListener('click', () => {
    memeTextIdCounter++;
    const newText = { id: memeTextIdCounter, text: 'NEW TEXT', x: 0.5, y: 0.5 };
    memeTexts.push(newText);
    addMemeTextFieldUI(newText);
    updateMemePreview();
  });

  ['meme-font', 'meme-font-size', 'meme-text-color', 'meme-stroke-color', 'meme-stroke-width', 'meme-text-bg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateMemePreview);
      el.addEventListener('change', updateMemePreview);
    }
  });

  const memeFontSize = document.getElementById('meme-font-size');
  const memeFontSizeVal = document.getElementById('meme-font-size-val');
  memeFontSize?.addEventListener('input', () => { memeFontSizeVal.textContent = memeFontSize.value + 'px'; });

  const memeStrokeWidth = document.getElementById('meme-stroke-width');
  const memeStrokeWidthVal = document.getElementById('meme-stroke-width-val');
  memeStrokeWidth?.addEventListener('input', () => { memeStrokeWidthVal.textContent = memeStrokeWidth.value + 'px'; });

  function updateMemePreview() {
    if (currentMode !== 'meme' || !previewCanvas._originalCanvas) return;

    const original = previewCanvas._originalCanvas;
    const scale = previewCanvas._scale;
    const originalWidth = previewCanvas._originalWidth;
    const ctx = previewCanvas.getContext('2d');

    // Clear and redraw original
    ctx.drawImage(original, 0, 0, previewCanvas.width, previewCanvas.height);

    const font = document.getElementById('meme-font')?.value || 'Impact';
    const fontSize = parseInt(document.getElementById('meme-font-size')?.value || 48);
    const textColor = document.getElementById('meme-text-color')?.value || '#ffffff';
    const strokeColor = document.getElementById('meme-stroke-color')?.value || '#000000';
    const strokeWidth = parseInt(document.getElementById('meme-stroke-width')?.value || 3);
    const useBg = document.getElementById('meme-text-bg')?.checked || false;

    // Use same scaling formula as processMeme: fontSize * (width / 500)
    // But scale it down for preview: * scale
    const scaledFontSize = Math.round(fontSize * (originalWidth / 500) * scale);
    const scaledStrokeWidth = strokeWidth * (originalWidth / 500) * scale;

    ctx.font = `bold ${scaledFontSize}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = scaledStrokeWidth;
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = textColor;

    // Draw text on canvas
    memeTexts.forEach(t => {
      if (!t.text) return;
      const x = previewCanvas.width * t.x;
      const y = previewCanvas.height * t.y;

      if (useBg) {
        const metrics = ctx.measureText(t.text.toUpperCase());
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x - metrics.width / 2 - 8, y - scaledFontSize / 2 - 4, metrics.width + 16, scaledFontSize + 8);
        ctx.fillStyle = textColor;
      }

      if (strokeWidth > 0) {
        ctx.strokeText(t.text.toUpperCase(), x, y);
      }
      ctx.fillText(t.text.toUpperCase(), x, y);
    });

    // Update draggable handles - positioned relative to canvas
    updateMemeHandles();
  }

  function updateMemeHandles() {
    memeHandles.innerHTML = '';
    if (!previewCanvas._originalCanvas) return;

    // Position handles container to match canvas
    const canvasRect = previewCanvas.getBoundingClientRect();
    const containerRect = previewContainer.getBoundingClientRect();

    memeHandles.style.position = 'absolute';
    memeHandles.style.left = (canvasRect.left - containerRect.left) + 'px';
    memeHandles.style.top = (canvasRect.top - containerRect.top) + 'px';
    memeHandles.style.width = previewCanvas.width + 'px';
    memeHandles.style.height = previewCanvas.height + 'px';

    memeTexts.forEach(t => {
      const handle = document.createElement('div');
      handle.className = 'meme-handle';
      handle.textContent = t.text || '(empty)';
      handle.style.left = (t.x * 100) + '%';
      handle.style.top = (t.y * 100) + '%';
      handle.style.transform = 'translate(-50%, -50%)';
      handle.style.position = 'absolute';

      makeDraggable(handle, (dx, dy) => {
        t.x = Math.max(0.05, Math.min(0.95, t.x + dx / previewCanvas.width));
        t.y = Math.max(0.05, Math.min(0.95, t.y + dy / previewCanvas.height));
        updateMemePreview();
      });

      memeHandles.appendChild(handle);
    });
  }

  /* ── Watermark ───────────────────────────────────────────────────── */
  document.getElementById('btn-add-watermark')?.addEventListener('click', () => {
    watermarkIdCounter++;
    watermarks.push({ id: watermarkIdCounter, x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6 });
    updateWatermarkPreview();
  });

  ['watermark-type', 'watermark-text', 'watermark-font-size', 'watermark-color', 'watermark-opacity', 'watermark-position', 'watermark-img-size'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateWatermarkPreview);
      el.addEventListener('change', updateWatermarkPreview);
    }
  });

  const watermarkType = document.getElementById('watermark-type');
  watermarkType?.addEventListener('change', () => {
    document.querySelector('.watermark-text-settings').style.display = watermarkType.value === 'text' ? '' : 'none';
    document.querySelector('.watermark-image-settings').style.display = watermarkType.value === 'image' ? '' : 'none';
  });

  const watermarkFontSize = document.getElementById('watermark-font-size');
  const watermarkFontSizeVal = document.getElementById('watermark-font-size-val');
  watermarkFontSize?.addEventListener('input', () => { watermarkFontSizeVal.textContent = watermarkFontSize.value + 'px'; });

  const watermarkImgSize = document.getElementById('watermark-img-size');
  const watermarkImgSizeVal = document.getElementById('watermark-img-size-val');
  watermarkImgSize?.addEventListener('input', () => { watermarkImgSizeVal.textContent = watermarkImgSize.value + '%'; });

  const watermarkOpacity = document.getElementById('watermark-opacity');
  const watermarkOpacityVal = document.getElementById('watermark-opacity-val');
  watermarkOpacity?.addEventListener('input', () => { watermarkOpacityVal.textContent = watermarkOpacity.value + '%'; });

  const watermarkImageInput = document.getElementById('watermark-image-input');
  watermarkImageInput?.addEventListener('change', () => {
    if (watermarkImageInput.files[0]) {
      const img = new Image();
      img.onload = () => { watermarkImg = img; updateWatermarkPreview(); };
      img.src = URL.createObjectURL(watermarkImageInput.files[0]);
    }
  });

  function updateWatermarkPreview() {
    if (currentMode !== 'watermark' || !previewCanvas._originalCanvas) return;

    const original = previewCanvas._originalCanvas;
    const scale = previewCanvas._scale;
    const ctx = previewCanvas.getContext('2d');

    ctx.drawImage(original, 0, 0, previewCanvas.width, previewCanvas.height);

    const wmType = document.getElementById('watermark-type')?.value || 'text';
    const position = document.getElementById('watermark-position')?.value || 'free';
    const opacity = parseInt(document.getElementById('watermark-opacity')?.value || 50) / 100;

    ctx.globalAlpha = opacity;

    watermarks.forEach(wm => {
      let x, y;
      if (position === 'free') {
        x = wm.x * previewCanvas.width;
        y = wm.y * previewCanvas.height;
      } else {
        [x, y] = getWatermarkPosition(position, previewCanvas.width, previewCanvas.height, 50, 20);
      }

      if (wmType === 'text') {
        const text = document.getElementById('watermark-text')?.value || 'Watermark';
        const fontSize = parseInt(document.getElementById('watermark-font-size')?.value || 32) * scale;
        const color = document.getElementById('watermark-color')?.value || '#ffffff';

        ctx.font = `bold ${fontSize}px Arial`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
      } else if (wmType === 'image' && watermarkImg) {
        const sizePercent = parseInt(document.getElementById('watermark-img-size')?.value || 20) / 100;
        const wmW = previewCanvas.width * sizePercent;
        const wmH = (watermarkImg.height / watermarkImg.width) * wmW;
        ctx.drawImage(watermarkImg, x - wmW / 2, y - wmH / 2, wmW, wmH);
      }
    });

    ctx.globalAlpha = 1;
    updateWatermarkHandles();
  }

  function updateWatermarkHandles() {
    watermarkHandles.innerHTML = '';
    const position = document.getElementById('watermark-position')?.value || 'free';
    if (position !== 'free' || !previewCanvas._originalCanvas) return;

    const canvasRect = previewCanvas.getBoundingClientRect();
    const containerRect = previewContainer.getBoundingClientRect();

    watermarkHandles.style.position = 'absolute';
    watermarkHandles.style.left = (canvasRect.left - containerRect.left) + 'px';
    watermarkHandles.style.top = (canvasRect.top - containerRect.top) + 'px';
    watermarkHandles.style.width = previewCanvas.width + 'px';
    watermarkHandles.style.height = previewCanvas.height + 'px';

    watermarks.forEach(wm => {
      const handle = document.createElement('div');
      handle.className = 'watermark-handle';
      handle.textContent = 'WM';
      handle.style.left = (wm.x * 100) + '%';
      handle.style.top = (wm.y * 100) + '%';
      handle.style.transform = 'translate(-50%, -50%)';
      handle.style.position = 'absolute';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'handle-remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        watermarks = watermarks.filter(w => w.id !== wm.id);
        updateWatermarkPreview();
      });
      handle.appendChild(removeBtn);

      makeDraggable(handle, (dx, dy) => {
        wm.x = Math.max(0.05, Math.min(0.95, wm.x + dx / previewCanvas.width));
        wm.y = Math.max(0.05, Math.min(0.95, wm.y + dy / previewCanvas.height));
        updateWatermarkPreview();
      });

      watermarkHandles.appendChild(handle);
    });
  }

  function getWatermarkPosition(pos, imgW, imgH) {
    const padding = 20;
    switch (pos) {
      case 'top-left': return [padding + 50, padding + 20];
      case 'top-right': return [imgW - padding - 50, padding + 20];
      case 'bottom-left': return [padding + 50, imgH - padding - 20];
      case 'bottom-right': return [imgW - padding - 50, imgH - padding - 20];
      case 'center': return [imgW / 2, imgH / 2];
      default: return [imgW - padding - 50, imgH - padding - 20];
    }
  }

  /* ── Blur face ───────────────────────────────────────────────────── */
  const blurIntensity = document.getElementById('blur-intensity');
  const blurIntensityVal = document.getElementById('blur-intensity-val');
  blurIntensity?.addEventListener('input', () => { blurIntensityVal.textContent = blurIntensity.value + 'px'; });

  document.getElementById('btn-clear-blur-regions')?.addEventListener('click', () => {
    blurRegions = [];
    renderBlurRegions();
  });

  function setupBlurDrawing() {
    renderBlurRegions();

    blurOverlay.onmousedown = (e) => {
      if (e.target !== blurOverlay) return;
      isDrawingBlur = true;
      const rect = previewCanvas.getBoundingClientRect();
      blurDrawStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      blurRegionIdCounter++;
      blurRegions.push({
        id: blurRegionIdCounter,
        x: blurDrawStart.x / previewCanvas.width,
        y: blurDrawStart.y / previewCanvas.height,
        w: 0,
        h: 0
      });
      renderBlurRegions();
    };

    blurOverlay.onmousemove = (e) => {
      if (!isDrawingBlur) return;
      const rect = previewCanvas.getBoundingClientRect();
      const currX = e.clientX - rect.left;
      const currY = e.clientY - rect.top;

      const region = blurRegions[blurRegions.length - 1];
      region.w = (currX - blurDrawStart.x) / previewCanvas.width;
      region.h = (currY - blurDrawStart.y) / previewCanvas.height;
      renderBlurRegions();
    };

    blurOverlay.onmouseup = () => {
      if (!isDrawingBlur) return;
      isDrawingBlur = false;
      const region = blurRegions[blurRegions.length - 1];
      if (Math.abs(region.w) < 0.02 && Math.abs(region.h) < 0.02) {
        blurRegions.pop();
      }
      renderBlurRegions();
    };
  }

  function renderBlurRegions() {
    blurOverlay.innerHTML = '';
    if (!previewCanvas._originalCanvas) return;

    const canvasRect = previewCanvas.getBoundingClientRect();
    const containerRect = previewContainer.getBoundingClientRect();

    blurOverlay.style.position = 'absolute';
    blurOverlay.style.left = (canvasRect.left - containerRect.left) + 'px';
    blurOverlay.style.top = (canvasRect.top - containerRect.top) + 'px';
    blurOverlay.style.width = previewCanvas.width + 'px';
    blurOverlay.style.height = previewCanvas.height + 'px';

    blurRegions.forEach(region => {
      const div = document.createElement('div');
      div.className = 'blur-region';

      let x = region.x * previewCanvas.width;
      let y = region.y * previewCanvas.height;
      let w = region.w * previewCanvas.width;
      let h = region.h * previewCanvas.height;

      if (w < 0) { x += w; w = -w; }
      if (h < 0) { y += h; h = -h; }

      div.style.left = x + 'px';
      div.style.top = y + 'px';
      div.style.width = w + 'px';
      div.style.height = h + 'px';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'region-remove';
      removeBtn.textContent = '×';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        blurRegions = blurRegions.filter(r => r.id !== region.id);
        renderBlurRegions();
      };
      div.appendChild(removeBtn);

      blurOverlay.appendChild(div);
    });
  }

  /* ── Editor ─────────────────────────────────────────────────────── */
  function setupEditor() {
    if (!previewCanvas._originalCanvas) return;

    // Tool buttons
    document.querySelectorAll('.editor-tool-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.editor-tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        editorTool = btn.dataset.tool;
        if (editorTool !== 'select') {
          selectedLayerId = null;
          renderEditorLayersList();
        }
      };
    });

    // Brush size
    const brushSize = document.getElementById('editor-brush-size');
    const brushSizeVal = document.getElementById('editor-brush-size-val');
    brushSize?.addEventListener('input', () => { brushSizeVal.textContent = brushSize.value + 'px'; });

    // Add image layer
    const addImageInput = document.getElementById('editor-add-image');
    if (addImageInput) {
      addImageInput.onchange = async () => {
        if (!addImageInput.files[0]) return;
        try {
          const { img, width, height } = await loadImageAsCanvas(addImageInput.files[0]);
          editorLayerIdCounter++;
          const scale = Math.min(0.4, 150 / Math.max(width, height));
          editorLayers.push({
            id: editorLayerIdCounter,
            type: 'image',
            img,
            x: 0.5,
            y: 0.5,
            width: width * scale,
            height: height * scale,
            rotation: 0,
            name: 'Image ' + editorLayerIdCounter
          });
          selectedLayerId = editorLayerIdCounter;
          renderEditorCanvas();
          renderEditorLayersList();
          addImageInput.value = '';
        } catch (e) {
          console.error('Failed to add image layer:', e);
        }
      };
    }

    // Undo/Redo/Clear
    document.getElementById('btn-editor-undo')?.addEventListener('click', () => {
      if (editorDrawings.length > 0) {
        editorDrawings.pop();
        renderEditorCanvas();
      } else if (editorLayers.length > 0) {
        editorLayers.pop();
        selectedLayerId = null;
        renderEditorCanvas();
        renderEditorLayersList();
      }
    });

    document.getElementById('btn-editor-clear')?.addEventListener('click', () => {
      editorLayers = [];
      editorDrawings = [];
      selectedLayerId = null;
      renderEditorCanvas();
      renderEditorLayersList();
    });

    // Rotation controls
    const rotationSlider = document.getElementById('editor-rotation');
    const rotationVal = document.getElementById('editor-rotation-val');
    const resetRotationBtn = document.getElementById('btn-reset-rotation');

    rotationSlider?.addEventListener('input', () => {
      if (!selectedLayerId) return;
      const layer = editorLayers.find(l => l.id === selectedLayerId);
      if (layer && layer.type === 'image') {
        layer.rotation = parseInt(rotationSlider.value);
        rotationVal.textContent = layer.rotation + '°';
        renderEditorCanvas();
      }
    });

    resetRotationBtn?.addEventListener('click', () => {
      if (!selectedLayerId) return;
      const layer = editorLayers.find(l => l.id === selectedLayerId);
      if (layer && layer.type === 'image') {
        layer.rotation = 0;
        rotationSlider.value = 0;
        rotationVal.textContent = '0°';
        renderEditorCanvas();
      }
    });

    // Canvas events for drawing
    previewCanvas.onmousedown = onEditorCanvasMouseDown;
    previewCanvas.onmousemove = onEditorCanvasMouseMove;
    previewCanvas.onmouseup = onEditorCanvasMouseUp;
    previewCanvas.onmouseleave = onEditorCanvasMouseUp;

    // Touch events for mobile support
    previewCanvas.ontouchstart = onEditorCanvasTouchStart;
    previewCanvas.ontouchmove = onEditorCanvasTouchMove;
    previewCanvas.ontouchend = onEditorCanvasTouchEnd;

    renderEditorLayersList();
  }

  function onEditorCanvasMouseDown(e) {
    if (currentMode !== 'editor') return;

    const rect = previewCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (editorTool === 'select') {
      // First check if clicking on resize handles of selected layer
      if (selectedLayerId) {
        const layer = editorLayers.find(l => l.id === selectedLayerId);
        if (layer && layer.type === 'image') {
          const lx = layer.x * previewCanvas.width;
          const ly = layer.y * previewCanvas.height;
          const lw = layer.width * previewCanvas._scale;
          const lh = layer.height * previewCanvas._scale;
          const handleSize = 12;

          // Check corners for resize handles
          const corners = [
            { name: 'tl', cx: lx - lw/2, cy: ly - lh/2 },
            { name: 'tr', cx: lx + lw/2, cy: ly - lh/2 },
            { name: 'bl', cx: lx - lw/2, cy: ly + lh/2 },
            { name: 'br', cx: lx + lw/2, cy: ly + lh/2 }
          ];

          for (const corner of corners) {
            if (Math.abs(x - corner.cx) < handleSize && Math.abs(y - corner.cy) < handleSize) {
              resizeHandle = corner.name;
              isDrawing = true;
              drawStart = { x, y, layerW: layer.width, layerH: layer.height, layerX: layer.x, layerY: layer.y };
              return;
            }
          }
        }
      }

      // Check if clicking on a layer
      for (let i = editorLayers.length - 1; i >= 0; i--) {
        const layer = editorLayers[i];
        if (layer.type === 'image') {
          const lx = layer.x * previewCanvas.width;
          const ly = layer.y * previewCanvas.height;
          const lw = layer.width * previewCanvas._scale;
          const lh = layer.height * previewCanvas._scale;

          if (x >= lx - lw/2 && x <= lx + lw/2 && y >= ly - lh/2 && y <= ly + lh/2) {
            selectedLayerId = layer.id;
            resizeHandle = null;
            isDrawing = true;
            drawStart = { x, y, layerX: layer.x, layerY: layer.y };
            renderEditorCanvas();
            renderEditorLayersList();
            return;
          }
        }
      }
      selectedLayerId = null;
      resizeHandle = null;
      renderEditorCanvas();
      renderEditorLayersList();
    } else if (editorTool === 'brush' || editorTool === 'eraser') {
      isDrawing = true;
      drawStart = { x, y };
      currentDrawing = {
        type: editorTool,
        color: document.getElementById('editor-color')?.value || '#ff0000',
        size: parseInt(document.getElementById('editor-brush-size')?.value || 5),
        points: [{ x, y }]
      };
    } else if (['line', 'rect', 'ellipse'].includes(editorTool)) {
      isDrawing = true;
      drawStart = { x, y };
      currentDrawing = {
        type: editorTool,
        color: document.getElementById('editor-color')?.value || '#ff0000',
        size: parseInt(document.getElementById('editor-brush-size')?.value || 5),
        x1: x, y1: y, x2: x, y2: y
      };
    } else if (editorTool === 'text') {
      const text = prompt('Enter text:');
      if (text) {
        editorDrawings.push({
          type: 'text',
          text,
          x, y,
          color: document.getElementById('editor-color')?.value || '#ff0000',
          size: parseInt(document.getElementById('editor-brush-size')?.value || 5) * 3
        });
        renderEditorCanvas();
      }
    }
  }

  function onEditorCanvasMouseMove(e) {
    if (!isDrawing || currentMode !== 'editor') return;

    const rect = previewCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (editorTool === 'select' && selectedLayerId && drawStart) {
      const layer = editorLayers.find(l => l.id === selectedLayerId);
      if (layer) {
        if (resizeHandle) {
          // Resizing - calculate new size based on drag
          const dx = (x - drawStart.x) / previewCanvas._scale;
          const dy = (y - drawStart.y) / previewCanvas._scale;

          let newW = drawStart.layerW;
          let newH = drawStart.layerH;

          // Maintain aspect ratio while resizing
          const aspectRatio = drawStart.layerW / drawStart.layerH;

          if (resizeHandle === 'br') {
            newW = Math.max(20, drawStart.layerW + dx);
            newH = newW / aspectRatio;
          } else if (resizeHandle === 'bl') {
            newW = Math.max(20, drawStart.layerW - dx);
            newH = newW / aspectRatio;
          } else if (resizeHandle === 'tr') {
            newW = Math.max(20, drawStart.layerW + dx);
            newH = newW / aspectRatio;
          } else if (resizeHandle === 'tl') {
            newW = Math.max(20, drawStart.layerW - dx);
            newH = newW / aspectRatio;
          }

          layer.width = newW;
          layer.height = newH;
          renderEditorCanvas();
        } else {
          // Moving
          const dx = (x - drawStart.x) / previewCanvas.width;
          const dy = (y - drawStart.y) / previewCanvas.height;
          layer.x = Math.max(0.1, Math.min(0.9, drawStart.layerX + dx));
          layer.y = Math.max(0.1, Math.min(0.9, drawStart.layerY + dy));
          renderEditorCanvas();
        }
      }
    } else if ((editorTool === 'brush' || editorTool === 'eraser') && currentDrawing) {
      currentDrawing.points.push({ x, y });

      // Draw incrementally
      const ctx = previewCanvas.getContext('2d');
      const pts = currentDrawing.points;
      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
        ctx.lineTo(x, y);
        ctx.strokeStyle = editorTool === 'eraser' ? '#ffffff' : currentDrawing.color;
        ctx.lineWidth = currentDrawing.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (editorTool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    } else if (['line', 'rect', 'ellipse'].includes(editorTool) && currentDrawing) {
      currentDrawing.x2 = x;
      currentDrawing.y2 = y;
      renderEditorCanvas();
      drawCurrentShape();
    }
  }

  function onEditorCanvasMouseUp() {
    if (!isDrawing) return;

    if (currentDrawing && (editorTool === 'brush' || editorTool === 'eraser' || ['line', 'rect', 'ellipse'].includes(editorTool))) {
      editorDrawings.push(currentDrawing);
      currentDrawing = null;
    }

    isDrawing = false;
    drawStart = null;
    resizeHandle = null;
    renderEditorCanvas();
  }

  function onEditorCanvasTouchStart(e) {
    if (e.touches.length === 0) return;
    e.preventDefault();

    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true
    });
    previewCanvas.dispatchEvent(mouseEvent);
  }

  function onEditorCanvasTouchMove(e) {
    if (e.touches.length === 0) return;
    e.preventDefault();

    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true
    });
    previewCanvas.dispatchEvent(mouseEvent);
  }

  function onEditorCanvasTouchEnd(e) {
    e.preventDefault();

    const mouseEvent = new MouseEvent('mouseup', {
      bubbles: true
    });
    previewCanvas.dispatchEvent(mouseEvent);
  }

  function drawCurrentShape() {
    if (!currentDrawing) return;

    const ctx = previewCanvas.getContext('2d');
    ctx.strokeStyle = currentDrawing.color;
    ctx.lineWidth = currentDrawing.size;
    ctx.lineCap = 'round';

    const { x1, y1, x2, y2 } = currentDrawing;

    if (currentDrawing.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (currentDrawing.type === 'rect') {
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else if (currentDrawing.type === 'ellipse') {
      ctx.beginPath();
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }

  function renderEditorCanvas() {
    if (!previewCanvas._originalCanvas) return;

    const ctx = previewCanvas.getContext('2d');

    // Draw base image
    ctx.drawImage(previewCanvas._originalCanvas, 0, 0, previewCanvas.width, previewCanvas.height);

    // Draw all layers
    editorLayers.forEach(layer => {
      if (layer.type === 'image' && layer.img) {
        ctx.save();
        const cx = layer.x * previewCanvas.width;
        const cy = layer.y * previewCanvas.height;
        ctx.translate(cx, cy);
        ctx.rotate(layer.rotation * Math.PI / 180);
        const w = layer.width * previewCanvas._scale;
        const h = layer.height * previewCanvas._scale;
        ctx.drawImage(layer.img, -w / 2, -h / 2, w, h);

        // Draw selection border
        if (layer.id === selectedLayerId) {
          ctx.strokeStyle = '#4a90e2';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
          ctx.setLineDash([]);

          // Draw resize handles
          const handleSize = 8;
          ctx.fillStyle = '#4a90e2';
          ctx.fillRect(-w/2 - handleSize/2, -h/2 - handleSize/2, handleSize, handleSize);
          ctx.fillRect(w/2 - handleSize/2, -h/2 - handleSize/2, handleSize, handleSize);
          ctx.fillRect(-w/2 - handleSize/2, h/2 - handleSize/2, handleSize, handleSize);
          ctx.fillRect(w/2 - handleSize/2, h/2 - handleSize/2, handleSize, handleSize);
        }
        ctx.restore();
      }
    });

    // Draw all drawings (brush strokes, shapes, text)
    editorDrawings.forEach(drawing => {
      ctx.strokeStyle = drawing.color;
      ctx.fillStyle = drawing.color;
      ctx.lineWidth = drawing.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (drawing.type === 'brush') {
        if (drawing.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(drawing.points[0].x, drawing.points[0].y);
          for (let i = 1; i < drawing.points.length; i++) {
            ctx.lineTo(drawing.points[i].x, drawing.points[i].y);
          }
          ctx.stroke();
        }
      } else if (drawing.type === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        if (drawing.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(drawing.points[0].x, drawing.points[0].y);
          for (let i = 1; i < drawing.points.length; i++) {
            ctx.lineTo(drawing.points[i].x, drawing.points[i].y);
          }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      } else if (drawing.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(drawing.x1, drawing.y1);
        ctx.lineTo(drawing.x2, drawing.y2);
        ctx.stroke();
      } else if (drawing.type === 'rect') {
        ctx.strokeRect(Math.min(drawing.x1, drawing.x2), Math.min(drawing.y1, drawing.y2),
                      Math.abs(drawing.x2 - drawing.x1), Math.abs(drawing.y2 - drawing.y1));
      } else if (drawing.type === 'ellipse') {
        ctx.beginPath();
        const cx = (drawing.x1 + drawing.x2) / 2;
        const cy = (drawing.y1 + drawing.y2) / 2;
        const rx = Math.abs(drawing.x2 - drawing.x1) / 2;
        const ry = Math.abs(drawing.y2 - drawing.y1) / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (drawing.type === 'text') {
        ctx.font = `${drawing.size}px Arial`;
        ctx.fillText(drawing.text, drawing.x, drawing.y);
      }
    });
  }

  function renderEditorLayersList() {
    const list = document.getElementById('editor-layers-list');
    const layerSettings = document.querySelector('.editor-layer-settings');
    const rotationSlider = document.getElementById('editor-rotation');
    const rotationVal = document.getElementById('editor-rotation-val');

    if (!list) return;

    list.innerHTML = '<div class="layer-item base-layer"><span class="layer-name">Base Image</span></div>';

    // Show/hide rotation controls based on selected layer
    if (selectedLayerId) {
      const selectedLayer = editorLayers.find(l => l.id === selectedLayerId);
      if (selectedLayer && selectedLayer.type === 'image') {
        if (layerSettings) layerSettings.style.display = '';
        if (rotationSlider) {
          rotationSlider.value = selectedLayer.rotation || 0;
          rotationVal.textContent = (selectedLayer.rotation || 0) + '°';
        }
      } else {
        if (layerSettings) layerSettings.style.display = 'none';
      }
    } else {
      if (layerSettings) layerSettings.style.display = 'none';
    }

    editorLayers.forEach(layer => {
      const item = document.createElement('div');
      item.className = 'layer-item' + (layer.id === selectedLayerId ? ' selected' : '');

      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = layer.name || `Layer ${layer.id}`;

      const actions = document.createElement('div');
      actions.className = 'layer-actions';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'layer-btn delete';
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Delete layer';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        editorLayers = editorLayers.filter(l => l.id !== layer.id);
        if (selectedLayerId === layer.id) selectedLayerId = null;
        renderEditorCanvas();
        renderEditorLayersList();
      };

      actions.appendChild(deleteBtn);
      item.appendChild(name);
      item.appendChild(actions);

      item.onclick = () => {
        selectedLayerId = layer.id;
        editorTool = 'select';
        document.querySelectorAll('.editor-tool-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.editor-tool-btn[data-tool="select"]')?.classList.add('active');
        renderEditorCanvas();
        renderEditorLayersList();
      };

      list.appendChild(item);
    });
  }

  /* ── Draggable helper ────────────────────────────────────────────── */
  function makeDraggable(element, onMove) {
    let startX, startY;

    const move = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - startX;
      const dy = clientY - startY;
      startX = clientX;
      startY = clientY;
      onMove(dx, dy);
    };

    const end = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
    };

    const start = (e) => {
      if (e.target.classList.contains('handle-remove')) return;
      e.preventDefault();
      startX = e.touches ? e.touches[0].clientX : e.clientX;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', end);
      document.addEventListener('touchmove', move);
      document.addEventListener('touchend', end);
    };

    element.addEventListener('mousedown', start);
    element.addEventListener('touchstart', start);
  }

  /* ── Process button ──────────────────────────────────────────────── */
  btnProcess.addEventListener('click', async () => {
    if (uploadedFiles.length === 0) return;

    btnProcess.disabled = true;
    btnProcess.textContent = 'Processing...';
    results = [];
    resultsGrid.innerHTML = '';
    resultsSection.style.display = '';

    try {
      switch (currentMode) {
        case 'compress': await processCompress(); break;
        case 'to-svg': await processToSvg(); break;
        case 'to-jpg': await processToJpg(); break;
        case 'from-jpg': await processFromJpg(); break;
        case 'meme': await processMeme(); break;
        case 'watermark': await processWatermark(); break;
        case 'remove-bg': await processRemoveBg(); break;
        case 'metadata': await processMetadata(); break;
        case 'blur-face': await processBlurFace(); break;
        case 'upscale': await processUpscale(); break;
        case 'editor': await processEditor(); break;
      }
      renderResults();
    } catch (err) {
      console.error(err);
      alert('Error processing images: ' + err.message);
    }

    btnProcess.disabled = false;
    btnProcess.textContent = 'Process Images';
  });

  /* ── Process functions ───────────────────────────────────────────── */
  async function processCompress() {
    const quality = parseInt(document.getElementById('compress-quality')?.value || 80) / 100;
    const maxDim = parseInt(document.getElementById('compress-max-size')?.value || 1920);

    for (const file of uploadedFiles) {
      try {
        let blob = file;
        const ext = getExtension(file.name);
        if (ext === 'heic' || ext === 'heif') {
          blob = await convertHeicToBlob(file);
        }

        const compressed = await imageCompression(blob, {
          maxSizeMB: 10,
          maxWidthOrHeight: maxDim,
          useWebWorker: true,
          initialQuality: quality
        });

        const savings = ((file.size - compressed.size) / file.size * 100).toFixed(1);

        results.push({
          name: getBaseName(file.name) + '.jpg',
          originalSize: file.size,
          newSize: compressed.size,
          savings,
          blob: compressed,
          type: 'image'
        });
      } catch (err) {
        console.error('Compression failed for', file.name, err);
      }
    }
  }

  async function processToSvg() {
    const numColors = parseInt(document.getElementById('svg-colors')?.value || 16);
    const blur = parseInt(document.getElementById('svg-blur')?.value || 0);

    for (const file of uploadedFiles) {
      try {
        const { canvas } = await loadImageAsCanvas(file);
        const svgString = ImageTracer.imagedataToSVG(
          canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height),
          { numberofcolors: numColors, blurradius: blur, strokewidth: 1, scale: 1, pathomit: 8 }
        );

        const blob = new Blob([svgString], { type: 'image/svg+xml' });

        results.push({
          name: getBaseName(file.name) + '.svg',
          originalSize: file.size,
          newSize: blob.size,
          blob,
          type: 'svg',
          svgString
        });
      } catch (err) {
        console.error('SVG conversion failed for', file.name, err);
      }
    }
  }

  async function processToJpg() {
    const quality = parseInt(document.getElementById('jpg-quality')?.value || 92) / 100;
    const bgColor = document.getElementById('jpg-bg-color')?.value || '#ffffff';

    for (const file of uploadedFiles) {
      try {
        const { canvas, width, height } = await loadImageAsCanvas(file);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = width;
        outCanvas.height = height;
        const outCtx = outCanvas.getContext('2d');
        outCtx.fillStyle = bgColor;
        outCtx.fillRect(0, 0, width, height);
        outCtx.drawImage(canvas, 0, 0);

        const blob = await canvasToBlob(outCanvas, 'image/jpeg', quality);

        results.push({
          name: getBaseName(file.name) + '.jpg',
          originalSize: file.size,
          newSize: blob.size,
          blob,
          type: 'image'
        });
      } catch (err) {
        console.error('JPG conversion failed for', file.name, err);
      }
    }
  }

  async function processFromJpg() {
    const format = document.getElementById('from-jpg-format')?.value || 'png';
    const delay = parseInt(document.getElementById('gif-delay')?.value || 200);
    const loop = document.getElementById('gif-loop')?.checked !== false;

    if (format === 'animated-gif' && uploadedFiles.length > 1) {
      try {
        const gif = new GIF({
          workers: 2,
          quality: 10,
          workerScript: 'js/gif.worker.js',
          repeat: loop ? 0 : -1
        });

        let maxW = 0, maxH = 0;
        const images = [];

        for (const file of uploadedFiles) {
          const { canvas, width, height } = await loadImageAsCanvas(file);
          images.push(canvas);
          maxW = Math.max(maxW, width);
          maxH = Math.max(maxH, height);
        }

        for (const canvas of images) {
          const frameCanvas = document.createElement('canvas');
          frameCanvas.width = maxW;
          frameCanvas.height = maxH;
          const fCtx = frameCanvas.getContext('2d');
          fCtx.fillStyle = '#ffffff';
          fCtx.fillRect(0, 0, maxW, maxH);
          const x = (maxW - canvas.width) / 2;
          const y = (maxH - canvas.height) / 2;
          fCtx.drawImage(canvas, x, y);
          gif.addFrame(frameCanvas, { delay, copy: true });
        }

        const blob = await new Promise((resolve, reject) => {
          gif.on('finished', resolve);
          gif.on('error', reject);
          gif.render();
        });

        results.push({
          name: 'animated.gif',
          originalSize: uploadedFiles.reduce((sum, f) => sum + f.size, 0),
          newSize: blob.size,
          blob,
          type: 'image'
        });
      } catch (err) {
        console.error('Animated GIF creation failed', err);
      }
    } else {
      const mimeType = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/png';
      const ext = format === 'animated-gif' ? 'png' : format;

      for (const file of uploadedFiles) {
        try {
          const { canvas } = await loadImageAsCanvas(file);
          const blob = await canvasToBlob(canvas, mimeType);

          results.push({
            name: getBaseName(file.name) + '.' + ext,
            originalSize: file.size,
            newSize: blob.size,
            blob,
            type: 'image'
          });
        } catch (err) {
          console.error('Conversion failed for', file.name, err);
        }
      }
    }
  }

  async function processMeme() {
    const font = document.getElementById('meme-font')?.value || 'Impact';
    const fontSize = parseInt(document.getElementById('meme-font-size')?.value || 48);
    const textColor = document.getElementById('meme-text-color')?.value || '#ffffff';
    const strokeColor = document.getElementById('meme-stroke-color')?.value || '#000000';
    const strokeWidth = parseInt(document.getElementById('meme-stroke-width')?.value || 3);
    const useBg = document.getElementById('meme-text-bg')?.checked || false;

    for (const file of uploadedFiles) {
      try {
        const { canvas, ctx, width, height } = await loadImageAsCanvas(file);

        const scaledFontSize = Math.round(fontSize * (width / 500));
        ctx.font = `bold ${scaledFontSize}px ${font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = strokeWidth * (width / 500);
        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = textColor;

        memeTexts.forEach(t => {
          if (!t.text) return;
          const x = width * t.x;
          const y = height * t.y;

          if (useBg) {
            const metrics = ctx.measureText(t.text.toUpperCase());
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(x - metrics.width / 2 - 10, y - scaledFontSize / 2 - 5, metrics.width + 20, scaledFontSize + 10);
            ctx.fillStyle = textColor;
          }

          if (strokeWidth > 0) {
            ctx.strokeText(t.text.toUpperCase(), x, y);
          }
          ctx.fillText(t.text.toUpperCase(), x, y);
        });

        const blob = await canvasToBlob(canvas, 'image/png');

        results.push({
          name: getBaseName(file.name) + '_meme.png',
          originalSize: file.size,
          newSize: blob.size,
          blob,
          type: 'image'
        });
      } catch (err) {
        console.error('Meme creation failed for', file.name, err);
      }
    }
  }

  async function processWatermark() {
    const wmType = document.getElementById('watermark-type')?.value || 'text';
    const position = document.getElementById('watermark-position')?.value || 'free';
    const opacity = parseInt(document.getElementById('watermark-opacity')?.value || 50) / 100;

    for (const file of uploadedFiles) {
      try {
        const { canvas, ctx, width, height } = await loadImageAsCanvas(file);
        ctx.globalAlpha = opacity;

        const positions = position === 'free' ? watermarks : [{ x: 0, y: 0 }];

        positions.forEach(wm => {
          let x, y;
          if (position === 'free') {
            x = wm.x * width;
            y = wm.y * height;
          }

          if (wmType === 'text') {
            const text = document.getElementById('watermark-text')?.value || 'Watermark';
            const fontSize = parseInt(document.getElementById('watermark-font-size')?.value || 32);
            const color = document.getElementById('watermark-color')?.value || '#ffffff';

            ctx.font = `bold ${fontSize}px Arial`;
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (position === 'tile') {
              const metrics = ctx.measureText(text);
              for (let ty = 30; ty < height; ty += 80) {
                for (let tx = 30; tx < width; tx += metrics.width + 50) {
                  ctx.fillText(text, tx, ty);
                }
              }
            } else if (position !== 'free') {
              [x, y] = getWatermarkPosition(position, width, height);
              ctx.fillText(text, x, y);
            } else {
              ctx.fillText(text, x, y);
            }
          } else if (wmType === 'image' && watermarkImg) {
            const sizePercent = parseInt(document.getElementById('watermark-img-size')?.value || 20) / 100;
            const wmW = width * sizePercent;
            const wmH = (watermarkImg.height / watermarkImg.width) * wmW;

            if (position === 'tile') {
              for (let ty = 20; ty < height; ty += wmH + 40) {
                for (let tx = 20; tx < width; tx += wmW + 40) {
                  ctx.drawImage(watermarkImg, tx, ty, wmW, wmH);
                }
              }
            } else if (position !== 'free') {
              [x, y] = getWatermarkPosition(position, width, height);
              ctx.drawImage(watermarkImg, x - wmW / 2, y - wmH / 2, wmW, wmH);
            } else {
              ctx.drawImage(watermarkImg, x - wmW / 2, y - wmH / 2, wmW, wmH);
            }
          }
        });

        ctx.globalAlpha = 1;
        const blob = await canvasToBlob(canvas, 'image/png');

        results.push({
          name: getBaseName(file.name) + '_watermarked.png',
          originalSize: file.size,
          newSize: blob.size,
          blob,
          type: 'image'
        });
      } catch (err) {
        console.error('Watermark failed for', file.name, err);
      }
    }
  }

  async function processRemoveBg() {
    const threshold = parseInt(document.getElementById('bg-threshold')?.value || 30);
    const autoDetect = document.getElementById('bg-auto-detect')?.checked;
    let bgColor = hexToRgb(document.getElementById('bg-color-pick')?.value || '#ffffff');

    for (const file of uploadedFiles) {
      try {
        const { canvas, ctx, width, height } = await loadImageAsCanvas(file);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        if (autoDetect) {
          const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
          let r = 0, g = 0, b = 0;
          corners.forEach(([cx, cy]) => {
            const i = (cy * width + cx) * 4;
            r += data[i]; g += data[i + 1]; b += data[i + 2];
          });
          bgColor = { r: Math.round(r / 4), g: Math.round(g / 4), b: Math.round(b / 4) };
        }

        for (let i = 0; i < data.length; i += 4) {
          const diff = (Math.abs(data[i] - bgColor.r) + Math.abs(data[i + 1] - bgColor.g) + Math.abs(data[i + 2] - bgColor.b)) / 3;
          if (diff < threshold) data[i + 3] = 0;
        }

        ctx.putImageData(imageData, 0, 0);
        const blob = await canvasToBlob(canvas, 'image/png');

        results.push({
          name: getBaseName(file.name) + '_nobg.png',
          originalSize: file.size,
          newSize: blob.size,
          blob,
          type: 'image'
        });
      } catch (err) {
        console.error('BG removal failed for', file.name, err);
      }
    }
  }

  async function processMetadata() {
    const outputFormat = document.getElementById('metadata-output')?.value || 'same';

    for (const file of uploadedFiles) {
      try {
        const { canvas } = await loadImageAsCanvas(file);
        const originalMeta = fileMetadata.get(file.name) || {};
        const originalExt = getExtension(file.name).toLowerCase();

        // Determine output format and quality
        let mimeType = 'image/png';
        let ext = 'png';
        let quality = 0.85; // Default quality for lossy compression

        if (outputFormat === 'jpg') {
          mimeType = 'image/jpeg';
          ext = 'jpg';
        } else if (outputFormat === 'png') {
          mimeType = 'image/png';
          ext = 'png';
        } else {
          // 'same' format - preserve original
          if (['jpg', 'jpeg'].includes(originalExt)) {
            mimeType = 'image/jpeg';
            ext = 'jpg';
          } else if (originalExt === 'webp') {
            mimeType = 'image/webp';
            ext = 'webp';
          } else {
            mimeType = 'image/png';
            ext = 'png';
          }
        }

        // Use lower quality for metadata removal (no re-encoding loss)
        // For JPEG: 0.85 is good balance between quality and size
        const blob = await canvasToBlob(canvas, mimeType, mimeType === 'image/jpeg' ? 0.85 : 1);
        const removedTags = Object.keys(originalMeta).filter(k => k !== 'fileName' && k !== 'fileSize' && k !== 'fileType' && k !== 'lastModified');

        results.push({
          name: getBaseName(file.name) + '_clean.' + ext,
          originalSize: file.size,
          newSize: blob.size,
          blob,
          type: 'image',
          metadataRemoved: removedTags
        });
      } catch (err) {
        console.error('Metadata removal failed for', file.name, err);
      }
    }
  }

  async function processBlurFace() {
    const intensity = parseInt(document.getElementById('blur-intensity')?.value || 20);

    for (const file of uploadedFiles) {
      try {
        const { canvas, ctx, width, height } = await loadImageAsCanvas(file);

        blurRegions.forEach(region => {
          let x = region.x * width;
          let y = region.y * height;
          let w = region.w * width;
          let h = region.h * height;

          if (w < 0) { x += w; w = -w; }
          if (h < 0) { y += h; h = -h; }

          const rx = Math.max(0, Math.floor(x));
          const ry = Math.max(0, Math.floor(y));
          const rw = Math.min(Math.ceil(w), width - rx);
          const rh = Math.min(Math.ceil(h), height - ry);

          if (rw > 0 && rh > 0) {
            const regionData = ctx.getImageData(rx, ry, rw, rh);
            const blurred = boxBlur(regionData, intensity);
            ctx.putImageData(blurred, rx, ry);
          }
        });

        const blob = await canvasToBlob(canvas, 'image/png');

        results.push({
          name: getBaseName(file.name) + '_blurred.png',
          originalSize: file.size,
          newSize: blob.size,
          blob,
          type: 'image'
        });
      } catch (err) {
        console.error('Blur failed for', file.name, err);
      }
    }
  }

  function boxBlur(imageData, radius) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const output = new Uint8ClampedArray(data);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, count = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const i = (ny * w + nx) * 4;
              r += data[i];
              g += data[i + 1];
              b += data[i + 2];
              count++;
            }
          }
        }

        const i = (y * w + x) * 4;
        output[i] = r / count;
        output[i + 1] = g / count;
        output[i + 2] = b / count;
      }
    }

    return new ImageData(output, w, h);
  }

  async function processUpscale() {
    const factor = parseFloat(document.getElementById('upscale-factor')?.value || 2);
    const method = document.getElementById('upscale-method')?.value || 'smooth';

    for (const file of uploadedFiles) {
      try {
        const { canvas, width, height } = await loadImageAsCanvas(file);

        const newW = Math.round(width * factor);
        const newH = Math.round(height * factor);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = newW;
        outCanvas.height = newH;
        const outCtx = outCanvas.getContext('2d');

        outCtx.imageSmoothingEnabled = method === 'smooth';
        outCtx.imageSmoothingQuality = 'high';
        outCtx.drawImage(canvas, 0, 0, newW, newH);

        const blob = await canvasToBlob(outCanvas, 'image/png');

        results.push({
          name: getBaseName(file.name) + `_${factor}x.png`,
          originalSize: file.size,
          newSize: blob.size,
          blob,
          type: 'image',
          dimensions: `${newW}×${newH}`
        });
      } catch (err) {
        console.error('Upscale failed for', file.name, err);
      }
    }
  }

  async function processEditor() {
    // Render final canvas with all layers and drawings
    renderEditorCanvas();
    const blob = await canvasToBlob(previewCanvas, 'image/png');

    results.push({
      name: 'edited_image.png',
      originalSize: uploadedFiles[0]?.size || 0,
      newSize: blob.size,
      blob,
      type: 'image'
    });
  }

  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }

  /* ── Render results ──────────────────────────────────────────────── */
  function renderResults() {
    resultsGrid.innerHTML = '';
    let totalOriginal = 0, totalNew = 0;

    results.forEach(result => {
      totalOriginal += result.originalSize || 0;
      totalNew += result.newSize || 0;

      const card = document.createElement('div');
      card.className = 'result-card';

      const preview = document.createElement('div');
      preview.className = 'result-preview' + (result.type === 'svg' ? ' svg-preview' : '');

      if (result.type === 'svg' && result.svgString) {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(result.svgString, 'image/svg+xml');
        const svg = svgDoc.documentElement;
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        preview.appendChild(svg);
      } else {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(result.blob);
        img.alt = result.name;
        preview.appendChild(img);
      }

      const info = document.createElement('div');
      info.className = 'result-info';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'result-name';
      nameDiv.textContent = result.name;
      nameDiv.title = result.name;

      const sizeDiv = document.createElement('div');
      sizeDiv.className = 'result-size';
      sizeDiv.innerHTML = formatBytes(result.newSize);
      if (result.savings && parseFloat(result.savings) > 0) {
        sizeDiv.innerHTML += ` <span class="savings">-${result.savings}%</span>`;
      }
      if (result.dimensions) {
        sizeDiv.innerHTML = `${result.dimensions} · ${formatBytes(result.newSize)}`;
      }

      info.appendChild(nameDiv);
      info.appendChild(sizeDiv);

      if (result.metadataRemoved && result.metadataRemoved.length > 0) {
        const metaDiff = document.createElement('div');
        metaDiff.className = 'metadata-diff';
        metaDiff.innerHTML = `<strong>Removed:</strong> <span class="removed">${result.metadataRemoved.slice(0, 8).join(', ')}${result.metadataRemoved.length > 8 ? '...' : ''}</span>`;
        info.appendChild(metaDiff);
      }

      const actions = document.createElement('div');
      actions.className = 'result-actions';

      const dlBtn = document.createElement('button');
      dlBtn.className = 'tool-button sm-btn';
      dlBtn.textContent = 'Download';
      dlBtn.addEventListener('click', () => downloadBlob(result.blob, result.name));

      actions.appendChild(dlBtn);

      card.appendChild(preview);
      card.appendChild(info);
      card.appendChild(actions);
      resultsGrid.appendChild(card);
    });

    const totalSavings = totalOriginal > 0 ? ((totalOriginal - totalNew) / totalOriginal * 100).toFixed(1) : 0;
    resultsStats.innerHTML = `
      <span>${results.length} file${results.length > 1 ? 's' : ''} processed</span>
      <span>Original: ${formatBytes(totalOriginal)} → New: ${formatBytes(totalNew)}
        ${totalSavings > 0 ? `<span class="stat-highlight">(-${totalSavings}%)</span>` : ''}</span>
    `;
  }

  /* ── Download ZIP ────────────────────────────────────────────────── */
  btnDownloadZip.addEventListener('click', async () => {
    if (results.length === 0) return;
    const zip = new JSZip();
    results.forEach(r => zip.file(r.name, r.blob));
    const content = await zip.generateAsync({ type: 'blob' });
    downloadBlob(content, `images_${currentMode}_${Date.now()}.zip`);
  });

  /* ── Settings UI ─────────────────────────────────────────────────── */
  const compressQuality = document.getElementById('compress-quality');
  const compressQualityVal = document.getElementById('compress-quality-val');
  compressQuality?.addEventListener('input', () => compressQualityVal.textContent = compressQuality.value + '%');

  const svgBlur = document.getElementById('svg-blur');
  const svgBlurVal = document.getElementById('svg-blur-val');
  svgBlur?.addEventListener('input', () => svgBlurVal.textContent = svgBlur.value);

  const jpgQuality = document.getElementById('jpg-quality');
  const jpgQualityVal = document.getElementById('jpg-quality-val');
  jpgQuality?.addEventListener('input', () => jpgQualityVal.textContent = jpgQuality.value + '%');

  const fromJpgFormat = document.getElementById('from-jpg-format');
  fromJpgFormat?.addEventListener('change', updateGifSettingsVisibility);

  function updateGifSettingsVisibility() {
    const isGif = fromJpgFormat?.value === 'animated-gif';
    document.querySelectorAll('.gif-settings').forEach(el => el.style.display = isGif ? '' : 'none');
  }

  const bgThreshold = document.getElementById('bg-threshold');
  const bgThresholdVal = document.getElementById('bg-threshold-val');
  bgThreshold?.addEventListener('input', () => bgThresholdVal.textContent = bgThreshold.value);

  /* ── HTML to Image ───────────────────────────────────────────────── */

  function convertRelativeUrlsToAbsolute(html, baseUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Add base tag so relative URLs resolve correctly
    const baseTag = doc.createElement('base');
    baseTag.href = baseUrl;
    doc.head.insertBefore(baseTag, doc.head.firstChild);

    // Convert img src to absolute
    doc.querySelectorAll('img').forEach(img => {
      if (img.src && !img.src.startsWith('data:')) {
        try {
          const absUrl = new URL(img.src, baseUrl).href;
          img.src = absUrl;
        } catch (e) {
          console.warn('Failed to convert img src:', img.src);
        }
      }
    });

    // Convert background images in styles
    doc.querySelectorAll('[style]').forEach(el => {
      const style = el.getAttribute('style');
      if (style && style.includes('url(')) {
        const newStyle = style.replace(/url\((['"]?)([^)'"]+)\1\)/g, (match, quote, url) => {
          if (url.startsWith('data:') || url.startsWith('http')) return match;
          try {
            const absUrl = new URL(url, baseUrl).href;
            return `url(${quote}${absUrl}${quote})`;
          } catch (e) {
            return match;
          }
        });
        el.setAttribute('style', newStyle);
      }
    });

    // Convert link href for stylesheets to absolute
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      if (link.href && !link.href.startsWith('data:')) {
        try {
          const absUrl = new URL(link.href, baseUrl).href;
          link.href = absUrl;
        } catch (e) {
          console.warn('Failed to convert link href:', link.href);
        }
      }
    });

    return doc.documentElement.outerHTML;
  }

  async function inlineStylesFromHtml(html, baseUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Fetch and inline external stylesheets
    const links = doc.querySelectorAll('link[rel="stylesheet"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;

      try {
        const absUrl = new URL(href, baseUrl).href;
        const cssResponse = await fetch(absUrl, { mode: 'cors' });
        if (!cssResponse.ok) continue;
        const cssText = await cssResponse.text();

        const style = doc.createElement('style');
        style.textContent = cssText;
        link.parentNode.replaceChild(style, link);
      } catch (e) {
        console.warn('Failed to inline CSS:', href, e);
      }
    }

    return doc.documentElement.outerHTML;
  }

  const htmlSourceType = document.getElementById('html-source-type');
  htmlSourceType?.addEventListener('change', () => {
    document.querySelector('.url-source-settings').style.display = htmlSourceType.value === 'url' ? '' : 'none';
    document.querySelector('.html-source-settings').style.display = htmlSourceType.value === 'html' ? '' : 'none';
  });

  document.getElementById('btn-render-html')?.addEventListener('click', async () => {
    const sourceType = document.getElementById('html-source-type')?.value || 'url';
    const maxHeight = parseInt(document.getElementById('html-height')?.value || 0);
    const format = document.getElementById('html-output-format')?.value || 'png';

    let htmlContent = '';
    const btn = document.getElementById('btn-render-html');
    btn.textContent = 'Capturing...';
    btn.disabled = true;

    try {
      if (sourceType === 'url') {
        let url = document.getElementById('html-url')?.value?.trim();
        if (!url) {
          alert('Please enter a URL');
          btn.textContent = 'Capture Screenshot';
          btn.disabled = false;
          return;
        }

        // Add https:// if no protocol specified
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        // Direct fetch - works for same-origin or CORS-enabled sites
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        htmlContent = await response.text();

        // Convert relative URLs to absolute and inline CSS
        htmlContent = convertRelativeUrlsToAbsolute(htmlContent, url);

        // Always inline CSS for screenshot capture to work properly
        htmlContent = await inlineStylesFromHtml(htmlContent, url);
      } else {
        htmlContent = document.getElementById('html-input')?.value || '';
        if (!htmlContent.trim()) {
          alert('Please enter HTML code');
          btn.textContent = 'Capture Screenshot';
          btn.disabled = false;
          return;
        }
      }

      // Show preview
      const previewArea = document.getElementById('html-preview-area');
      const previewContainer = document.getElementById('html-preview-container');
      previewArea.style.display = '';

      // Create iframe
      previewContainer.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.style.width = '1200px';
      iframe.style.height = maxHeight > 0 ? maxHeight + 'px' : '2000px';
      iframe.style.border = '1px solid #ddd';
      previewContainer.appendChild(iframe);

      const doc = iframe.contentDocument;
      doc.open();
      doc.write(htmlContent);
      doc.close();

      // Wait for initial render
      await new Promise(r => setTimeout(r, 1500));

      // Smooth scroll to trigger lazy loading, reveal animations, and progressive content
      const scrollToBottom = async () => {
        const win = iframe.contentWindow;
        let lastHeight = doc.body.scrollHeight;
        let unchangedCount = 0;

        // Scroll through page carefully to trigger reveal animations
        for (let attempt = 0; attempt < 50; attempt++) {
          // Get viewport height
          const viewportHeight = win.innerHeight || doc.documentElement.clientHeight;

          // Scroll down by viewport height
          win.scrollBy(0, viewportHeight);

          // Dispatch scroll event to trigger reveal detection
          const scrollEvent = new Event('scroll', { bubbles: true });
          doc.dispatchEvent(scrollEvent);
          win.dispatchEvent(scrollEvent);

          // Wait for reveal animations to complete (1s transition + buffer)
          await new Promise(r => setTimeout(r, 1200));

          const newHeight = doc.body.scrollHeight;

          // Check if we've reached the bottom
          if (newHeight === lastHeight) {
            unchangedCount++;
            // Need 3-4 checks to confirm we're really done
            if (unchangedCount >= 3) break;
          } else {
            unchangedCount = 0;
          }

          lastHeight = newHeight;
        }

        // Go back to top
        win.scrollTo(0, 0);
        const scrollEvent = new Event('scroll', { bubbles: true });
        doc.dispatchEvent(scrollEvent);
        win.dispatchEvent(scrollEvent);

        // Wait for everything to settle, including any animations that trigger on top scroll
        await new Promise(r => setTimeout(r, 2000));
      };

      try {
        await scrollToBottom();
      } catch (e) {
        console.warn('Scrolling failed, continuing anyway:', e);
      }

      // Final wait for all animations to complete
      await new Promise(r => setTimeout(r, 1500));

      // Force all reveal elements to be active so they're animated and visible
      doc.querySelectorAll('.reveal').forEach(el => {
        el.classList.add('active');
      });

      // Wait for the final animations to play
      await new Promise(r => setTimeout(r, 1500));

      // Get actual content height
      const contentHeight = maxHeight > 0 ? maxHeight : Math.min(doc.body.scrollHeight, 10000);
      iframe.style.height = contentHeight + 'px';

      // Capture using html2canvas
      if (typeof html2canvas !== 'undefined') {
        const baseUrl = sourceType === 'url' ? document.getElementById('html-url')?.value?.trim() : null;
        const canvas = await html2canvas(doc.body, {
          width: 1200,
          height: contentHeight,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          scrollY: 0,
          scrollX: 0,
          baseURL: baseUrl || undefined,
          onclone: (clonedDoc) => {
            // Remove any scripts that might cause issues
            clonedDoc.querySelectorAll('script').forEach(s => s.remove());
            // Ensure all reveals are active so they render animated
            clonedDoc.querySelectorAll('.reveal').forEach(el => {
              el.classList.add('active');
            });
            // Ensure scroll is at top
            clonedDoc.documentElement.scrollTop = 0;
            clonedDoc.body.scrollTop = 0;
          }
        });

        const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
        const blob = await canvasToBlob(canvas, mimeType, 0.92);

        results = [{
          name: `screenshot.${format}`,
          originalSize: htmlContent.length,
          newSize: blob.size,
          blob,
          type: 'image',
          dimensions: `1200×${contentHeight}`
        }];

        resultsSection.style.display = '';
        renderResults();
      }
    } catch (err) {
      console.error('Screenshot failed:', err);
      const isCors = err.message.includes('CORS') || err.message.includes('Failed to fetch');
      alert(isCors
        ? 'Cannot fetch this URL due to CORS restrictions. Try a same-origin URL or use the Custom HTML option instead.'
        : 'Failed to capture screenshot: ' + err.message);
    }

    btn.textContent = 'Capture Screenshot';
    btn.disabled = false;
  });

  async function inlineCssFromHtml(html, baseUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const links = doc.querySelectorAll('link[rel="stylesheet"]');
    const base = new URL(baseUrl);

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;

      try {
        const cssUrl = new URL(href, base).href;
        const cssResponse = await fetch(cssUrl, { mode: 'cors' });
        if (!cssResponse.ok) continue;
        const cssText = await cssResponse.text();

        const style = doc.createElement('style');
        style.textContent = cssText;
        link.parentNode.replaceChild(style, link);
      } catch (e) {
        console.warn('Failed to inline CSS:', href, e);
      }
    }

    return doc.documentElement.outerHTML;
  }

  /* ── Python Helper ───────────────────────────────────────────────── */
  const pythonImageInput = document.getElementById('python-image-input');
  pythonImageInput?.addEventListener('change', async () => {
    if (!pythonImageInput.files[0]) return;
    try {
      const { canvas, img } = await loadImageAsCanvas(pythonImageInput.files[0]);
      pythonPreviewImg = { canvas, img };

      const previewArea = document.getElementById('python-preview-area');
      previewArea.style.display = '';

      const origCanvas = document.getElementById('python-original-canvas');
      const maxSize = 300;
      const scale = Math.min(maxSize / canvas.width, maxSize / canvas.height, 1);
      origCanvas.width = canvas.width * scale;
      origCanvas.height = canvas.height * scale;
      origCanvas.getContext('2d').drawImage(canvas, 0, 0, origCanvas.width, origCanvas.height);
    } catch (e) {
      console.error('Failed to load Python preview image:', e);
    }
  });

  document.querySelectorAll('.python-ops-list input[type="range"]').forEach(slider => {
    slider.addEventListener('input', () => {
      const valSpan = document.getElementById('val-' + slider.id.replace('param-', ''));
      if (valSpan) valSpan.textContent = slider.value;
    });
  });

  document.getElementById('btn-preview-python')?.addEventListener('click', () => {
    if (!pythonPreviewImg) {
      alert('Please upload an image first');
      return;
    }

    const ops = [];
    document.querySelectorAll('.python-ops-list input[type="checkbox"]:checked').forEach(cb => {
      ops.push(cb.dataset.op);
    });

    if (ops.length === 0) {
      alert('Select at least one operation');
      return;
    }

    applyPythonPreview(ops);
  });

  function applyPythonPreview(ops) {
    const srcCanvas = pythonPreviewImg.canvas;
    const srcCtx = srcCanvas.getContext('2d');
    const imageData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    let data = new Uint8ClampedArray(imageData.data);
    const w = srcCanvas.width;
    const h = srcCanvas.height;

    ops.forEach(op => {
      if (op === 'grayscale') {
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
      } else if (op === 'invert') {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - data[i];
          data[i + 1] = 255 - data[i + 1];
          data[i + 2] = 255 - data[i + 2];
        }
      } else if (op === 'threshold') {
        const thresh = parseInt(document.getElementById('param-threshold-val')?.value || 128);
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const val = gray > thresh ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = val;
        }
      } else if (op === 'sobel') {
        // Proper Sobel with 3x3 kernel for full edge detection
        const output = new Uint8ClampedArray(data);
        const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
        const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            let gx = 0, gy = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const idx = ((y + ky) * w + (x + kx)) * 4;
                const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                gx += gray * sobelX[ky + 1][kx + 1];
                gy += gray * sobelY[ky + 1][kx + 1];
              }
            }

            const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
            const i = (y * w + x) * 4;
            output[i] = output[i + 1] = output[i + 2] = mag;
          }
        }
        data = output;
      } else if (op === 'contour-h') {
        // Horizontal contours: 1px sliding technique (shift down and compare)
        const output = new Uint8ClampedArray(data);
        for (let y = 0; y < h - 1; y++) {
          for (let x = 0; x < w; x++) {
            const idx1 = (y * w + x) * 4;
            const idx2 = ((y + 1) * w + x) * 4;
            const gray1 = 0.299 * data[idx1] + 0.587 * data[idx1 + 1] + 0.114 * data[idx1 + 2];
            const gray2 = 0.299 * data[idx2] + 0.587 * data[idx2 + 1] + 0.114 * data[idx2 + 2];
            const diff = Math.min(255, Math.abs(gray1 - gray2));
            output[idx1] = output[idx1 + 1] = output[idx1 + 2] = diff;
          }
        }
        data = output;
      } else if (op === 'contour-v') {
        // Vertical contours: 1px sliding technique (shift right and compare)
        const output = new Uint8ClampedArray(data);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w - 1; x++) {
            const idx1 = (y * w + x) * 4;
            const idx2 = (y * w + (x + 1)) * 4;
            const gray1 = 0.299 * data[idx1] + 0.587 * data[idx1 + 1] + 0.114 * data[idx1 + 2];
            const gray2 = 0.299 * data[idx2] + 0.587 * data[idx2 + 1] + 0.114 * data[idx2 + 2];
            const diff = Math.min(255, Math.abs(gray1 - gray2));
            output[idx1] = output[idx1 + 1] = output[idx1 + 2] = diff;
          }
        }
        data = output;
      } else if (op === 'gaussian') {
        const sigma = parseFloat(document.getElementById('param-gaussian-sigma')?.value || 2);
        data = gaussianBlur(data, w, h, sigma);
      } else if (op === 'erosion' || op === 'dilation') {
        const kSize = parseInt(document.getElementById(`param-${op}-k`)?.value || 3);
        data = morphological(data, w, h, kSize, op === 'dilation');
      } else if (op === 'filter-color') {
        const colorHex = document.getElementById('param-filter-color')?.value || '#ff0000';
        const tol = parseInt(document.getElementById('param-filter-tol')?.value || 30);
        const target = hexToRgb(colorHex);
        for (let i = 0; i < data.length; i += 4) {
          const diff = Math.abs(data[i] - target.r) + Math.abs(data[i + 1] - target.g) + Math.abs(data[i + 2] - target.b);
          if (diff / 3 > tol) {
            data[i] = data[i + 1] = data[i + 2] = 0;
          }
        }
      } else if (op === 'remove-color') {
        const colorHex = document.getElementById('param-remove-color')?.value || '#ffffff';
        const tol = parseInt(document.getElementById('param-remove-tol')?.value || 30);
        const target = hexToRgb(colorHex);
        for (let i = 0; i < data.length; i += 4) {
          const diff = Math.abs(data[i] - target.r) + Math.abs(data[i + 1] - target.g) + Math.abs(data[i + 2] - target.b);
          if (diff / 3 < tol) {
            data[i + 3] = 0;
          }
        }
      }
    });

    const resultCanvas = document.getElementById('python-result-canvas');
    const maxSize = 300;
    const scale = Math.min(maxSize / srcCanvas.width, maxSize / srcCanvas.height, 1);
    resultCanvas.width = srcCanvas.width * scale;
    resultCanvas.height = srcCanvas.height * scale;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = srcCanvas.width;
    tempCanvas.height = srcCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(new ImageData(data, srcCanvas.width, srcCanvas.height), 0, 0);

    resultCanvas.getContext('2d').drawImage(tempCanvas, 0, 0, resultCanvas.width, resultCanvas.height);
  }

  function gaussianBlur(data, w, h, sigma) {
    const output = new Uint8ClampedArray(data);
    const radius = Math.ceil(sigma * 3);
    const kernel = [];
    let sum = 0;

    for (let i = -radius; i <= radius; i++) {
      const val = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel.push(val);
      sum += val;
    }
    for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

    // Horizontal pass
    const temp = new Uint8ClampedArray(data);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let k = -radius; k <= radius; k++) {
          const nx = Math.min(w - 1, Math.max(0, x + k));
          const idx = (y * w + nx) * 4;
          const weight = kernel[k + radius];
          r += data[idx] * weight;
          g += data[idx + 1] * weight;
          b += data[idx + 2] * weight;
        }
        const i = (y * w + x) * 4;
        temp[i] = r;
        temp[i + 1] = g;
        temp[i + 2] = b;
      }
    }

    // Vertical pass
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let k = -radius; k <= radius; k++) {
          const ny = Math.min(h - 1, Math.max(0, y + k));
          const idx = (ny * w + x) * 4;
          const weight = kernel[k + radius];
          r += temp[idx] * weight;
          g += temp[idx + 1] * weight;
          b += temp[idx + 2] * weight;
        }
        const i = (y * w + x) * 4;
        output[i] = r;
        output[i + 1] = g;
        output[i + 2] = b;
      }
    }

    return output;
  }

  function morphological(data, w, h, kSize, isDilation) {
    const output = new Uint8ClampedArray(data);
    const half = Math.floor(kSize / 2);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let val = isDilation ? 0 : 255;
        for (let ky = -half; ky <= half; ky++) {
          for (let kx = -half; kx <= half; kx++) {
            const ny = Math.min(h - 1, Math.max(0, y + ky));
            const nx = Math.min(w - 1, Math.max(0, x + kx));
            const idx = (ny * w + nx) * 4;
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            val = isDilation ? Math.max(val, gray) : Math.min(val, gray);
          }
        }
        const i = (y * w + x) * 4;
        output[i] = output[i + 1] = output[i + 2] = val;
      }
    }

    return output;
  }

  document.getElementById('btn-generate-python')?.addEventListener('click', () => {
    const ops = [];
    document.querySelectorAll('.python-ops-list input[type="checkbox"]:checked').forEach(cb => {
      ops.push(cb.dataset.op);
    });

    if (ops.length === 0) {
      alert('Select at least one operation');
      return;
    }

    const code = generatePythonCode(ops);
    document.getElementById('python-code').textContent = code;
    document.getElementById('python-output').style.display = '';
  });

  document.getElementById('btn-copy-python')?.addEventListener('click', () => {
    const code = document.getElementById('python-code')?.textContent || '';
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('btn-copy-python');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    });
  });

  function generatePythonCode(ops) {
    const funcs = [];
    const imports = new Set(['import numpy as np', 'from PIL import Image']);

    if (ops.includes('grayscale') || ops.includes('threshold') || ops.includes('sobel') || ops.includes('contour-h') || ops.includes('contour-v')) {
      funcs.push(`def to_grayscale(img: np.ndarray) -> np.ndarray:
    """Convert RGB to grayscale using luminance formula."""
    if len(img.shape) == 2:
        return img
    return np.dot(img[...,:3], [0.299, 0.587, 0.114]).astype(np.uint8)`);
    }

    if (ops.includes('invert')) {
      funcs.push(`def invert_colors(img: np.ndarray) -> np.ndarray:
    """Invert all pixel values (negative image)."""
    return (255 - img).astype(np.uint8)`);
    }

    if (ops.includes('gaussian')) {
      imports.add('from scipy.ndimage import gaussian_filter');
      const sigma = document.getElementById('param-gaussian-sigma')?.value || 2;
      funcs.push(`def gaussian_blur(img: np.ndarray, sigma: float = ${sigma}) -> np.ndarray:
    """Apply Gaussian blur for smoothing/noise reduction."""
    if len(img.shape) == 3:
        return np.stack([gaussian_filter(img[:,:,c], sigma) for c in range(img.shape[2])], axis=2).astype(np.uint8)
    return gaussian_filter(img, sigma).astype(np.uint8)`);
    }

    if (ops.includes('threshold')) {
      const thresh = document.getElementById('param-threshold-val')?.value || 128;
      funcs.push(`def binary_threshold(img: np.ndarray, thresh: int = ${thresh}) -> np.ndarray:
    """Convert to binary image using threshold."""
    gray = to_grayscale(img) if len(img.shape) == 3 else img
    return ((gray > thresh) * 255).astype(np.uint8)`);
    }

    if (ops.includes('contour-h')) {
      funcs.push(`def horizontal_contours(img: np.ndarray) -> np.ndarray:
    """Extract horizontal edges using 1px sliding technique.
    Compares each pixel with the one below it (np.roll shift)."""
    gray = to_grayscale(img) if len(img.shape) == 3 else img.astype(np.int16)
    shifted = np.roll(gray, 1, axis=0)  # Shift down by 1 pixel
    diff = np.abs(gray - shifted)
    diff[0, :] = 0  # Clear edge artifact from roll
    return np.clip(diff, 0, 255).astype(np.uint8)`);
    }

    if (ops.includes('contour-v')) {
      funcs.push(`def vertical_contours(img: np.ndarray) -> np.ndarray:
    """Extract vertical edges using 1px sliding technique.
    Compares each pixel with the one to its right (np.roll shift)."""
    gray = to_grayscale(img) if len(img.shape) == 3 else img.astype(np.int16)
    shifted = np.roll(gray, 1, axis=1)  # Shift right by 1 pixel
    diff = np.abs(gray - shifted)
    diff[:, 0] = 0  # Clear edge artifact from roll
    return np.clip(diff, 0, 255).astype(np.uint8)`);
    }

    if (ops.includes('sobel')) {
      imports.add('from scipy.ndimage import convolve');
      funcs.push(`def sobel_edges(img: np.ndarray) -> np.ndarray:
    """Detect edges using Sobel operator: sqrt(Gx² + Gy²)."""
    gray = to_grayscale(img) if len(img.shape) == 3 else img.astype(np.float64)
    kernel_x = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]])
    kernel_y = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]])
    gx = convolve(gray, kernel_x, mode='reflect')
    gy = convolve(gray, kernel_y, mode='reflect')
    return np.clip(np.sqrt(gx**2 + gy**2), 0, 255).astype(np.uint8)`);
    }

    if (ops.includes('canny')) {
      imports.add('import cv2');
      const low = document.getElementById('param-canny-low')?.value || 50;
      const high = document.getElementById('param-canny-high')?.value || 150;
      funcs.push(`def canny_edges(img: np.ndarray, low: int = ${low}, high: int = ${high}) -> np.ndarray:
    """Multi-stage edge detection with hysteresis thresholding."""
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY) if len(img.shape) == 3 else img
    return cv2.Canny(gray, low, high)`);
    }

    if (ops.includes('filter-color')) {
      const tol = document.getElementById('param-filter-tol')?.value || 30;
      funcs.push(`def filter_color(img: np.ndarray, target_rgb: tuple, tolerance: int = ${tol}) -> np.ndarray:
    """Keep only pixels within tolerance of target color."""
    r, g, b = target_rgb
    diff = np.abs(img[:,:,0].astype(int) - r) + \\
           np.abs(img[:,:,1].astype(int) - g) + \\
           np.abs(img[:,:,2].astype(int) - b)
    mask = diff / 3 <= tolerance
    result = np.zeros_like(img)
    result[mask] = img[mask]
    return result`);
    }

    if (ops.includes('remove-color') || ops.includes('foreground')) {
      const tol = document.getElementById('param-remove-tol')?.value || 30;
      funcs.push(`def remove_color(img: np.ndarray, target_rgb: tuple, tolerance: int = ${tol}) -> np.ndarray:
    """Make pixels near target color transparent."""
    r, g, b = target_rgb
    diff = np.abs(img[:,:,0].astype(int) - r) + \\
           np.abs(img[:,:,1].astype(int) - g) + \\
           np.abs(img[:,:,2].astype(int) - b)
    mask = diff / 3 < tolerance
    if img.shape[2] == 3:
        rgba = np.dstack([img, np.full(img.shape[:2], 255, dtype=np.uint8)])
    else:
        rgba = img.copy()
    rgba[mask, 3] = 0
    return rgba`);
    }

    if (ops.includes('foreground') && !ops.includes('remove-color')) {
      funcs.push(`def extract_foreground(img: np.ndarray, bg_rgb: tuple = (255, 255, 255)) -> np.ndarray:
    """Remove background color to isolate foreground."""
    return remove_color(img, bg_rgb)`);
    }

    if (ops.includes('erosion')) {
      imports.add('import cv2');
      const k = document.getElementById('param-erosion-k')?.value || 3;
      funcs.push(`def erosion(img: np.ndarray, kernel_size: int = ${k}) -> np.ndarray:
    """Morphological erosion - shrinks bright regions."""
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    return cv2.erode(img, kernel)`);
    }

    if (ops.includes('dilation')) {
      imports.add('import cv2');
      const k = document.getElementById('param-dilation-k')?.value || 3;
      funcs.push(`def dilation(img: np.ndarray, kernel_size: int = ${k}) -> np.ndarray:
    """Morphological dilation - expands bright regions."""
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    return cv2.dilate(img, kernel)`);
    }

    if (ops.includes('morphopen')) {
      imports.add('import cv2');
      funcs.push(`def morphological_opening(img: np.ndarray, kernel_size: int = 3) -> np.ndarray:
    """Opening = erosion then dilation. Removes small bright noise."""
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    return cv2.morphologyEx(img, cv2.MORPH_OPEN, kernel)`);
    }

    if (ops.includes('morphclose')) {
      imports.add('import cv2');
      funcs.push(`def morphological_closing(img: np.ndarray, kernel_size: int = 3) -> np.ndarray:
    """Closing = dilation then erosion. Fills small dark holes."""
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    return cv2.morphologyEx(img, cv2.MORPH_CLOSE, kernel)`);
    }

    if (ops.includes('otsu')) {
      imports.add('from skimage.filters import threshold_otsu');
      funcs.push(`def otsu_threshold(img: np.ndarray) -> np.ndarray:
    """Automatic threshold using Otsu's method."""
    gray = to_grayscale(img) if len(img.shape) == 3 else img
    thresh = threshold_otsu(gray)
    return ((gray > thresh) * 255).astype(np.uint8)`);
    }

    if (ops.includes('adaptive')) {
      imports.add('import cv2');
      const block = document.getElementById('param-adaptive-block')?.value || 35;
      funcs.push(`def adaptive_threshold(img: np.ndarray, block_size: int = ${block}) -> np.ndarray:
    """Adaptive threshold using local neighborhood mean."""
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY) if len(img.shape) == 3 else img
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block_size, 2)`);
    }

    const importsStr = Array.from(imports).sort().join('\n');
    const firstOp = ops[0].replace(/-/g, '_');

    return `${importsStr}

# Load image: img = np.array(Image.open('image.png'))
# Save image: Image.fromarray(result).save('output.png')

${funcs.join('\n\n')}

# Example usage:
# img = np.array(Image.open('input.png'))
# result = ${firstOp === 'grayscale' ? 'to_grayscale' : firstOp === 'contour_h' ? 'horizontal_contours' : firstOp === 'contour_v' ? 'vertical_contours' : firstOp}(img)
# Image.fromarray(result).save('output.png')`;
  }

  /* ── Init ────────────────────────────────────────────────────────── */
  updateGifSettingsVisibility();
  initMemeUI();

})();
