// API Request Builder
// No external API dependencies — all requests are made directly from the browser via fetch().
// CORS limitations apply: cross-origin requests must be permitted by the target server.

(function () {

    // ── Element refs ──────────────────────────────────────────────────────
    const methodSelect   = document.getElementById('methodSelect');
    const urlInput       = document.getElementById('urlInput');
    const sendBtn        = document.getElementById('sendBtn');
    const requestPreview = document.getElementById('requestPreview');
    const responseCard   = document.getElementById('responseCard');
    const statusBadge    = document.getElementById('statusBadge');
    const timeBadge      = document.getElementById('timeBadge');
    const responsePretty = document.getElementById('responsePretty');
    const responseRaw    = document.getElementById('responseRaw');
    const responseHeaders= document.getElementById('responseHeaders');
    const snippetCode    = document.getElementById('snippetCode');
    const bodyTextarea   = document.getElementById('bodyTextarea');
    const bodyError      = document.getElementById('bodyError');
    const bodyEditor     = document.getElementById('bodyEditor');
    const bodyForm       = document.getElementById('bodyForm');
    const authFields     = document.getElementById('authFields');
    const extractedCode  = document.getElementById('extractedCode');

    let snippetLang = 'js';
    let lastResponse = null;

    // ── Tab switching ─────────────────────────────────────────────────────
    document.querySelectorAll('.section-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        });
    });

    // Response view tabs
    document.querySelectorAll('.resp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.resp-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.resp-view').forEach(v => v.style.display = 'none');
            tab.classList.add('active');
            const viewMap = { pretty: responsePretty, raw: responseRaw, headers: responseHeaders };
            viewMap[tab.dataset.view].style.display = '';
        });
    });

    // Snippet language tabs
    document.querySelectorAll('.snippet-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.snippet-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            snippetLang = tab.dataset.lang;
            updatePreview();
        });
    });

    // ── Body type ─────────────────────────────────────────────────────────
    document.querySelectorAll('input[name="bodyType"]').forEach(r => {
        r.addEventListener('change', () => {
            const v = r.value;
            bodyEditor.style.display = (v === 'json' || v === 'text') ? '' : 'none';
            bodyForm.style.display   = (v === 'form') ? '' : 'none';
            if (v === 'json') bodyTextarea.placeholder = '{\n  "key": "value"\n}';
            if (v === 'text') bodyTextarea.placeholder = 'Plain text body…';
            updatePreview();
        });
    });

    bodyTextarea.addEventListener('input', () => { validateBody(); updatePreview(); });

    function validateBody() {
        const bt = getBodyType();
        if (bt !== 'json') { bodyError.classList.add('hidden'); return; }
        try { JSON.parse(bodyTextarea.value); bodyError.classList.add('hidden'); }
        catch (e) { bodyError.textContent = 'Invalid JSON: ' + e.message; bodyError.classList.remove('hidden'); }
    }

    function getBodyType() {
        return document.querySelector('input[name="bodyType"]:checked')?.value || 'none';
    }

    // ── Auth type ─────────────────────────────────────────────────────────
    document.querySelectorAll('input[name="authType"]').forEach(r => {
        r.addEventListener('change', renderAuthFields);
    });

    function renderAuthFields() {
        const type = document.querySelector('input[name="authType"]:checked')?.value || 'none';
        authFields.innerHTML = '';
        if (type === 'bearer') {
            authFields.innerHTML = `
                <div class="auth-field-group">
                    <label>Token</label>
                    <input type="text" id="authToken" placeholder="your-token-here">
                </div>`;
            document.getElementById('authToken').addEventListener('input', updatePreview);
        } else if (type === 'basic') {
            authFields.innerHTML = `
                <div class="auth-field-group">
                    <label>Username</label>
                    <input type="text" id="authUser" placeholder="username">
                    <label>Password</label>
                    <input type="password" id="authPass" placeholder="password">
                </div>`;
            document.getElementById('authUser').addEventListener('input', updatePreview);
            document.getElementById('authPass').addEventListener('input', updatePreview);
        } else if (type === 'apikey') {
            authFields.innerHTML = `
                <div class="auth-field-group">
                    <label>Header name</label>
                    <input type="text" id="authKeyName" placeholder="X-API-Key">
                    <label>Value</label>
                    <input type="text" id="authKeyVal" placeholder="your-api-key">
                </div>`;
            document.getElementById('authKeyName').addEventListener('input', updatePreview);
            document.getElementById('authKeyVal').addEventListener('input', updatePreview);
        }
        updatePreview();
    }

    // ── Key-value list builder ────────────────────────────────────────────
    document.querySelectorAll('.add-row-btn').forEach(btn => {
        btn.addEventListener('click', () => addKvRow(btn.dataset.target));
    });

    function addKvRow(listId, key = '', value = '') {
        const list = document.getElementById(listId);
        const row  = document.createElement('div');
        row.className = 'kv-row';
        row.innerHTML = `
            <input type="text" placeholder="Key" value="${escAttr(key)}">
            <input type="text" placeholder="Value" value="${escAttr(value)}">
            <button class="kv-remove" title="Remove">✕</button>`;
        row.querySelector('.kv-remove').addEventListener('click', () => { row.remove(); updatePreview(); });
        row.querySelectorAll('input').forEach(i => i.addEventListener('input', updatePreview));
        list.appendChild(row);
        updatePreview();
    }

    function getKvPairs(listId) {
        const pairs = {};
        document.querySelectorAll(`#${listId} .kv-row`).forEach(row => {
            const [k, v] = row.querySelectorAll('input');
            if (k.value.trim()) pairs[k.value.trim()] = v.value;
        });
        return pairs;
    }

    // ── Live preview update ───────────────────────────────────────────────
    methodSelect.addEventListener('change', updatePreview);
    urlInput.addEventListener('input', updatePreview);

    function buildRequest() {
        const method  = methodSelect.value;
        const rawUrl  = urlInput.value.trim() || 'https://api.example.com/endpoint';
        const params  = getKvPairs('paramsList');
        const headers = getKvPairs('headersList');
        const bt      = getBodyType();

        // Auth
        const authType = document.querySelector('input[name="authType"]:checked')?.value || 'none';
        if (authType === 'bearer') {
            const tok = document.getElementById('authToken')?.value || '';
            if (tok) headers['Authorization'] = `Bearer ${tok}`;
        } else if (authType === 'basic') {
            const u = document.getElementById('authUser')?.value || '';
            const p = document.getElementById('authPass')?.value || '';
            if (u) headers['Authorization'] = 'Basic ' + btoa(`${u}:${p}`);
        } else if (authType === 'apikey') {
            const n = document.getElementById('authKeyName')?.value || 'X-API-Key';
            const v = document.getElementById('authKeyVal')?.value  || '';
            if (v) headers[n] = v;
        }

        // Build URL with params
        let url = rawUrl;
        const pEntries = Object.entries(params);
        if (pEntries.length) {
            const qs = pEntries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
            url += (url.includes('?') ? '&' : '?') + qs;
        }

        // Body
        let body = null;
        if (bt === 'json') {
            headers['Content-Type'] = 'application/json';
            body = bodyTextarea.value;
        } else if (bt === 'text') {
            headers['Content-Type'] = 'text/plain';
            body = bodyTextarea.value;
        } else if (bt === 'form') {
            const formPairs = getKvPairs('formList');
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            body = Object.entries(formPairs).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        }

        return { method, url, rawUrl, params, headers, body, bt };
    }

    function updatePreview() {
        const { method, url, headers, body } = buildRequest();

        // Request preview (HTTP-like format)
        let preview = `${method} ${url}\n`;
        Object.entries(headers).forEach(([k, v]) => { preview += `${k}: ${v}\n`; });
        if (body) preview += `\n${body}`;
        requestPreview.textContent = preview.trim();

        updateSnippet();
    }

    // ── Send request ──────────────────────────────────────────────────────
    sendBtn.addEventListener('click', async () => {
        const { method, url, headers, body } = buildRequest();

        sendBtn.textContent = 'Sending…';
        sendBtn.classList.add('loading');
        sendBtn.disabled = true;

        const t0 = Date.now();
        try {
            const opts = { method, headers };
            if (body && method !== 'GET' && method !== 'HEAD') opts.body = body;

            const res  = await fetch(url, opts);
            const ms   = Date.now() - t0;
            const text = await res.text();
            lastResponse = text;

            // Status badge
            const cls = res.status < 300 ? 'status-2xx'
                      : res.status < 400 ? 'status-3xx'
                      : res.status < 500 ? 'status-4xx' : 'status-5xx';
            statusBadge.textContent = `${res.status} ${res.statusText}`;
            statusBadge.className   = `status-badge ${cls}`;
            timeBadge.textContent   = `${ms}ms`;

            // Pretty (try JSON)
            try {
                const json = JSON.parse(text);
                responsePretty.textContent = JSON.stringify(json, null, 2);
            } catch {
                responsePretty.textContent = text;
            }

            // Raw
            responseRaw.textContent = text;

            // Headers
            const hdrLines = [];
            res.headers.forEach((v, k) => hdrLines.push(`${k}: ${v}`));
            responseHeaders.textContent = hdrLines.join('\n');

            renderFieldExtractor();
            responseCard.style.display = '';
        } catch (err) {
            responseCard.style.display = '';
            statusBadge.textContent = 'Error';
            statusBadge.className   = 'status-badge status-5xx';
            timeBadge.textContent   = '';
            responsePretty.textContent = err.message + '\n\nNote: CORS restrictions may prevent requests to external APIs from the browser.';
            lastResponse = null;
        } finally {
            sendBtn.textContent = 'Send';
            sendBtn.classList.remove('loading');
            sendBtn.disabled = false;
        }
    });

    // ── Field extractor ───────────────────────────────────────────────────
    function renderFieldExtractor() {
        // Add a default row if empty
        const fl = document.getElementById('fieldList');
        if (!fl.children.length) addKvRow('fieldList', 'myField', 'response.data');
    }

    // Observe field list changes to update extracted snippet
    document.getElementById('fieldList').addEventListener('input', updateExtracted);

    function updateExtracted() {
        if (!lastResponse) return;
        let parsed;
        try { parsed = JSON.parse(lastResponse); } catch { extractedCode.style.display = 'none'; return; }

        const fields = [];
        document.querySelectorAll('#fieldList .kv-row').forEach(row => {
            const [nameEl, pathEl] = row.querySelectorAll('input');
            const name = nameEl.value.trim();
            const path = pathEl.value.trim();
            if (name && path) fields.push({ name, path });
        });

        if (!fields.length) { extractedCode.style.display = 'none'; return; }

        let js = `const data = ${JSON.stringify(parsed, null, 2)};\n\n`;
        fields.forEach(f => { js += `const ${f.name} = data.${f.path};\n`; });
        js += '\n// Python equivalent:\n';
        js += `# data = response.json()\n`;
        fields.forEach(f => { js += `# ${f.name} = data["${f.path.replace(/\./g, '"]["')}"]\n`; });

        extractedCode.textContent = js;
        extractedCode.style.display = '';
    }

    // ── Code snippets ─────────────────────────────────────────────────────
    function updateSnippet() {
        const { method, url, headers, body } = buildRequest();
        const h = Object.entries(headers);

        if (snippetLang === 'js') {
            const hObj = h.length ? ',\n  headers: ' + JSON.stringify(headers, null, 4).replace(/\n/g, '\n  ') : '';
            const bStr = body ? `,\n  body: ${JSON.stringify(body)}` : '';
            snippetCode.textContent =
`const response = await fetch(${JSON.stringify(url)}, {
  method: ${JSON.stringify(method)}${hObj}${bStr}
});

const data = await response.json();
console.log(data);

// Or as text:
// const text = await response.text();`;
        } else if (snippetLang === 'py') {
            const imp  = body ? 'import requests\nimport json\n' : 'import requests\n';
            const hStr = h.length ? `\nheaders = ${pyDict(headers)}\n` : '';
            const bStr = body ? `\nbody = ${JSON.stringify(body)}\n` : '';
            const kw   = [
                h.length   ? 'headers=headers' : '',
                body       ? 'data=body'        : ''
            ].filter(Boolean).join(', ');
            snippetCode.textContent =
`${imp}
url = ${JSON.stringify(url)}${hStr}${bStr}
response = requests.${method.toLowerCase()}(url${kw ? ', ' + kw : ''})

print(response.status_code)
print(response.json())`;
        } else {
            // cURL
            const hFlags = h.map(([k, v]) => `  -H ${JSON.stringify(`${k}: ${v}`)}`).join(' \\\n');
            const bFlag  = body ? `  -d ${JSON.stringify(body)} \\\n` : '';
            const mFlag  = method !== 'GET' ? `  -X ${method} \\\n` : '';
            snippetCode.textContent =
`curl ${JSON.stringify(url)} \\
${mFlag}${hFlags ? hFlags + ' \\\n' : ''}${bFlag}  -s`;
        }
    }

    function pyDict(obj) {
        const items = Object.entries(obj).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
        return `{\n${items}\n}`;
    }

    // ── Copy buttons ──────────────────────────────────────────────────────
    function makeCopy(btnId, getTextFn) {
        document.getElementById(btnId).addEventListener('click', function () {
            navigator.clipboard.writeText(getTextFn()).then(() => {
                this.textContent = 'Copied!';
                this.classList.add('copied');
                setTimeout(() => { this.textContent = 'Copy'; this.classList.remove('copied'); }, 1800);
            });
        });
    }

    makeCopy('copyRequest',  () => requestPreview.textContent);
    makeCopy('copySnippet',  () => snippetCode.textContent);
    makeCopy('copyResponse', () => responsePretty.style.display !== 'none' ? responsePretty.textContent
                                 : responseRaw.style.display !== 'none'    ? responseRaw.textContent
                                 : responseHeaders.textContent);

    // ── Utilities ─────────────────────────────────────────────────────────
    function escAttr(s) { return s.replace(/"/g, '&quot;'); }

    // ── Init ──────────────────────────────────────────────────────────────
    addKvRow('paramsList');
    addKvRow('headersList', 'Accept', 'application/json');
    updatePreview();

})();
