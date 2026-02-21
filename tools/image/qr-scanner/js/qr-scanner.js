/* qr-scanner.js — QR Code Scanner logic
   Uses jsQR (bundled locally) for decoding.
   Supports: webcam real-time scan + image file upload.
*/

(function () {
    'use strict';

    // ── DOM refs ──────────────────────────────────────────────────────────────
    const tabWebcam     = document.getElementById('tab-webcam');
    const tabUpload     = document.getElementById('tab-upload');
    const panelWebcam   = document.getElementById('panel-webcam');
    const panelUpload   = document.getElementById('panel-upload');

    const video         = document.getElementById('qrsVideo');
    const overlayCanvas = document.getElementById('qrsOverlay');
    const videoWrap     = document.getElementById('videoWrap');
    const startCamBtn   = document.getElementById('startCamBtn');
    const stopCamBtn    = document.getElementById('stopCamBtn');
    const cameraSelect  = document.getElementById('cameraSelect');
    const camHint       = document.getElementById('camHint');

    const uploadDrop    = document.getElementById('uploadDrop');
    const uploadInput   = document.getElementById('uploadInput');
    const uploadLabel   = document.getElementById('uploadLabel');
    const uploadPreviewWrap = document.getElementById('uploadPreviewWrap');
    const uploadPreview = document.getElementById('uploadPreview');

    const resultWrap    = document.getElementById('resultWrap');
    const resultBox     = document.getElementById('resultBox');
    const resultActions = document.getElementById('resultActions');
    const qrsMessage    = document.getElementById('qrsMessage');

    // ── State ─────────────────────────────────────────────────────────────────
    let stream          = null;
    let animFrameId     = null;
    let lastResult      = null;    // debounce — avoid re-rendering same result
    let scanningActive  = false;

    // ── Utility: classify QR content type ────────────────────────────────────
    function classifyContent(text) {
        const trimmed = text.trim();
        if (/^https?:\/\//i.test(trimmed))             return 'url';
        if (/^mailto:/i.test(trimmed))                  return 'email';
        if (/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(trimmed)) return 'email';
        if (/^tel:/i.test(trimmed))                     return 'phone';
        if (/^\+?[\d\s\-().]{7,20}$/.test(trimmed))    return 'phone';
        return 'text';
    }

    // ── Utility: build the result display HTML ────────────────────────────────
    function buildResultHTML(text) {
        const type = classifyContent(text);
        const badgeLabels = { url: 'URL', email: 'Email', phone: 'Phone', text: 'Text' };
        const badge = `<span class="qrs-type-badge qrs-type-${type}">${badgeLabels[type]}</span>`;

        let contentHTML = '';

        if (type === 'url') {
            const safe = escapeHTML(text.trim());
            contentHTML = `${badge}<a class="qrs-result-link" href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
        } else if (type === 'email') {
            let addr = text.trim();
            if (/^mailto:/i.test(addr)) addr = addr.slice(7);
            const safe = escapeHTML(addr);
            contentHTML = `${badge}<a class="qrs-result-link" href="mailto:${safe}">${safe}</a>`;
        } else if (type === 'phone') {
            let num = text.trim();
            if (/^tel:/i.test(num)) num = num.slice(4);
            const safe = escapeHTML(num);
            const telHref = escapeHTML(num.replace(/[\s\-().]/g, ''));
            contentHTML = `${badge}<a class="qrs-result-link" href="tel:${telHref}">${safe}</a>`;
        } else {
            contentHTML = `${badge}${escapeHTML(text)}`;
        }

        return contentHTML;
    }

    // ── Utility: build action buttons ─────────────────────────────────────────
    function buildActions(text) {
        const type = classifyContent(text);
        resultActions.innerHTML = '';

        // Copy raw text button — always present
        const copyBtn = document.createElement('button');
        copyBtn.className = 'qrs-action-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(text).then(() => {
                copyBtn.textContent = 'Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = 'Copy';
                    copyBtn.classList.remove('copied');
                }, 2000);
            }).catch(() => {
                // Fallback for browsers without clipboard API
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                copyBtn.textContent = 'Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = 'Copy';
                    copyBtn.classList.remove('copied');
                }, 2000);
            });
        });
        resultActions.appendChild(copyBtn);

        // Open link button for URLs
        if (type === 'url') {
            const openBtn = document.createElement('button');
            openBtn.className = 'qrs-action-btn';
            openBtn.textContent = 'Open Link';
            openBtn.addEventListener('click', () => {
                window.open(text.trim(), '_blank', 'noopener,noreferrer');
            });
            resultActions.appendChild(openBtn);
        }
    }

    // ── Utility: show result ──────────────────────────────────────────────────
    function showResult(text) {
        if (text === lastResult) return; // no-op if same QR already shown
        lastResult = text;

        resultBox.innerHTML = buildResultHTML(text);
        buildActions(text);
        resultWrap.style.display = '';
        hideMessage();

        // Flash effect on video wrap when scanning via webcam
        if (scanningActive) {
            videoWrap.classList.add('detected');
            videoWrap.classList.add('flash');
            setTimeout(() => videoWrap.classList.remove('flash'), 600);
            setTimeout(() => videoWrap.classList.remove('detected'), 1500);
        }
    }

    // ── Utility: show message banner ──────────────────────────────────────────
    function showMessage(text, type = 'info') {
        qrsMessage.textContent = text;
        qrsMessage.className = `qrs-message ${type}`;
        qrsMessage.style.display = '';
    }

    function hideMessage() {
        qrsMessage.style.display = 'none';
        qrsMessage.className = 'qrs-message';
    }

    // ── Utility: HTML escape ──────────────────────────────────────────────────
    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ── Tab switching ─────────────────────────────────────────────────────────
    function switchTab(tab) {
        if (tab === 'webcam') {
            tabWebcam.classList.add('active');
            tabUpload.classList.remove('active');
            panelWebcam.style.display = '';
            panelUpload.style.display = 'none';
        } else {
            tabUpload.classList.add('active');
            tabWebcam.classList.remove('active');
            panelUpload.style.display = '';
            panelWebcam.style.display = 'none';
            stopCamera(); // stop webcam when leaving that tab
        }
        // Clear result when switching tabs
        clearResult();
    }

    tabWebcam.addEventListener('click', () => switchTab('webcam'));
    tabUpload.addEventListener('click', () => switchTab('upload'));

    function clearResult() {
        lastResult = null;
        resultWrap.style.display = 'none';
        resultBox.innerHTML = '';
        resultActions.innerHTML = '';
        hideMessage();
    }

    // ── Camera enumeration & selection ───────────────────────────────────────
    async function enumerateCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cams = devices.filter(d => d.kind === 'videoinput');
            if (cams.length <= 1) {
                cameraSelect.style.display = 'none';
                return;
            }
            cameraSelect.innerHTML = '';
            cams.forEach((cam, i) => {
                const opt = document.createElement('option');
                opt.value = cam.deviceId;
                opt.textContent = cam.label || `Camera ${i + 1}`;
                cameraSelect.appendChild(opt);
            });
            cameraSelect.style.display = '';
        } catch (e) {
            cameraSelect.style.display = 'none';
        }
    }

    cameraSelect.addEventListener('change', () => {
        if (scanningActive) {
            stopCamera();
            startCamera();
        }
    });

    // ── Camera start / stop ───────────────────────────────────────────────────
    async function startCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showMessage('Camera access is not supported in this browser.', 'error');
            return;
        }

        const constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width:  { ideal: 1280 },
                height: { ideal: 960 }
            },
            audio: false
        };

        // If a specific camera is selected, use its deviceId
        const selectedId = cameraSelect.value;
        if (selectedId) {
            constraints.video = { deviceId: { exact: selectedId } };
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            await video.play();

            scanningActive = true;
            startCamBtn.style.display = 'none';
            stopCamBtn.style.display = '';
            videoWrap.classList.add('scanning');
            camHint.textContent = 'Hold a QR code in front of the camera.';
            clearResult();

            // Enumerate cameras now that permission is granted (labels are available)
            await enumerateCameras();

            requestAnimationFrame(scanFrame);
        } catch (err) {
            const msg = err.name === 'NotAllowedError'
                ? 'Camera permission denied. Allow camera access and try again.'
                : err.name === 'NotFoundError'
                ? 'No camera found on this device.'
                : `Camera error: ${err.message}`;
            showMessage(msg, 'error');
        }
    }

    function stopCamera() {
        scanningActive = false;

        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }

        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }

        video.srcObject = null;
        startCamBtn.style.display = '';
        stopCamBtn.style.display = 'none';
        cameraSelect.style.display = 'none';
        videoWrap.classList.remove('scanning', 'detected', 'flash');
        camHint.textContent = 'Click "Start Camera" to begin scanning.';
    }

    startCamBtn.addEventListener('click', startCamera);
    stopCamBtn.addEventListener('click', stopCamera);

    // ── Real-time scan loop ───────────────────────────────────────────────────
    function scanFrame() {
        if (!scanningActive) return;

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const ctx = overlayCanvas.getContext('2d', { willReadFrequently: true });
            const w = video.videoWidth;
            const h = video.videoHeight;

            if (w > 0 && h > 0) {
                overlayCanvas.width  = w;
                overlayCanvas.height = h;
                ctx.drawImage(video, 0, 0, w, h);

                const imageData = ctx.getImageData(0, 0, w, h);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'dontInvert'
                });

                if (code) {
                    showResult(code.data);
                }
            }
        }

        animFrameId = requestAnimationFrame(scanFrame);
    }

    // ── Upload: drag-and-drop & file input ────────────────────────────────────
    uploadDrop.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadDrop.classList.add('dragover');
    });

    uploadDrop.addEventListener('dragleave', () => {
        uploadDrop.classList.remove('dragover');
    });

    uploadDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadDrop.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleUploadedFile(file);
    });

    uploadInput.addEventListener('change', () => {
        const file = uploadInput.files[0];
        if (file) handleUploadedFile(file);
    });

    function handleUploadedFile(file) {
        if (!file.type.startsWith('image/')) {
            showMessage('Please upload an image file (PNG, JPG, GIF, WebP, etc.).', 'error');
            return;
        }

        clearResult();
        uploadLabel.textContent = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Show preview
                uploadPreview.src = e.target.result;
                uploadPreviewWrap.style.display = '';

                // Decode with jsQR
                const canvas = document.createElement('canvas');
                canvas.width  = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'attemptBoth'
                });

                if (code) {
                    showResult(code.data);
                } else {
                    showMessage('No QR code found in this image. Try a clearer or higher-resolution photo.', 'error');
                }
            };
            img.onerror = () => {
                showMessage('Could not load the image. Please try a different file.', 'error');
            };
            img.src = e.target.result;
        };
        reader.onerror = () => {
            showMessage('Could not read the file. Please try again.', 'error');
        };
        reader.readAsDataURL(file);
    }

    // ── Clean up on page unload ───────────────────────────────────────────────
    window.addEventListener('beforeunload', stopCamera);

})();
