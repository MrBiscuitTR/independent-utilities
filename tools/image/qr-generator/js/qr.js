// qr.js
// Requires: qrcode.min.js loaded BEFORE this script

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('qr-form');
  const input = document.getElementById('qr-input');
  const output = document.getElementById('qr-output');

  let qrCodeInstance = null;

  // A QR symbol tops out at version 40; in byte mode with "H" error correction
  // the spec allows 1273 bytes, and this library manages 1270 before it walks
  // off the end of its block table and throws a TypeError — which used to leave
  // the page silently blank. Measured against the bundled qrcode.min.js.
  // The limit is in UTF-8 bytes, not characters: "é" and "🙂" cost 2 and 4.
  const MAX_BYTES = 1270;

  function byteLength(str) {
    return new TextEncoder().encode(str).length;
  }

  function showError(message) {
    output.innerHTML = '';
    const error = document.createElement('p');
    error.className = 'qr-error';
    error.textContent = message;
    output.appendChild(error);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const text = input.value.trim();
    output.innerHTML = ''; // Clear previous QR and errors

    if (!text) {
      showError('Please enter some text or a URL.');
      return;
    }

    const bytes = byteLength(text);
    if (bytes > MAX_BYTES) {
      showError(
        `That is too much data for a single QR code — ${bytes} bytes, and the ` +
        `format holds at most ${MAX_BYTES}. Shorten the text, or upload it ` +
        'somewhere and encode the link instead.'
      );
      return;
    }

    // Generate QR code
    const qrContainer = document.createElement('div');
    qrContainer.className = 'qr-code-container';
    output.appendChild(qrContainer);

    try {
      qrCodeInstance = new QRCode(qrContainer, {
        text: text,
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (err) {
      console.error(err);
      showError('Could not generate a QR code from that input.');
      return;
    }

    // Add download button after short delay (QR is rendered async)
    setTimeout(() => {
      const canvas = qrContainer.querySelector('canvas');
      if (canvas) {
        const downloadBtn = document.createElement('a');
        downloadBtn.className = 'qr-download';
        downloadBtn.textContent = 'Download QR Code';
        downloadBtn.href = canvas.toDataURL('image/png');
        downloadBtn.download = 'qr-code.png';
        qrContainer.appendChild(downloadBtn);
      }
    }, 200);
  });
});
