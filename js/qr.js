// qr.js
// Requires: qrcode.min.js loaded BEFORE this script

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('qr-form');
  const input = document.getElementById('qr-input');
  const output = document.getElementById('qr-output');

  let qrCodeInstance = null;

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const text = input.value.trim();
    output.innerHTML = ''; // Clear previous QR and errors

    if (!text) {
      const error = document.createElement('p');
      error.className = 'qr-error';
      error.textContent = 'Please enter some text or a URL.';
      output.appendChild(error);
      return;
    }

    // Generate QR code
    const qrContainer = document.createElement('div');
    qrContainer.className = 'qr-code-container';
    output.appendChild(qrContainer);

    qrCodeInstance = new QRCode(qrContainer, {
      text: text,
      width: 256,
      height: 256,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });

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
