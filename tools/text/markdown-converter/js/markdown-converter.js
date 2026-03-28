// Markdown ↔ HTML Converter
// Markdown→HTML: uses marked.js + highlight.js (local copies)
// HTML→Markdown: lightweight pure-JS converter

(function () {
    // Configure marked
    if (typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true });
    }

    // ── Default workspace (always visible initially) ──────────────────────
    const defaultWorkspace = document.getElementById('default-workspace');
    const inputArea = document.getElementById('inputArea');
    const renderedView = document.getElementById('renderedView');
    const sourceView = document.getElementById('sourceView');
    const splitToggle = document.getElementById('splitToggle');
    const copyBtn = document.getElementById('copyOutput');
    const clearBtn = document.getElementById('clearAll');
    const workspace = document.getElementById('workspace');
    const modeTabs = document.querySelectorAll('.mode-tab');
    const viewTabs = document.querySelectorAll('.view-tab');
    const inputLabel = document.getElementById('inputLabel');
    const outputLabel = document.getElementById('outputLabel');
    const divider = document.getElementById('divider');

    let mode = 'md-to-html';
    let view = 'rendered';

    // ── Tab state (for loaded files) ──────────────────────────────────────
    const tabs = new Map();
    let tabOrder = [];
    let activeId = null;
    let idCounter = 0;
    function nextId() { return ++idCounter; }

    const mdTabbar = document.getElementById('md-tabbar');
    const workspacesContainer = document.getElementById('workspaces');
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');

    // ── Default workspace logic ───────────────────────────────────────────
    modeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            modeTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            mode = tab.dataset.mode;
            updateLabels();
            convert();
        });
    });

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
            sourceView.style.display = 'none';
        } else {
            renderedView.style.display = 'none';
            sourceView.style.display = '';
        }
    }

    splitToggle.addEventListener('change', () => {
        workspace.classList.toggle('no-split', !splitToggle.checked);
    });

    inputArea.addEventListener('input', convert);

    function convert() {
        const input = inputArea.value;
        if (mode === 'md-to-html') {
            const html = typeof marked !== 'undefined'
                ? marked.parse(input)
                : `<pre>${escHtml(input)}</pre>`;
            renderedView.innerHTML = html;
            sourceView.value = html;
            if (typeof hljs !== 'undefined') {
                renderedView.querySelectorAll('pre code').forEach(block => {
                    hljs.highlightElement(block);
                });
            }
        } else {
            const md = htmlToMarkdown(input);
            renderedView.innerHTML = typeof marked !== 'undefined'
                ? marked.parse(md)
                : escHtml(md);
            sourceView.value = md;
            if (typeof hljs !== 'undefined') {
                renderedView.querySelectorAll('pre code').forEach(block => {
                    hljs.highlightElement(block);
                });
            }
        }
    }

    function updateLabels() {
        if (mode === 'md-to-html') {
            inputLabel.textContent = 'Markdown input';
            outputLabel.textContent = 'HTML output';
            inputArea.placeholder = 'Type or paste Markdown here…';
        } else {
            inputLabel.textContent = 'HTML input';
            outputLabel.textContent = 'Markdown output';
            inputArea.placeholder = 'Type or paste HTML here…';
        }
    }

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(sourceView.value).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy output'; }, 1800);
        });
    });

    clearBtn.addEventListener('click', () => {
        inputArea.value = '';
        renderedView.innerHTML = '';
        sourceView.value = '';
    });

    // Draggable divider
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
        const rect = workspace.getBoundingClientRect();
        const total = rect.width - divider.offsetWidth;
        let leftW = clientX - rect.left;
        leftW = Math.max(120, Math.min(total - 120, leftW));
        const leftPct = (leftW / rect.width) * 100;
        document.getElementById('inputPane').style.flex = `0 0 ${leftPct}%`;
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

    // ── Tab management (for loaded files) ────────────────────────────────
    function addTab(fileName, content) {
        const id = nextId();
        tabs.set(id, {
            id,
            fileName,
            content,
            mode: 'md-to-html',
            view: 'rendered',
            splitEnabled: true
        });
        tabOrder.push(id);
        createWorkspace(id);
        switchTab(id);
        showTabBar();
    }

    function switchTab(id) {
        activeId = id;
        rerenderTabBar();
        // Hide default workspace and all file workspaces
        defaultWorkspace.classList.remove('active');
        workspacesContainer.querySelectorAll('.md-workspace-container').forEach(ws => {
            ws.classList.remove('active');
        });
        // Show active workspace
        const activeWs = document.getElementById(`workspace-${id}`);
        if (activeWs) activeWs.classList.add('active');
    }

    function closeTab(id) {
        const idx = tabOrder.indexOf(id);
        tabs.delete(id);
        tabOrder = tabOrder.filter(x => x !== id);
        const ws = document.getElementById(`workspace-${id}`);
        if (ws) ws.remove();

        if (tabOrder.length === 0) {
            activeId = null;
            hideTabBar();
            defaultWorkspace.classList.add('active');
        } else {
            const nextIdx = Math.min(idx, tabOrder.length - 1);
            switchTab(tabOrder[nextIdx]);
        }
    }

    function rerenderTabBar() {
        mdTabbar.innerHTML = '';
        tabOrder.forEach(id => {
            const tab = tabs.get(id);
            const tabEl = document.createElement('div');
            tabEl.className = 'md-tab' + (id === activeId ? ' active' : '');
            tabEl.title = tab.fileName;

            const name = document.createElement('span');
            name.className = 'tab-name';
            name.textContent = tab.fileName;

            const closeBtn = document.createElement('button');
            closeBtn.className = 'tab-close';
            closeBtn.type = 'button';
            closeBtn.textContent = '×';
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeTab(id);
            });

            tabEl.appendChild(name);
            tabEl.appendChild(closeBtn);
            tabEl.addEventListener('click', () => { if (activeId !== id) switchTab(id); });
            mdTabbar.appendChild(tabEl);
        });

        const spacer = document.createElement('div');
        spacer.className = 'tabbar-spacer';
        mdTabbar.appendChild(spacer);
    }

    function showTabBar() {
        mdTabbar.style.display = '';
    }

    function hideTabBar() {
        mdTabbar.style.display = 'none';
    }

    function createWorkspace(id) {
        const tab = tabs.get(id);
        const container = document.createElement('div');
        container.id = `workspace-${id}`;
        container.className = 'md-workspace-container';

        container.innerHTML = `
            <div class="md-toolbar">
                <div class="mode-tabs">
                    <button class="mode-tab active" data-mode="md-to-html">Markdown → HTML</button>
                    <button class="mode-tab" data-mode="html-to-md">HTML → Markdown</button>
                </div>
                <div class="toolbar-right">
                    <label class="toggle-label">
                        <input type="checkbox" class="split-toggle" checked>
                        Split preview
                    </label>
                    <button class="tool-button sm-btn copy-output">Copy output</button>
                    <button class="tool-button sm-btn secondary-btn clear-all">Clear</button>
                </div>
            </div>
            <div class="md-workspace">
                <div class="md-pane input-pane">
                    <div class="pane-label input-label">Markdown input</div>
                    <textarea class="pane-editor input-area" spellcheck="false" placeholder="Type or paste Markdown here…">${escHtml(tab.content)}</textarea>
                </div>
                <div class="pane-divider"></div>
                <div class="md-pane output-pane">
                    <div class="pane-label-row">
                        <span class="pane-label output-label">HTML output</span>
                        <div class="view-tabs">
                            <button class="view-tab active" data-view="rendered">Rendered</button>
                            <button class="view-tab" data-view="source">Source</button>
                        </div>
                    </div>
                    <div class="pane-rendered markdown-body rendered-view"></div>
                    <textarea class="pane-editor source-editor source-view" readonly spellcheck="false" style="display:none"></textarea>
                </div>
            </div>
        `;

        workspacesContainer.appendChild(container);
        wireUpWorkspace(id, container);
    }

    function wireUpWorkspace(id, container) {
        const tab = tabs.get(id);
        const inputArea = container.querySelector('.input-area');
        const renderedView = container.querySelector('.rendered-view');
        const sourceView = container.querySelector('.source-view');
        const splitToggle = container.querySelector('.split-toggle');
        const copyBtn = container.querySelector('.copy-output');
        const clearBtn = container.querySelector('.clear-all');
        const workspace = container.querySelector('.md-workspace');
        const modeTabs = container.querySelectorAll('.mode-tab');
        const viewTabs = container.querySelectorAll('.view-tab');
        const inputLabel = container.querySelector('.input-label');
        const outputLabel = container.querySelector('.output-label');
        const divider = container.querySelector('.pane-divider');

        modeTabs.forEach(tabEl => {
            tabEl.addEventListener('click', () => {
                modeTabs.forEach(t => t.classList.remove('active'));
                tabEl.classList.add('active');
                tab.mode = tabEl.dataset.mode;
                updateLabels();
                convert();
            });
        });

        viewTabs.forEach(tabEl => {
            tabEl.addEventListener('click', () => {
                viewTabs.forEach(t => t.classList.remove('active'));
                tabEl.classList.add('active');
                tab.view = tabEl.dataset.view;
                applyView();
            });
        });

        function applyView() {
            if (tab.view === 'rendered') {
                renderedView.style.display = '';
                sourceView.style.display = 'none';
            } else {
                renderedView.style.display = 'none';
                sourceView.style.display = '';
            }
        }

        splitToggle.addEventListener('change', () => {
            tab.splitEnabled = splitToggle.checked;
            workspace.classList.toggle('no-split', !splitToggle.checked);
        });

        inputArea.addEventListener('input', () => {
            tab.content = inputArea.value;
            convert();
        });

        function convert() {
            const input = inputArea.value;
            if (tab.mode === 'md-to-html') {
                const html = typeof marked !== 'undefined'
                    ? marked.parse(input)
                    : `<pre>${escHtml(input)}</pre>`;
                renderedView.innerHTML = html;
                sourceView.value = html;
                if (typeof hljs !== 'undefined') {
                    renderedView.querySelectorAll('pre code').forEach(block => {
                        hljs.highlightElement(block);
                    });
                }
            } else {
                const md = htmlToMarkdown(input);
                renderedView.innerHTML = typeof marked !== 'undefined'
                    ? marked.parse(md)
                    : escHtml(md);
                sourceView.value = md;
                if (typeof hljs !== 'undefined') {
                    renderedView.querySelectorAll('pre code').forEach(block => {
                        hljs.highlightElement(block);
                    });
                }
            }
        }

        function updateLabels() {
            if (tab.mode === 'md-to-html') {
                inputLabel.textContent = 'Markdown input';
                outputLabel.textContent = 'HTML output';
                inputArea.placeholder = 'Type or paste Markdown here…';
            } else {
                inputLabel.textContent = 'HTML input';
                outputLabel.textContent = 'Markdown output';
                inputArea.placeholder = 'Type or paste HTML here…';
            }
        }

        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(sourceView.value).then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => { copyBtn.textContent = 'Copy output'; }, 1800);
            });
        });

        clearBtn.addEventListener('click', () => {
            inputArea.value = '';
            tab.content = '';
            renderedView.innerHTML = '';
            sourceView.value = '';
        });

        // Draggable divider
        let dragging = false;
        divider.addEventListener('mousedown', startDrag);
        divider.addEventListener('touchstart', startDrag, { passive: true });

        function startDrag() {
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
            const rect = workspace.getBoundingClientRect();
            const total = rect.width - divider.offsetWidth;
            let leftW = clientX - rect.left;
            leftW = Math.max(120, Math.min(total - 120, leftW));
            const leftPct = (leftW / rect.width) * 100;
            container.querySelector('.input-pane').style.flex = `0 0 ${leftPct}%`;
            container.querySelector('.output-pane').style.flex = `0 0 ${100 - leftPct - (divider.offsetWidth / rect.width * 100)}%`;
        }

        function stopDrag() {
            dragging = false;
            divider.classList.remove('dragging');
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('touchmove', onDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);
        }

        convert();
        applyView();
    }

    // ── File loading ──────────────────────────────────────────────────────
    function loadFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            addTab(file.name, e.target.result);
        };
        reader.readAsText(file);
    }

    function loadFiles(fileList) {
        const files = Array.from(fileList);
        if (files.length === 0) return;
        files.forEach(loadFile);
    }

    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('dragover');
    });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('dragover');
        loadFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => {
        loadFiles(fileInput.files);
        fileInput.value = '';
    });

    // Tab bar scrolling
    mdTabbar.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            mdTabbar.scrollLeft += e.deltaY;
        }
    }, { passive: false });

    // ── HTML → Markdown converter ─────────────────────────────────────────
    function htmlToMarkdown(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return nodeToMd(div).trim();
    }

    function nodeToMd(node, opts) {
        opts = opts || { listDepth: 0 };
        let out = '';
        node.childNodes.forEach(child => {
            if (child.nodeType === 3) {
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
                case 'p': out += `\n${inner().trim()}\n\n`; break;
                case 'br': out += '  \n'; break;
                case 'strong': case 'b': out += `**${inner()}**`; break;
                case 'em': case 'i': out += `*${inner()}*`; break;
                case 's': case 'del': out += `~~${inner()}~~`; break;
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
                    const href = child.getAttribute('href') || '';
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
                case 'li': out += inner(); break;
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
                default: out += inner();
            }
        });
        return out;
    }

    function escHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
