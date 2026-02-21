// Markdown ↔ HTML Converter
// Markdown→HTML: uses marked.js (local copy)
// HTML→Markdown: lightweight pure-JS converter

(function () {
    const inputArea    = document.getElementById('inputArea');
    const renderedView = document.getElementById('renderedView');
    const sourceView   = document.getElementById('sourceView');
    const splitToggle  = document.getElementById('splitToggle');
    const copyBtn      = document.getElementById('copyOutput');
    const clearBtn     = document.getElementById('clearAll');
    const workspace    = document.getElementById('workspace');
    const modeTabs     = document.querySelectorAll('.mode-tab');
    const viewTabs     = document.querySelectorAll('.view-tab');
    const inputLabel   = document.getElementById('inputLabel');
    const outputLabel  = document.getElementById('outputLabel');
    const divider      = document.getElementById('divider');

    let mode    = 'md-to-html'; // or 'html-to-md'
    let view    = 'rendered';   // or 'source'

    // Configure marked
    if (typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true });
    }

    // ── Mode tabs ─────────────────────────────────────────────────────────
    modeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            modeTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            mode = tab.dataset.mode;
            updateLabels();
            convert();
        });
    });

    // ── View tabs (rendered / source) ─────────────────────────────────────
    viewTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            viewTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            view = tab.dataset.view;
            applyView();
        });
    });

    function applyView() {
        if (view === 'rendered') {
            renderedView.style.display = '';
            sourceView.style.display   = 'none';
        } else {
            renderedView.style.display = 'none';
            sourceView.style.display   = '';
        }
    }

    // ── Split toggle ──────────────────────────────────────────────────────
    splitToggle.addEventListener('change', () => {
        workspace.classList.toggle('no-split', !splitToggle.checked);
    });

    // ── Live conversion ───────────────────────────────────────────────────
    inputArea.addEventListener('input', convert);

    function convert() {
        const input = inputArea.value;
        if (mode === 'md-to-html') {
            const html = typeof marked !== 'undefined'
                ? marked.parse(input)
                : `<pre>${escHtml(input)}</pre>`;
            renderedView.innerHTML = html;
            sourceView.value       = html;
        } else {
            const md = htmlToMarkdown(input);
            renderedView.innerHTML = typeof marked !== 'undefined'
                ? marked.parse(md)
                : escHtml(md);
            sourceView.value = md;
        }
    }

    function updateLabels() {
        if (mode === 'md-to-html') {
            inputLabel.textContent  = 'Markdown input';
            outputLabel.textContent = 'HTML output';
            inputArea.placeholder   = 'Type or paste Markdown here…';
        } else {
            inputLabel.textContent  = 'HTML input';
            outputLabel.textContent = 'Markdown output';
            inputArea.placeholder   = 'Type or paste HTML here…';
        }
    }

    // ── Copy output ───────────────────────────────────────────────────────
    copyBtn.addEventListener('click', () => {
        const text = view === 'source' ? sourceView.value : renderedView.innerHTML;
        navigator.clipboard.writeText(
            view === 'source' ? sourceView.value : sourceView.value
        ).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy output'; }, 1800);
        });
    });

    clearBtn.addEventListener('click', () => {
        inputArea.value        = '';
        renderedView.innerHTML = '';
        sourceView.value       = '';
    });

    // ── Draggable divider ─────────────────────────────────────────────────
    let dragging = false;
    divider.addEventListener('mousedown', startDrag);
    divider.addEventListener('touchstart', startDrag, { passive: true });

    function startDrag(e) {
        dragging = true;
        divider.classList.add('dragging');
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('touchmove', onDrag, { passive: false });
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchend', stopDrag);
    }

    function onDrag(e) {
        if (!dragging) return;
        if (e.cancelable) e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const rect     = workspace.getBoundingClientRect();
        const total    = rect.width - divider.offsetWidth;
        let   leftW    = clientX - rect.left;
        leftW = Math.max(120, Math.min(total - 120, leftW));
        const leftPct  = (leftW / rect.width) * 100;
        document.getElementById('inputPane').style.flex  = `0 0 ${leftPct}%`;
        document.getElementById('outputPane').style.flex = `0 0 ${100 - leftPct - (divider.offsetWidth / rect.width * 100)}%`;
    }

    function stopDrag() {
        dragging = false;
        divider.classList.remove('dragging');
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('touchmove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchend', stopDrag);
    }

    // ── HTML → Markdown converter (pure JS) ───────────────────────────────
    function htmlToMarkdown(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return nodeToMd(div).trim();
    }

    function nodeToMd(node, opts) {
        opts = opts || { listDepth: 0, ordered: false, index: 0 };
        let out = '';

        node.childNodes.forEach(child => {
            if (child.nodeType === 3) { // text
                out += child.textContent.replace(/\n+/g, ' ');
                return;
            }
            if (child.nodeType !== 1) return;
            const tag = child.tagName.toLowerCase();
            const inner = () => nodeToMd(child, opts);

            switch (tag) {
                case 'h1': out += `\n# ${inner().trim()}\n\n`; break;
                case 'h2': out += `\n## ${inner().trim()}\n\n`; break;
                case 'h3': out += `\n### ${inner().trim()}\n\n`; break;
                case 'h4': out += `\n#### ${inner().trim()}\n\n`; break;
                case 'h5': out += `\n##### ${inner().trim()}\n\n`; break;
                case 'h6': out += `\n###### ${inner().trim()}\n\n`; break;
                case 'p':  out += `\n${inner().trim()}\n\n`; break;
                case 'br': out += '  \n'; break;
                case 'strong': case 'b': out += `**${inner()}**`; break;
                case 'em': case 'i':     out += `*${inner()}*`; break;
                case 's': case 'del':    out += `~~${inner()}~~`; break;
                case 'code': {
                    const p = child.parentElement;
                    if (p && p.tagName.toLowerCase() === 'pre') {
                        out += inner();
                    } else {
                        out += `\`${inner()}\``;
                    }
                    break;
                }
                case 'pre': {
                    const codeEl = child.querySelector('code');
                    const lang = (codeEl && codeEl.className.match(/language-(\w+)/))?.[1] || '';
                    const content = codeEl ? codeEl.textContent : child.textContent;
                    out += `\n\`\`\`${lang}\n${content}\n\`\`\`\n\n`;
                    break;
                }
                case 'blockquote':
                    out += inner().trim().split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
                    break;
                case 'a': {
                    const href  = child.getAttribute('href') || '';
                    const title = child.getAttribute('title');
                    const t = title ? ` "${title}"` : '';
                    out += `[${inner()}](${href}${t})`;
                    break;
                }
                case 'img': {
                    const src = child.getAttribute('src') || '';
                    const alt = child.getAttribute('alt') || '';
                    out += `![${alt}](${src})`;
                    break;
                }
                case 'ul': {
                    child.querySelectorAll(':scope > li').forEach(li => {
                        const prefix = '  '.repeat(opts.listDepth) + '- ';
                        const content = nodeToMd(li, { ...opts, listDepth: opts.listDepth + 1 }).trim();
                        out += `${prefix}${content}\n`;
                    });
                    out += '\n';
                    break;
                }
                case 'ol': {
                    let idx = 1;
                    child.querySelectorAll(':scope > li').forEach(li => {
                        const prefix = '  '.repeat(opts.listDepth) + `${idx}. `;
                        const content = nodeToMd(li, { ...opts, listDepth: opts.listDepth + 1 }).trim();
                        out += `${prefix}${content}\n`;
                        idx++;
                    });
                    out += '\n';
                    break;
                }
                case 'li':
                    out += inner();
                    break;
                case 'hr': out += '\n---\n\n'; break;
                case 'table': {
                    const rows = [...child.querySelectorAll('tr')];
                    rows.forEach((row, ri) => {
                        const cells = [...row.querySelectorAll('th, td')].map(c => nodeToMd(c, opts).trim());
                        out += '| ' + cells.join(' | ') + ' |\n';
                        if (ri === 0) out += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
                    });
                    out += '\n';
                    break;
                }
                default:
                    out += inner();
            }
        });
        return out;
    }

    function escHtml(str) {
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // ── Init ──────────────────────────────────────────────────────────────
    applyView();
    inputArea.value = `# Hello, Markdown!

This is a **live** Markdown preview with _italic_, ~~strikethrough~~, and \`inline code\`.

## Features
- Live split preview
- Convert Markdown → HTML or HTML → Markdown
- Drag the divider to resize panes
- Copy the output with one click

> Blockquotes look great too.

\`\`\`js
console.log("Hello from a code block!");
\`\`\`

| Column A | Column B |
|---|---|
| Row 1    | Data     |
| Row 2    | Data     |
`;
    convert();
})();
