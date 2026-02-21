// Hash Generator
// SHA-1, SHA-256, SHA-384, SHA-512 — Web Crypto API (no external deps)
// MD5 — pure JS implementation below (Web Crypto does not support MD5)
// Nothing is sent to any server; all computation is local.

(function () {

    const ALGORITHMS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

    const textInput      = document.getElementById('textInput');
    const fileInput      = document.getElementById('fileInput');
    const fileDrop       = document.getElementById('fileDrop');
    const fileLabel      = document.getElementById('fileLabel');
    const hashTable      = document.getElementById('hashTable');
    const uppercaseToggle= document.getElementById('uppercaseToggle');
    const hmacKey        = document.getElementById('hmacKey');
    const hmacAlgo       = document.getElementById('hmacAlgo');
    const hmacValue      = document.getElementById('hmacValue');
    const compareInput   = document.getElementById('compareInput');
    const compareResult  = document.getElementById('compareResult');

    let currentMode = 'text';
    let currentBytes = null; // ArrayBuffer for file mode

    // ── Mode tabs ─────────────────────────────────────────────────────────
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentMode = tab.dataset.mode;
            document.getElementById('textInputWrap').style.display = currentMode === 'text' ? '' : 'none';
            document.getElementById('fileInputWrap').style.display = currentMode === 'file' ? '' : 'none';
            run();
        });
    });

    uppercaseToggle.addEventListener('change', run);

    // ── Text input ────────────────────────────────────────────────────────
    textInput.addEventListener('input', run);

    // ── File input ────────────────────────────────────────────────────────
    fileInput.addEventListener('change', () => {
        const f = fileInput.files[0];
        if (!f) return;
        fileLabel.textContent = `${f.name} (${formatSize(f.size)})`;
        const reader = new FileReader();
        reader.onload = e => { currentBytes = e.target.result; run(); };
        reader.readAsArrayBuffer(f);
    });

    // Drag-and-drop
    fileDrop.addEventListener('click', () => fileInput.click());
    fileDrop.addEventListener('dragover', e => { e.preventDefault(); fileDrop.classList.add('dragover'); });
    fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('dragover'));
    fileDrop.addEventListener('drop', e => {
        e.preventDefault();
        fileDrop.classList.remove('dragover');
        const f = e.dataTransfer.files[0];
        if (!f) return;
        fileLabel.textContent = `${f.name} (${formatSize(f.size)})`;
        const reader = new FileReader();
        reader.onload = ev => { currentBytes = ev.target.result; run(); };
        reader.readAsArrayBuffer(f);
    });

    // ── Main runner ───────────────────────────────────────────────────────
    function run() {
        let buf;
        if (currentMode === 'text') {
            buf = new TextEncoder().encode(textInput.value).buffer;
        } else {
            buf = currentBytes;
        }
        renderTable(buf);
        updateHmac(buf);
    }

    // ── Build hash table ──────────────────────────────────────────────────
    function renderTable(buf) {
        hashTable.innerHTML = ALGORITHMS.map(algo => `
            <div class="hash-row" id="row-${algo}">
                <span class="hash-algo">${algo}</span>
                <span class="hash-value computing" id="val-${algo}">computing…</span>
                <button class="hash-copy" data-target="val-${algo}">Copy</button>
            </div>`).join('');

        // Copy buttons
        hashTable.querySelectorAll('.hash-copy').forEach(btn => {
            btn.addEventListener('click', function () {
                const el = document.getElementById(this.dataset.target);
                navigator.clipboard.writeText(el.textContent).then(() => {
                    this.textContent = 'Copied!';
                    this.classList.add('copied');
                    setTimeout(() => { this.textContent = 'Copy'; this.classList.remove('copied'); }, 1800);
                });
            });
        });

        if (!buf) {
            ALGORITHMS.forEach(algo => {
                const el = document.getElementById(`val-${algo}`);
                el.textContent = '—';
                el.className = 'hash-value';
            });
            return;
        }

        ALGORITHMS.forEach(async algo => {
            const el = document.getElementById(`val-${algo}`);
            try {
                let hex;
                if (algo === 'MD5') {
                    hex = md5(buf);
                } else {
                    const digest = await crypto.subtle.digest(algo, buf);
                    hex = bufToHex(digest);
                }
                el.textContent = uppercaseToggle.checked ? hex.toUpperCase() : hex;
                el.className = 'hash-value';
                updateCompare();
            } catch (e) {
                el.textContent = 'error';
                el.className = 'hash-value';
            }
        });
    }

    // ── HMAC ──────────────────────────────────────────────────────────────
    hmacKey.addEventListener('input', () => run());
    hmacAlgo.addEventListener('change', () => {
        document.querySelector('#hmacRow .hash-algo').textContent = 'HMAC-' + hmacAlgo.value;
        run();
    });

    async function updateHmac(buf) {
        const keyStr = hmacKey.value;
        if (!keyStr || !buf) { hmacValue.textContent = '—'; return; }
        try {
            const keyBuf = new TextEncoder().encode(keyStr);
            const algo   = hmacAlgo.value;
            const key    = await crypto.subtle.importKey(
                'raw', keyBuf,
                { name: 'HMAC', hash: algo },
                false, ['sign']
            );
            const sig = await crypto.subtle.sign('HMAC', key, buf);
            let hex   = bufToHex(sig);
            hmacValue.textContent = uppercaseToggle.checked ? hex.toUpperCase() : hex;
        } catch (e) {
            hmacValue.textContent = 'error';
        }
    }

    // ── Compare / verify ──────────────────────────────────────────────────
    compareInput.addEventListener('input', updateCompare);

    function updateCompare() {
        const target = compareInput.value.trim().toLowerCase();
        if (!target) { compareResult.className = 'compare-result hidden'; return; }

        // Find any matching hash value
        let matched = false;
        ALGORITHMS.forEach(algo => {
            const el = document.getElementById(`val-${algo}`);
            if (el && el.textContent.toLowerCase() === target) {
                matched = true;
                el.classList.add('match');
            } else if (el) {
                el.classList.remove('match', 'no-match');
            }
        });

        compareResult.classList.remove('hidden', 'match', 'no-match');
        if (matched) {
            compareResult.textContent = '✓ Match found!';
            compareResult.classList.add('match');
        } else {
            compareResult.textContent = '✗ No match';
            compareResult.classList.add('no-match');
        }
    }

    // ── Utilities ─────────────────────────────────────────────────────────
    function bufToHex(buf) {
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }

    // ── MD5 (pure JS) ─────────────────────────────────────────────────────
    // RFC 1321 compliant implementation — no external library needed.
    function md5(arrayBuffer) {
        const msg8 = new Uint8Array(arrayBuffer);
        // Convert to array of 32-bit LE words
        const length8 = msg8.length;
        const extraBytes = 64 - ((length8 + 9) % 64 || 64);
        const padded = new Uint8Array(length8 + extraBytes + 9);
        padded.set(msg8);
        padded[length8] = 0x80;
        const bitLen = length8 * 8;
        // Append length in bits as 64-bit LE
        for (let i = 0; i < 8; i++) padded[padded.length - 8 + i] = (bitLen / Math.pow(2, i * 8)) & 0xff;

        const words = new Uint32Array(padded.buffer);

        let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

        const K = new Uint32Array(64);
        const S = [7,12,17,22, 7,12,17,22, 7,12,17,22, 7,12,17,22,
                   5, 9,14,20, 5, 9,14,20, 5, 9,14,20, 5, 9,14,20,
                   4,11,16,23, 4,11,16,23, 4,11,16,23, 4,11,16,23,
                   6,10,15,21, 6,10,15,21, 6,10,15,21, 6,10,15,21];
        for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;

        for (let blk = 0; blk < words.length; blk += 16) {
            let A = a0, B = b0, C = c0, D = d0;
            for (let i = 0; i < 64; i++) {
                let F, g;
                if (i < 16)       { F = (B & C) | (~B & D); g = i; }
                else if (i < 32)  { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
                else if (i < 48)  { F = B ^ C ^ D;           g = (3 * i + 5) % 16; }
                else              { F = C ^ (B | ~D);         g = (7 * i) % 16; }
                F = (F + A + K[i] + words[blk + g]) >>> 0;
                A = D; D = C; C = B;
                B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
            }
            a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0;
            c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
        }

        return [a0, b0, c0, d0].map(n => {
            return ((n & 0xff).toString(16).padStart(2,'0')) +
                   (((n >>> 8)  & 0xff).toString(16).padStart(2,'0')) +
                   (((n >>> 16) & 0xff).toString(16).padStart(2,'0')) +
                   (((n >>> 24) & 0xff).toString(16).padStart(2,'0'));
        }).join('');
    }

    // ── Init ──────────────────────────────────────────────────────────────
    run();

})();
