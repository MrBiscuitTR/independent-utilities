// Regex Tester — live matching, highlight overlay, code snippets

(function () {
    const regexInput   = document.getElementById('regexInput');
    const testArea     = document.getElementById('testString');
    const hlLayer      = document.getElementById('highlight-layer');
    const errorDiv     = document.getElementById('regexError');
    const matchBadge   = document.getElementById('matchBadge');
    const matchList    = document.getElementById('matchList');
    const snippetCode  = document.getElementById('snippetCode');
    const copyBtn      = document.getElementById('copySnippet');
    const flagBtns     = document.querySelectorAll('.flag-btn');
    const snippetTabs  = document.querySelectorAll('.snippet-tab');

    let currentLang = 'js';
    let lastPattern = '';
    let lastFlags   = '';

    // ── Flag toggles ──────────────────────────────────────────────────────
    flagBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            run();
        });
    });

    function getFlags() {
        let f = '';
        flagBtns.forEach(btn => { if (btn.classList.contains('active')) f += btn.dataset.flag; });
        return f;
    }

    // ── Live input listeners ──────────────────────────────────────────────
    regexInput.addEventListener('input', run);
    testArea.addEventListener('input', () => { syncScroll(); run(); });
    testArea.addEventListener('scroll', syncScroll);

    // Keep highlight layer scroll in sync with textarea scroll
    function syncScroll() {
        hlLayer.scrollTop  = testArea.scrollTop;
        hlLayer.scrollLeft = testArea.scrollLeft;
    }

    // ── Main runner ───────────────────────────────────────────────────────
    function run() {
        const pattern = regexInput.value;
        const flags   = getFlags();
        const text    = testArea.value;

        lastPattern = pattern;
        lastFlags   = flags;

        // Clear state
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';

        if (!pattern) {
            hlLayer.innerHTML = escHtml(text);
            renderNoMatches('Enter a regex above.');
            updateSnippet(pattern, flags);
            return;
        }

        let re;
        try {
            // Always use 'g' internally for exec loop
            const testFlags = flags.includes('g') ? flags : flags + 'g';
            re = new RegExp(pattern, testFlags);
        } catch (e) {
            errorDiv.textContent = e.message;
            errorDiv.classList.remove('hidden');
            hlLayer.innerHTML = escHtml(text);
            renderNoMatches('Invalid expression.');
            updateSnippet(pattern, flags);
            return;
        }

        // Collect all matches
        const matches = [];
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null) {
            matches.push({
                index:       m.index,
                end:         m.index + m[0].length,
                value:       m[0],
                groups:      m.slice(1),
                namedGroups: m.groups || {}
            });
            // Guard against zero-width infinite loops
            if (m[0].length === 0) re.lastIndex++;
        }

        renderHighlight(text, matches);
        renderResults(matches);
        updateSnippet(pattern, flags);
    }

    // ── Highlight overlay ─────────────────────────────────────────────────
    function renderHighlight(text, matches) {
        if (matches.length === 0) { hlLayer.innerHTML = escHtml(text); return; }

        let html   = '';
        let cursor = 0;
        for (const m of matches) {
            html += escHtml(text.slice(cursor, m.index));
            html += `<mark class="hl">${escHtml(m.value)}</mark>`;
            cursor = m.end;
        }
        html += escHtml(text.slice(cursor));
        hlLayer.innerHTML = html;
        syncScroll();
    }

    // ── Results list ──────────────────────────────────────────────────────
    function renderNoMatches(msg) {
        matchBadge.textContent = '0 matches';
        matchBadge.classList.add('none');
        matchList.innerHTML = `<p class="no-matches">${msg}</p>`;
    }

    function renderResults(matches) {
        if (matches.length === 0) { renderNoMatches('No matches found.'); return; }

        matchBadge.textContent = `${matches.length} match${matches.length !== 1 ? 'es' : ''}`;
        matchBadge.classList.remove('none');

        matchList.innerHTML = matches.map((m, i) => {
            let groupsHtml = '';
            if (m.groups.length > 0 && m.groups.some(g => g !== undefined)) {
                const rows = m.groups.map((g, gi) => {
                    const namedEntry = Object.entries(m.namedGroups).find(([, v]) => v === g);
                    const label = namedEntry ? `${gi + 1} <em>(${namedEntry[0]})</em>` : gi + 1;
                    return `<div class="group-row">
                        <span class="group-idx">${label}</span>
                        <span class="group-val">${g !== undefined ? escHtml(g) : '<em>undefined</em>'}</span>
                    </div>`;
                }).join('');
                groupsHtml = `<div class="match-groups">${rows}</div>`;
            }

            return `<div class="match-card">
                <div class="match-card-top">
                    <span class="match-num">#${i + 1}</span>
                    <span class="match-value">${escHtml(m.value) || '<em>empty</em>'}</span>
                    <span class="match-pos">index ${m.index}&#8211;${m.end}</span>
                </div>
                ${groupsHtml}
            </div>`;
        }).join('');
    }

    // ── Code snippets ─────────────────────────────────────────────────────
    snippetTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            snippetTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentLang = tab.dataset.lang;
            updateSnippet(lastPattern, lastFlags);
        });
    });

    function updateSnippet(pattern, flags) {
        const p = pattern || '\\d+';
        const f = flags   || 'g';
        const fWithG = f.includes('g') ? f : f + 'g';
        const lit = escapeSlashes(p);

        if (currentLang === 'js') {
            snippetCode.textContent =
`const regex = /${lit}/${f};
const text  = "your string here";

// Test — returns true/false
console.log(regex.test(text));

// All matches (requires 'g' flag)
const matches = [...text.matchAll(/${lit}/${fWithG})];
matches.forEach(m => console.log(m[0], 'at index', m.index));

// Replace
const result = text.replace(/${lit}/${fWithG}, "replacement");
console.log(result);`;
        } else {
            const pyFlags = buildPyFlags(f);
            const flagArg  = pyFlags ? `, ${pyFlags}` : '';
            const flagKw   = pyFlags ? `, flags=${pyFlags}` : '';
            snippetCode.textContent =
`import re

pattern = r"${p.replace(/"/g, '\\"')}"
text    = "your string here"

# Test — returns a Match or None
if re.search(pattern, text${flagArg}):
    print("Match found!")

# All matches (strings)
matches = re.findall(pattern, text${flagArg})
print(matches)

# All match objects (with position info)
for m in re.finditer(pattern, text${flagArg}):
    print(m.group(), m.start(), m.end())

# Replace
result = re.sub(pattern, "replacement", text${flagKw})
print(result)`;
        }
    }

    function buildPyFlags(flags) {
        const parts = [];
        if (flags.includes('i')) parts.push('re.IGNORECASE');
        if (flags.includes('m')) parts.push('re.MULTILINE');
        if (flags.includes('s')) parts.push('re.DOTALL');
        return parts.join(' | ');
    }

    function escapeSlashes(s) { return s.replace(/\//g, '\\/'); }

    // ── Copy button ───────────────────────────────────────────────────────
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(snippetCode.textContent).then(() => {
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 1800);
        });
    });

    // ── HTML escape ───────────────────────────────────────────────────────
    function escHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Init with example ─────────────────────────────────────────────────
    regexInput.value = '\\d+';
    testArea.value   = 'I have 3 apples and 42 oranges.';
    flagBtns.forEach(btn => { if (btn.dataset.flag === 'g') btn.classList.add('active'); });
    run();
})();
