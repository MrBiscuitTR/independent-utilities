// Hash Generator & Tools
// ─────────────────────────────────────────────────────────────────────────────
// SHA-1, SHA-256, SHA-384, SHA-512 → Web Crypto API (built-in, no deps)
// MD5, CRC32, RIPEMD-160           → pure-JS implementations below
// Nothing is sent to any server; all computation runs locally.
// ─────────────────────────────────────────────────────────────────────────────

(function () {

    // ── Algorithm definitions ─────────────────────────────────────────────
    // common: always visible. extra: collapsed under "More algorithms".
    const COMMON_ALGOS = [
        { id: 'MD5',     label: 'MD5',     fn: 'md5'    },
        { id: 'SHA-1',   label: 'SHA-1',   fn: 'webcrypto' },
        { id: 'SHA-256', label: 'SHA-256', fn: 'webcrypto' },
        { id: 'SHA-512', label: 'SHA-512', fn: 'webcrypto' },
    ];

    const EXTRA_ALGOS = [
        { id: 'SHA-384',    label: 'SHA-384',    fn: 'webcrypto' },
        { id: 'SHA-224',    label: 'SHA-224',    fn: 'sha224'    },
        { id: 'RIPEMD-160', label: 'RIPEMD-160', fn: 'ripemd160' },
        { id: 'CRC32',      label: 'CRC32',      fn: 'crc32'     },
    ];

    // ── DOM refs ──────────────────────────────────────────────────────────
    const textInput       = document.getElementById('textInput');
    const fileInput       = document.getElementById('fileInput');
    const fileDrop        = document.getElementById('fileDrop');
    const fileLabel       = document.getElementById('fileLabel');
    const fileProgress    = document.getElementById('fileProgress');
    const fileProgressBar = document.getElementById('fileProgressBar');
    const hashTableCommon = document.getElementById('hashTableCommon');
    const hashTableExtra  = document.getElementById('hashTableExtra');
    const uppercaseToggle = document.getElementById('uppercaseToggle');
    const hmacKey         = document.getElementById('hmacKey');
    const hmacAlgo        = document.getElementById('hmacAlgo');
    const hmacValue       = document.getElementById('hmacValue');
    const hmacAlgoLabel   = document.getElementById('hmacAlgoLabel');
    const compareInput    = document.getElementById('compareInput');
    const compareResult   = document.getElementById('compareResult');
    const identifyInput   = document.getElementById('identifyInput');
    const identifyResult  = document.getElementById('identifyResult');
    const jwtInput        = document.getElementById('jwtInput');
    const jwtResult       = document.getElementById('jwtResult');
    const b64Input        = document.getElementById('b64Input');
    const b64Output       = document.getElementById('b64Output');
    const b64Error        = document.getElementById('b64Error');

    let currentMode  = 'text';
    let currentBytes = null; // ArrayBuffer for file mode
    // Stores all computed hashes keyed by algo id for compare lookups
    const computedHashes = {};

    // ── Mode tabs ─────────────────────────────────────────────────────────
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentMode = tab.dataset.mode;
            document.getElementById('textInputWrap').style.display  = currentMode === 'text' ? '' : 'none';
            document.getElementById('fileInputWrap').style.display  = currentMode === 'file' ? '' : 'none';
            run();
        });
    });

    uppercaseToggle.addEventListener('change', () => {
        // Re-render already-computed hashes without rehashing
        applyCase();
        updateCompare();
    });

    // ── Text input ────────────────────────────────────────────────────────
    textInput.addEventListener('input', run);

    // ── File input — label[for] handles click natively, no extra JS needed
    // We only need drag-and-drop and the change event.
    fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));

    fileDrop.addEventListener('dragover',  e => { e.preventDefault(); fileDrop.classList.add('dragover'); });
    fileDrop.addEventListener('dragleave', ()  => fileDrop.classList.remove('dragover'));
    fileDrop.addEventListener('drop', e => {
        e.preventDefault();
        fileDrop.classList.remove('dragover');
        loadFile(e.dataTransfer.files[0]);
    });

    function loadFile(f) {
        if (!f) return;
        fileLabel.textContent = `${f.name} (${formatSize(f.size)})`;
        fileProgress.classList.remove('hidden');
        fileProgressBar.style.width = '0%';

        const reader = new FileReader();
        reader.onprogress = e => {
            if (e.lengthComputable) fileProgressBar.style.width = (e.loaded / e.total * 100) + '%';
        };
        reader.onload = e => {
            fileProgressBar.style.width = '100%';
            setTimeout(() => fileProgress.classList.add('hidden'), 600);
            currentBytes = e.target.result;
            run();
        };
        reader.readAsArrayBuffer(f);
    }

    // ── Main runner ───────────────────────────────────────────────────────
    function run() {
        let buf;
        if (currentMode === 'text') {
            buf = new TextEncoder().encode(textInput.value).buffer;
        } else {
            buf = currentBytes;
        }
        buildTable(hashTableCommon, COMMON_ALGOS, buf);
        buildTable(hashTableExtra,  EXTRA_ALGOS,  buf);
        updateHmac(buf);
    }

    // ── Build a hash table section ────────────────────────────────────────
    function buildTable(container, algos, buf) {
        container.innerHTML = algos.map(a => `
            <div class="hash-row" id="row-${a.id}">
                <span class="hash-algo">${a.label}</span>
                <span class="hash-value${buf ? ' computing' : ''}" id="val-${a.id}">${buf ? 'computing…' : '—'}</span>
                <button class="hash-copy" data-target="val-${a.id}">Copy</button>
            </div>`).join('');

        container.querySelectorAll('.hash-copy').forEach(btn => {
            btn.addEventListener('click', function () {
                const el = document.getElementById(this.dataset.target);
                navigator.clipboard.writeText(el.textContent).then(() => {
                    this.textContent = 'Copied!';
                    this.classList.add('copied');
                    setTimeout(() => { this.textContent = 'Copy'; this.classList.remove('copied'); }, 1800);
                });
            });
        });

        if (!buf) { Object.assign(computedHashes, Object.fromEntries(algos.map(a => [a.id, null]))); return; }

        algos.forEach(async a => {
            const el = document.getElementById(`val-${a.id}`);
            try {
                let hex;
                switch (a.fn) {
                    case 'webcrypto': hex = bufToHex(await crypto.subtle.digest(a.id, buf)); break;
                    case 'md5':       hex = md5(buf);      break;
                    case 'sha224':    hex = sha224(buf);   break;
                    case 'ripemd160': hex = ripemd160(buf); break;
                    case 'crc32':     hex = crc32(buf).toString(16).padStart(8, '0'); break;
                }
                computedHashes[a.id] = hex;
                el.textContent = uppercaseToggle.checked ? hex.toUpperCase() : hex;
                el.className = 'hash-value';
                updateCompare();
            } catch (e) {
                el.textContent = 'error';
                el.className = 'hash-value';
            }
        });
    }

    function applyCase() {
        [...COMMON_ALGOS, ...EXTRA_ALGOS].forEach(a => {
            const el = document.getElementById(`val-${a.id}`);
            if (!el || !computedHashes[a.id]) return;
            const h = computedHashes[a.id];
            el.textContent = uppercaseToggle.checked ? h.toUpperCase() : h;
        });
        if (computedHashes['hmac']) {
            hmacValue.textContent = uppercaseToggle.checked
                ? computedHashes['hmac'].toUpperCase()
                : computedHashes['hmac'];
        }
    }

    // ── HMAC ──────────────────────────────────────────────────────────────
    hmacKey.addEventListener('input',  run);
    hmacAlgo.addEventListener('change', () => {
        hmacAlgoLabel.textContent = 'HMAC-' + hmacAlgo.value;
        run();
    });

    async function updateHmac(buf) {
        const keyStr = hmacKey.value;
        if (!keyStr || !buf) { hmacValue.textContent = '—'; computedHashes['hmac'] = null; return; }
        try {
            const key = await crypto.subtle.importKey(
                'raw', new TextEncoder().encode(keyStr),
                { name: 'HMAC', hash: hmacAlgo.value },
                false, ['sign']
            );
            const sig = await crypto.subtle.sign('HMAC', key, buf);
            const hex = bufToHex(sig);
            computedHashes['hmac'] = hex;
            hmacValue.textContent = uppercaseToggle.checked ? hex.toUpperCase() : hex;
        } catch (e) { hmacValue.textContent = 'error'; }
    }

    // Hook copy on static HMAC row
    document.querySelector('[data-target="hmacValue"]').addEventListener('click', function () {
        navigator.clipboard.writeText(hmacValue.textContent).then(() => {
            this.textContent = 'Copied!';
            this.classList.add('copied');
            setTimeout(() => { this.textContent = 'Copy'; this.classList.remove('copied'); }, 1800);
        });
    });

    // ── Compare / verify ──────────────────────────────────────────────────
    compareInput.addEventListener('input', updateCompare);

    function updateCompare() {
        const target = compareInput.value.trim().toLowerCase();
        // Clear all highlights first
        [...COMMON_ALGOS, ...EXTRA_ALGOS].forEach(a => {
            const el = document.getElementById(`val-${a.id}`);
            if (el) el.classList.remove('match');
        });

        if (!target) { compareResult.className = 'compare-result hidden'; return; }

        let matched = false;
        [...COMMON_ALGOS, ...EXTRA_ALGOS].forEach(a => {
            const el = document.getElementById(`val-${a.id}`);
            if (el && computedHashes[a.id] && computedHashes[a.id].toLowerCase() === target) {
                matched = true;
                el.classList.add('match');
            }
        });

        compareResult.classList.remove('hidden', 'match', 'no-match');
        if (matched) {
            compareResult.textContent = '✓ Match found!';
            compareResult.classList.add('match');
        } else {
            compareResult.textContent = '✗ No match with current input';
            compareResult.classList.add('no-match');
        }
    }

    // ── Hash / Token Identifier ───────────────────────────────────────────
    identifyInput.addEventListener('input', identify);

    function identify() {
        const raw = identifyInput.value.trim();
        identifyResult.innerHTML = '';
        if (!raw) return;

        const results = [];

        // JWT detection (three base64url parts separated by dots)
        if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(raw)) {
            results.push({ label: 'JSON Web Token (JWT)', confidence: 'high',
                detail: 'Three dot-separated Base64URL segments. Use the JWT Decoder panel below.' });
        }

        // Base64 (standard or URL-safe)
        if (/^[A-Za-z0-9+/]+=*$/.test(raw) && raw.length % 4 === 0 && raw.length >= 4) {
            results.push({ label: 'Base64 encoded', confidence: 'medium',
                detail: `Decoded length ≈ ${Math.floor(raw.replace(/=+$/, '').length * 0.75)} bytes` });
        }
        if (/^[A-Za-z0-9_-]+=*$/.test(raw) && raw.length >= 4) {
            results.push({ label: 'Base64URL encoded', confidence: 'medium', detail: '' });
        }

        // Hex hash identification by length
        if (/^[0-9a-fA-F]+$/.test(raw)) {
            const len = raw.length;
            const hexMap = {
                8:  [{ name: 'CRC-32',    detail: '32-bit cyclic redundancy check' }],
                32: [{ name: 'MD5',       detail: 'MD5 (128-bit) — not collision-resistant' },
                     { name: 'NTLM',      detail: 'Windows NTLM password hash (128-bit)' }],
                40: [{ name: 'SHA-1',     detail: 'SHA-1 (160-bit) — deprecated for security use' },
                     { name: 'RIPEMD-160',detail: 'RIPEMD-160 (160-bit)' }],
                56: [{ name: 'SHA-224',   detail: 'SHA-224 (224-bit)' }],
                64: [{ name: 'SHA-256',   detail: 'SHA-256 (256-bit) — widely used' }],
                96: [{ name: 'SHA-384',   detail: 'SHA-384 (384-bit)' }],
                128:[{ name: 'SHA-512',   detail: 'SHA-512 (512-bit)' }],
            };
            if (hexMap[len]) {
                hexMap[len].forEach(m => results.push({
                    label: `Possible: ${m.name}`, confidence: 'high', detail: m.detail
                }));
            } else {
                results.push({ label: `Hex string (${len} chars = ${len / 2} bytes)`, confidence: 'low', detail: '' });
            }
        }

        // bcrypt
        if (/^\$2[ayb]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(raw)) {
            results.push({ label: 'bcrypt hash', confidence: 'high',
                detail: 'Adaptive password hash. Cost factor: ' + raw.split('$')[2] });
        }

        // Argon2
        if (raw.startsWith('$argon2')) {
            results.push({ label: 'Argon2 hash', confidence: 'high',
                detail: 'Memory-hard password hashing function (Argon2i/Argon2d/Argon2id)' });
        }

        // scrypt / PBKDF2 (PHC string format)
        if (raw.startsWith('$scrypt$') || raw.startsWith('$pbkdf2')) {
            results.push({ label: 'Password Hash (PHC format)', confidence: 'high', detail: raw.split('$')[1] + ' algorithm' });
        }

        // SSH key types
        if (raw.startsWith('ssh-rsa ') || raw.startsWith('ssh-ed25519 ') || raw.startsWith('ecdsa-sha2-')) {
            results.push({ label: 'SSH Public Key', confidence: 'high', detail: raw.split(' ')[0] + ' key type' });
        }

        // UUID
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
            const v = raw[14];
            results.push({ label: `UUID v${v}`, confidence: 'high', detail: 'Universally Unique Identifier' });
        }

        if (results.length === 0) {
            results.push({ label: 'Unknown format', confidence: 'low', detail: `Length: ${raw.length} characters` });
        }

        identifyResult.innerHTML = results.map(r => `
            <div>
                <div class="identify-tag ${r.confidence}">${r.label}</div>
                ${r.detail ? `<div class="identify-detail">${r.detail}</div>` : ''}
            </div>`).join('');
    }

    // ── JWT Decoder ───────────────────────────────────────────────────────
    jwtInput.addEventListener('input', decodeJwt);

    function decodeJwt() {
        const raw = jwtInput.value.trim();
        jwtResult.innerHTML = '';
        if (!raw) return;

        const parts = raw.split('.');
        if (parts.length < 2 || parts.length > 3) {
            jwtResult.innerHTML = '<span class="jwt-error">Not a valid JWT (expected 2–3 dot-separated parts).</span>';
            return;
        }

        const labels  = ['Header', 'Payload', 'Signature'];
        const classes = ['header', 'payload', 'sig'];

        parts.forEach((part, i) => {
            let content;
            if (i < 2) {
                try {
                    // Base64URL → Base64 → JSON
                    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
                    const pad = b64 + '=='.slice(0, (4 - b64.length % 4) % 4);
                    const json = JSON.parse(atob(pad));
                    content = JSON.stringify(json, null, 2);
                    // Annotate exp/iat timestamps
                    if (i === 1 && (json.exp || json.iat || json.nbf)) {
                        const ts = {};
                        ['exp', 'iat', 'nbf'].forEach(k => {
                            if (json[k]) ts[k] = new Date(json[k] * 1000).toISOString();
                        });
                        content += '\n\n// Timestamps (UTC):\n' +
                            Object.entries(ts).map(([k, v]) => `// ${k}: ${v}`).join('\n');
                    }
                } catch {
                    content = `[Could not decode — raw: ${part}]`;
                }
            } else {
                content = part + '\n(signature — verify with secret/public key)';
            }

            jwtResult.innerHTML += `
                <div class="jwt-part ${classes[i]}">
                    <div class="jwt-part-label">${labels[i]}</div>
                    <pre>${escHtml(content)}</pre>
                </div>`;
        });
    }

    // ── Base64 ────────────────────────────────────────────────────────────
    document.getElementById('b64EncodeBtn').addEventListener('click', () => {
        b64Error.classList.add('hidden');
        try {
            b64Output.value = btoa(unescape(encodeURIComponent(b64Input.value)));
        } catch (e) {
            b64Error.textContent = 'Encode error: ' + e.message;
            b64Error.classList.remove('hidden');
        }
    });

    document.getElementById('b64DecodeBtn').addEventListener('click', () => {
        b64Error.classList.add('hidden');
        try {
            b64Output.value = decodeURIComponent(escape(atob(b64Input.value.trim())));
        } catch (e) {
            b64Error.textContent = 'Invalid Base64: ' + e.message;
            b64Error.classList.remove('hidden');
        }
    });

    // ── Utilities ─────────────────────────────────────────────────────────
    function bufToHex(buf) {
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function formatSize(bytes) {
        if (bytes < 1024)          return bytes + ' B';
        if (bytes < 1024 * 1024)   return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }

    function escHtml(str) {
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── MD5 (RFC 1321) — pure JS ──────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════
    function md5(arrayBuffer) {
        const msg8    = new Uint8Array(arrayBuffer);
        const len8    = msg8.length;
        const extra   = 64 - ((len8 + 9) % 64 || 64);
        const padded  = new Uint8Array(len8 + extra + 9);
        padded.set(msg8);
        padded[len8] = 0x80;
        const bitLen = len8 * 8;
        for (let i = 0; i < 8; i++) padded[padded.length - 8 + i] = (bitLen / Math.pow(2, i * 8)) & 0xff;
        const words = new Uint32Array(padded.buffer);
        let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
        const K = new Uint32Array(64);
        for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
        const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
                   5, 9,14,20,5, 9,14,20,5, 9,14,20,5, 9,14,20,
                   4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
                   6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
        for (let blk = 0; blk < words.length; blk += 16) {
            let A = a0, B = b0, C = c0, D = d0;
            for (let i = 0; i < 64; i++) {
                let F, g;
                if      (i < 16) { F = (B & C) | (~B & D); g = i; }
                else if (i < 32) { F = (D & B) | (~D & C); g = (5*i+1)%16; }
                else if (i < 48) { F = B ^ C ^ D;           g = (3*i+5)%16; }
                else             { F = C ^ (B | ~D);         g = (7*i)%16;   }
                F = (F + A + K[i] + words[blk + g]) >>> 0;
                A = D; D = C; C = B;
                B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
            }
            a0=(a0+A)>>>0; b0=(b0+B)>>>0; c0=(c0+C)>>>0; d0=(d0+D)>>>0;
        }
        return [a0,b0,c0,d0].map(n =>
            (n&0xff).toString(16).padStart(2,'0') +
            ((n>>>8)&0xff).toString(16).padStart(2,'0') +
            ((n>>>16)&0xff).toString(16).padStart(2,'0') +
            ((n>>>24)&0xff).toString(16).padStart(2,'0')
        ).join('');
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── SHA-224 — pure JS (same as SHA-256 with different init + truncation)
    // ══════════════════════════════════════════════════════════════════════
    function sha224(buf) { return sha2_32(buf, true); }
    function sha256js(buf) { return sha2_32(buf, false); }

    function sha2_32(buf, is224) {
        const H = is224
            ? [0xc1059ed8,0x367cd507,0x3070dd17,0xf70e5939,0xffc00b31,0x68581511,0x64f98fa7,0xbefa4fa4]
            : [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
        const K = [
            0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
            0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
            0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
            0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
            0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
            0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
            0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
            0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
        ];
        const msg = new Uint8Array(buf);
        const len = msg.length;
        const bits = len * 8;
        const padLen = ((55 - len % 64 + 64) % 64) + 1;
        const padded = new Uint8Array(len + padLen + 8);
        padded.set(msg);
        padded[len] = 0x80;
        const dv = new DataView(padded.buffer);
        dv.setUint32(padded.length - 4, bits >>> 0, false);
        dv.setUint32(padded.length - 8, Math.floor(bits / 0x100000000), false);

        const h = [...H];
        for (let i = 0; i < padded.length; i += 64) {
            const w = new Array(64);
            for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
            for (let j = 16; j < 64; j++) {
                const s0 = rotr(w[j-15],7) ^ rotr(w[j-15],18) ^ (w[j-15] >>> 3);
                const s1 = rotr(w[j-2],17) ^ rotr(w[j-2],19)  ^ (w[j-2] >>> 10);
                w[j] = (w[j-16] + s0 + w[j-7] + s1) >>> 0;
            }
            let [a,b,c,d,e,f,g,hh] = h;
            for (let j = 0; j < 64; j++) {
                const S1 = rotr(e,6)^rotr(e,11)^rotr(e,25);
                const ch = (e&f)^(~e&g);
                const t1 = (hh+S1+ch+K[j]+w[j]) >>> 0;
                const S0 = rotr(a,2)^rotr(a,13)^rotr(a,22);
                const maj = (a&b)^(a&c)^(b&c);
                const t2 = (S0+maj) >>> 0;
                hh=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
            }
            const arr = [a,b,c,d,e,f,g,hh];
            for (let j = 0; j < 8; j++) h[j] = (h[j] + arr[j]) >>> 0;
        }
        return h.slice(0, is224 ? 7 : 8).map(v => v.toString(16).padStart(8,'0')).join('');
    }

    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

    // ══════════════════════════════════════════════════════════════════════
    // ── RIPEMD-160 — pure JS ──────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════
    function ripemd160(arrayBuffer) {
        const msg   = new Uint8Array(arrayBuffer);
        const len8  = msg.length;
        const extra = 64 - ((len8 + 9) % 64 || 64);
        const padded= new Uint8Array(len8 + extra + 9);
        padded.set(msg);
        padded[len8] = 0x80;
        const bits = len8 * 8;
        for (let i = 0; i < 8; i++) padded[padded.length - 8 + i] = (bits / Math.pow(2, i*8)) & 0xff;
        const M = new Uint32Array(padded.buffer);

        let h0=0x67452301, h1=0xefcdab89, h2=0x98badcfe, h3=0x10325476, h4=0xc3d2e1f0;

        const RL  = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8,3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12,1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2,4,0,5,9,7,12,2,10,14,1,3,8,11,6,15,13];
        const RR  = [5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12,6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2,15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13,8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14,12,15,10,4,1,5,8,7,6,2,13,14,0,3,9,11];
        const SL  = [11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8,7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12,11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5,11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12,9,15,5,11,6,8,13,12,5,12,13,14,11,8,5,6];
        const SR  = [8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6,9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11,9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5,15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8,8,5,12,9,12,5,14,6,8,13,6,5,15,13,11,11];
        const KL  = [0,0x5a827999,0x6ed9eba1,0x8f1bbcdc,0xa953fd4e];
        const KR  = [0x50a28be6,0x5c4dd124,0x6d703ef3,0x7a6d76e9,0];

        function F(j,x,y,z){ return j<16?x^y^z:j<32?(x&y)|(~x&z):j<48?(x|~y)^z:j<64?(x&z)|(y&~z):x^(y|~z); }
        function rol32(x,n){ return (x<<n)|(x>>>(32-n)); }
        function add(...a){ return a.reduce((s,v)=>(s+v)>>>0,0); }

        for (let i = 0; i < M.length; i += 16) {
            let al=h0,bl=h1,cl=h2,dl=h3,el=h4;
            let ar=h0,br=h1,cr=h2,dr=h3,er=h4;
            for (let j = 0; j < 80; j++) {
                const kl = Math.floor(j/16);
                let t = add(rol32(add(al,F(j,bl,cl,dl),M[i+RL[j]],KL[kl]>>>0),SL[j]),el);
                al=el; el=dl; dl=rol32(cl,10); cl=bl; bl=t;
                const kr = Math.floor(j/16);
                t = add(rol32(add(ar,F(79-j,br,cr,dr),M[i+RR[j]],KR[kr]>>>0),SR[j]),er);
                ar=er; er=dr; dr=rol32(cr,10); cr=br; br=t;
            }
            const t = add(h1,cl,dr);
            h1=add(h2,dl,er); h2=add(h3,el,ar); h3=add(h4,al,br); h4=add(h0,bl,cr); h0=t;
        }
        return [h0,h1,h2,h3,h4].map(v=>{
            const b = new Uint8Array(4);
            new DataView(b.buffer).setUint32(0,v,true);
            return [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
        }).join('');
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── CRC-32 — pure JS ──────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════
    function crc32(arrayBuffer) {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            table[i] = c;
        }
        let crc = 0xffffffff;
        const bytes = new Uint8Array(arrayBuffer);
        for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
        return ((crc ^ 0xffffffff) >>> 0);
    }

    // ── Init ──────────────────────────────────────────────────────────────
    run();

})();
