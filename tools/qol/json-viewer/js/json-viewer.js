// JSON Viewer & Editor
// Features: multi-tab, raw editor ↔ tree sync, drag-to-reorder, right-click context menu,
//           inline editing, search/highlight, prettify/minify/sort, import files, download.

(function () {

    // ── State ─────────────────────────────────────────────────────────────
    let tabs = [];          // Array of { id, name, json, parsed, dirty }
    let activeTab = null;
    let contextTarget = null; // { node, path, key, parentRef, parentKey }
    let searchResults = [];
    let searchIdx = 0;

    // ── DOM refs ──────────────────────────────────────────────────────────
    const tabBar       = document.getElementById('tabBar');
    const addTabBtn    = document.getElementById('addTabBtn');
    const rawEditor    = document.getElementById('rawEditor');
    const editorError  = document.getElementById('editorError');
    const infoPanel    = document.getElementById('infoPanel');
    const treeRoot     = document.getElementById('treeRoot');
    const treeScroll   = document.getElementById('treeScroll');
    const searchInput  = document.getElementById('searchInput');
    const searchCount  = document.getElementById('searchCount');
    const contextMenu  = document.getElementById('contextMenu');
    const workspace    = document.getElementById('workspace');
    const editorPane   = document.getElementById('editorPane');
    const splitHandle  = document.getElementById('splitHandle');
    const fileInput    = document.getElementById('fileInput');

    // ── Tab management ────────────────────────────────────────────────────
    function createTab(name, json) {
        const id = Date.now() + Math.random();
        const tab = { id, name: name || 'Untitled', json: json || '', parsed: null, dirty: false };
        try { tab.parsed = json ? JSON.parse(json) : null; } catch {}
        tabs.push(tab);
        renderTabBar();
        setActiveTab(id);
        return tab;
    }

    function setActiveTab(id) {
        activeTab = tabs.find(t => t.id === id) || tabs[0];
        renderTabBar();
        rawEditor.value = activeTab ? (activeTab.json || '') : '';
        parse(false);
    }

    function renderTabBar() {
        // Remove existing tab items (not the + button)
        tabBar.querySelectorAll('.tab-item').forEach(el => el.remove());
        tabs.forEach(tab => {
            const el = document.createElement('div');
            el.className = 'tab-item' + (activeTab && tab.id === activeTab.id ? ' active' : '');
            el.dataset.id = tab.id;
            el.innerHTML = `
                <span class="tab-name">${escHtml(tab.name)}${tab.dirty ? ' •' : ''}</span>
                <button class="tab-close" data-id="${tab.id}" title="Close tab">×</button>`;
            el.addEventListener('click', e => {
                if (e.target.classList.contains('tab-close')) return;
                if (activeTab) { activeTab.json = rawEditor.value; }
                setActiveTab(tab.id);
            });
            el.querySelector('.tab-close').addEventListener('click', () => closeTab(tab.id));
            tabBar.insertBefore(el, addTabBtn);
        });
    }

    function closeTab(id) {
        const idx = tabs.findIndex(t => t.id === id);
        if (idx === -1) return;
        tabs.splice(idx, 1);
        if (tabs.length === 0) createTab('Untitled', '');
        else setActiveTab(tabs[Math.max(0, idx - 1)].id);
    }

    addTabBtn.addEventListener('click', () => {
        if (activeTab) activeTab.json = rawEditor.value;
        createTab('Untitled', '');
    });

    // ── Parse & sync ──────────────────────────────────────────────────────
    let parseTimer = null;
    rawEditor.addEventListener('input', () => {
        if (!activeTab) return;
        activeTab.json  = rawEditor.value;
        activeTab.dirty = true;
        renderTabBar();
        clearTimeout(parseTimer);
        parseTimer = setTimeout(() => parse(true), 300);
    });

    function parse(fromEditor) {
        if (!activeTab) { treeRoot.innerHTML = ''; return; }
        const src = fromEditor ? rawEditor.value : activeTab.json;
        editorError.classList.add('hidden');
        if (!src.trim()) { activeTab.parsed = null; treeRoot.innerHTML = '<span style="color:#aaa;padding:0.5rem;display:block">Empty — paste JSON in the editor.</span>'; updateInfo(); return; }
        try {
            activeTab.parsed = JSON.parse(src);
            renderTree(activeTab.parsed);
            updateInfo();
            doSearch();
        } catch (e) {
            editorError.textContent = e.message;
            editorError.classList.remove('hidden');
        }
    }

    // ── Tree rendering ────────────────────────────────────────────────────
    function renderTree(data) {
        treeRoot.innerHTML = '';
        treeRoot.appendChild(buildNode(data, null, null, [], true));
    }

    function buildNode(value, key, parentRef, path, isRoot) {
        const container = document.createElement('div');
        container.className = 'tree-node' + (isRoot ? ' root-node' : '');
        container.dataset.path = JSON.stringify(path);

        const type = getType(value);
        const isExpandable = type === 'object' || type === 'array';

        // Row
        const row = document.createElement('div');
        row.className = 'tree-row';
        row.draggable = true;

        // Drag handle
        const dh = document.createElement('span');
        dh.className = 'drag-handle';
        dh.textContent = '⠿';
        dh.title = 'Drag to reorder';
        row.appendChild(dh);

        // Toggle
        const toggle = document.createElement('span');
        toggle.className = 'tree-toggle';
        toggle.textContent = isExpandable ? '▾' : ' ';
        row.appendChild(toggle);

        // Key
        if (key !== null) {
            const keyEl = document.createElement('span');
            keyEl.className = 'tree-key';
            keyEl.textContent = key;
            keyEl.dataset.path = JSON.stringify(path);
            row.appendChild(keyEl);
            const colon = document.createElement('span');
            colon.className = 'tree-colon';
            colon.textContent = ':';
            row.appendChild(colon);
        }

        // Value / summary
        const valEl = document.createElement('span');
        valEl.className = `tree-value val-${type}`;
        if (isExpandable) {
            const len = Array.isArray(value) ? value.length : Object.keys(value).length;
            valEl.textContent = Array.isArray(value) ? `[ ${len} items ]` : `{ ${len} keys }`;
        } else {
            valEl.textContent = formatLeaf(value, type);
        }
        row.appendChild(valEl);

        // Type badge
        const typeEl = document.createElement('span');
        typeEl.className = 'tree-type';
        typeEl.textContent = type + (isExpandable
            ? (Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`)
            : '');
        row.appendChild(typeEl);

        container.appendChild(row);

        // Children
        if (isExpandable) {
            const children = document.createElement('div');
            children.className = 'tree-children';
            const entries = Array.isArray(value)
                ? value.map((v, i) => [i, v])
                : Object.entries(value);
            entries.forEach(([k, v]) => {
                const childPath = [...path, k];
                children.appendChild(buildNode(v, k, value, childPath, false));
            });
            container.appendChild(children);

            // Toggle collapse
            toggle.addEventListener('click', e => {
                e.stopPropagation();
                const collapsed = children.classList.toggle('collapsed');
                toggle.textContent = collapsed ? '▸' : '▾';
            });

            row.addEventListener('click', () => {
                const collapsed = children.classList.toggle('collapsed');
                toggle.textContent = collapsed ? '▸' : '▾';
            });
        }

        // Right-click context menu
        row.addEventListener('contextmenu', e => {
            e.preventDefault();
            e.stopPropagation();
            contextTarget = { value, key, parentRef, path, type };
            showContextMenu(e.clientX, e.clientY);
        });

        // Drag-and-drop reordering (objects/arrays only at same level)
        row.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', JSON.stringify(path));
            e.dataTransfer.effectAllowed = 'move';
        });

        row.addEventListener('dragover', e => {
            e.preventDefault();
            row.classList.add('dragging-over');
        });

        row.addEventListener('dragleave', () => row.classList.remove('dragging-over'));

        row.addEventListener('drop', e => {
            e.preventDefault();
            row.classList.remove('dragging-over');
            const fromPath = JSON.parse(e.dataTransfer.getData('text/plain'));
            reorderNodes(fromPath, path);
        });

        if (!isExpandable) container.classList.add('no-children');
        return container;
    }

    // ── Drag reorder ──────────────────────────────────────────────────────
    function reorderNodes(fromPath, toPath) {
        if (!activeTab.parsed) return;
        // Only allow reorder within same parent
        const fromParentPath = fromPath.slice(0, -1);
        const toParentPath   = toPath.slice(0, -1);
        if (JSON.stringify(fromParentPath) !== JSON.stringify(toParentPath)) return;

        const parent = getAtPath(activeTab.parsed, fromParentPath);
        if (!parent) return;

        const fromKey = fromPath[fromPath.length - 1];
        const toKey   = toPath[toPath.length - 1];

        if (Array.isArray(parent)) {
            const fi = Number(fromKey), ti = Number(toKey);
            if (isNaN(fi) || isNaN(ti)) return;
            const [item] = parent.splice(fi, 1);
            parent.splice(ti, 0, item);
        } else {
            // Object: rebuild keys in new order
            const keys = Object.keys(parent);
            const fi = keys.indexOf(String(fromKey));
            const ti = keys.indexOf(String(toKey));
            if (fi === -1 || ti === -1) return;
            keys.splice(fi, 1);
            keys.splice(ti, 0, String(fromKey));
            const newObj = {};
            keys.forEach(k => { newObj[k] = parent[k]; });
            Object.keys(parent).forEach(k => delete parent[k]);
            Object.assign(parent, newObj);
        }
        syncFromParsed();
    }

    // ── Context menu ──────────────────────────────────────────────────────
    function showContextMenu(x, y) {
        contextMenu.style.display = 'block';
        const rect = contextMenu.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        contextMenu.style.left = Math.min(x, vw - rect.width  - 8) + 'px';
        contextMenu.style.top  = Math.min(y, vh - rect.height - 8) + 'px';
    }

    function hideContextMenu() { contextMenu.style.display = 'none'; }

    document.addEventListener('click',       hideContextMenu);
    document.addEventListener('contextmenu', e => { if (!e.target.closest('.tree-row')) hideContextMenu(); });
    document.addEventListener('keydown',     e => { if (e.key === 'Escape') hideContextMenu(); });

    contextMenu.querySelectorAll('.ctx-item').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!contextTarget) return;
            handleContextAction(btn.dataset.action, contextTarget);
            hideContextMenu();
        });
    });

    function handleContextAction(action, tgt) {
        const { path, key, value, parentRef, type } = tgt;
        switch (action) {
            case 'edit': {
                const newVal = prompt('Edit value:', typeof value === 'object' ? JSON.stringify(value) : String(value));
                if (newVal === null) return;
                const parsed = tryParseValue(newVal);
                setAtPath(activeTab.parsed, path, parsed);
                syncFromParsed();
                break;
            }
            case 'rename': {
                if (key === null) return;
                const newKey = prompt('Rename key:', key);
                if (!newKey || newKey === key) return;
                const parent = getAtPath(activeTab.parsed, path.slice(0, -1));
                if (!parent || Array.isArray(parent)) return;
                // Rebuild preserving order
                const newObj = {};
                Object.keys(parent).forEach(k => { newObj[k === String(key) ? newKey : k] = parent[k]; });
                Object.keys(parent).forEach(k => delete parent[k]);
                Object.assign(parent, newObj);
                syncFromParsed();
                break;
            }
            case 'add-sibling':
            case 'add-child': {
                const target = action === 'add-child' ? value : getAtPath(activeTab.parsed, path.slice(0, -1));
                if (!target || typeof target !== 'object') { alert('Can only add to object or array.'); return; }
                if (Array.isArray(target)) {
                    target.push('new value');
                } else {
                    let newKey = 'new_key';
                    let n = 1;
                    while (newKey in target) newKey = `new_key_${n++}`;
                    target[newKey] = 'new value';
                }
                syncFromParsed();
                break;
            }
            case 'delete': {
                if (path.length === 0) { if (confirm('Clear entire document?')) { activeTab.parsed = null; syncFromParsed(); } return; }
                const parent = getAtPath(activeTab.parsed, path.slice(0, -1));
                const k = path[path.length - 1];
                if (Array.isArray(parent)) parent.splice(Number(k), 1);
                else delete parent[k];
                syncFromParsed();
                break;
            }
            case 'copy-value':
                navigator.clipboard.writeText(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
                break;
            case 'copy-path':
                navigator.clipboard.writeText(pathToString(path));
                break;
        }
    }

    // ── Expand / Collapse all ─────────────────────────────────────────────
    document.getElementById('expandAllBtn').addEventListener('click', () => {
        treeRoot.querySelectorAll('.tree-children').forEach(el => el.classList.remove('collapsed'));
        treeRoot.querySelectorAll('.tree-toggle').forEach(el => { if (el.textContent !== ' ') el.textContent = '▾'; });
    });

    document.getElementById('collapseAllBtn').addEventListener('click', () => {
        treeRoot.querySelectorAll('.tree-children').forEach((el, i) => { if (i > 0) el.classList.add('collapsed'); });
        treeRoot.querySelectorAll('.tree-toggle').forEach(el => { if (el.textContent !== ' ') el.textContent = '▸'; });
    });

    // ── View tabs (editor / info) ─────────────────────────────────────────
    editorPane.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            editorPane.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const v = tab.dataset.view;
            rawEditor.style.display     = v === 'editor' ? '' : 'none';
            infoPanel.style.display     = v === 'info'   ? '' : 'none';
            editorError.style.display   = v === 'editor' ? '' : 'none';
            if (v === 'info') updateInfo();
        });
    });

    function updateInfo() {
        if (infoPanel.style.display === 'none') return;
        const data = activeTab ? activeTab.parsed : null;
        const src  = activeTab ? activeTab.json   : '';
        const stats = data ? collectStats(data) : { keys: 0, depth: 0, arrays: 0, objects: 0, strings: 0, numbers: 0, nulls: 0, booleans: 0 };
        infoPanel.innerHTML = [
            ['Size (raw)', src.length + ' chars'],
            ['Size (minified)', data ? JSON.stringify(data).length + ' chars' : '—'],
            ['Top-level type', data ? getType(data) : '—'],
            ['Total keys', stats.keys],
            ['Max depth', stats.depth],
            ['Objects', stats.objects],
            ['Arrays', stats.arrays],
            ['Strings', stats.strings],
            ['Numbers', stats.numbers],
            ['Booleans', stats.booleans],
            ['Nulls', stats.nulls],
        ].map(([k, v]) => `<div class="info-row"><span class="info-key">${k}</span><span class="info-value">${v}</span></div>`).join('');
    }

    function collectStats(data) {
        const s = { keys: 0, depth: 0, arrays: 0, objects: 0, strings: 0, numbers: 0, nulls: 0, booleans: 0 };
        function walk(v, d) {
            s.depth = Math.max(s.depth, d);
            if (v === null)             { s.nulls++;    return; }
            if (typeof v === 'string')  { s.strings++;  return; }
            if (typeof v === 'number')  { s.numbers++;  return; }
            if (typeof v === 'boolean') { s.booleans++; return; }
            if (Array.isArray(v))  { s.arrays++;  v.forEach(i => walk(i, d+1)); return; }
            if (typeof v === 'object') {
                s.objects++;
                Object.entries(v).forEach(([,val]) => { s.keys++; walk(val, d+1); });
            }
        }
        walk(data, 0);
        return s;
    }

    // ── Toolbar actions ───────────────────────────────────────────────────
    document.getElementById('prettifyBtn').addEventListener('click', () => {
        if (!activeTab || !activeTab.parsed) return;
        const pretty = JSON.stringify(activeTab.parsed, null, 2);
        rawEditor.value = pretty;
        activeTab.json = pretty;
        editorError.classList.add('hidden');
    });

    document.getElementById('minifyBtn').addEventListener('click', () => {
        if (!activeTab || !activeTab.parsed) return;
        const mini = JSON.stringify(activeTab.parsed);
        rawEditor.value = mini;
        activeTab.json = mini;
    });

    document.getElementById('sortBtn').addEventListener('click', () => {
        if (!activeTab || !activeTab.parsed) return;
        activeTab.parsed = deepSortKeys(activeTab.parsed);
        syncFromParsed();
    });

    function deepSortKeys(v) {
        if (Array.isArray(v)) return v.map(deepSortKeys);
        if (v && typeof v === 'object') {
            const sorted = {};
            Object.keys(v).sort().forEach(k => { sorted[k] = deepSortKeys(v[k]); });
            return sorted;
        }
        return v;
    }

    document.getElementById('downloadBtn').addEventListener('click', () => {
        if (!activeTab) return;
        const blob = new Blob([JSON.stringify(activeTab.parsed, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (activeTab.name.replace(/\.json$/i,'') || 'data') + '.json';
        a.click();
    });

    document.getElementById('copyJsonBtn').addEventListener('click', function () {
        if (!activeTab) return;
        navigator.clipboard.writeText(JSON.stringify(activeTab.parsed, null, 2)).then(() => {
            this.textContent = 'Copied!';
            setTimeout(() => { this.textContent = 'Copy JSON'; }, 1800);
        });
    });

    // ── File import ───────────────────────────────────────────────────────
    document.getElementById('importBtn').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
        [...fileInput.files].forEach(f => {
            const reader = new FileReader();
            reader.onload = e => {
                if (activeTab) activeTab.json = rawEditor.value;
                createTab(f.name, e.target.result);
            };
            reader.readAsText(f);
        });
        fileInput.value = '';
    });

    // ── Search ────────────────────────────────────────────────────────────
    searchInput.addEventListener('input', doSearch);

    function doSearch() {
        treeRoot.querySelectorAll('.search-match').forEach(el => el.classList.remove('search-match'));
        treeRoot.querySelectorAll('.tree-row').forEach(r => r.classList.remove('highlight'));
        searchResults = [];
        const q = searchInput.value.trim().toLowerCase();
        if (!q) { searchCount.textContent = ''; return; }

        treeRoot.querySelectorAll('.tree-key, .tree-value').forEach(el => {
            if (el.textContent.toLowerCase().includes(q)) {
                el.classList.add('search-match');
                const row = el.closest('.tree-row');
                if (row && !searchResults.includes(row)) searchResults.push(row);
            }
        });

        searchCount.textContent = searchResults.length ? `${searchResults.length}` : '0';

        // Expand parents of matches and scroll to first
        searchResults.forEach(row => expandParents(row));
        if (searchResults.length) {
            searchResults[0].classList.add('highlight');
            searchResults[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    function expandParents(el) {
        let parent = el.parentElement;
        while (parent && parent !== treeScroll) {
            if (parent.classList.contains('tree-children')) {
                parent.classList.remove('collapsed');
                const toggle = parent.previousElementSibling?.querySelector('.tree-toggle');
                if (toggle && toggle.textContent !== ' ') toggle.textContent = '▾';
            }
            parent = parent.parentElement;
        }
    }

    // ── Resizable split handle ────────────────────────────────────────────
    let splitDragging = false;
    splitHandle.addEventListener('mousedown', startSplit);
    splitHandle.addEventListener('touchstart', startSplit, { passive: true });

    function startSplit() {
        splitDragging = true;
        splitHandle.classList.add('dragging');
        document.addEventListener('mousemove', onSplit);
        document.addEventListener('touchmove', onSplit, { passive: false });
        document.addEventListener('mouseup',   stopSplit);
        document.addEventListener('touchend',  stopSplit);
    }

    function onSplit(e) {
        if (!splitDragging) return;
        if (e.cancelable) e.preventDefault();
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const rect = workspace.getBoundingClientRect();
        const pct  = Math.max(20, Math.min(80, (cx - rect.left) / rect.width * 100));
        editorPane.style.flex = `0 0 ${pct}%`;
    }

    function stopSplit() {
        splitDragging = false;
        splitHandle.classList.remove('dragging');
        document.removeEventListener('mousemove', onSplit);
        document.removeEventListener('touchmove', onSplit);
        document.removeEventListener('mouseup',   stopSplit);
        document.removeEventListener('touchend',  stopSplit);
    }

    // ── Sync parsed → editor + tree ───────────────────────────────────────
    function syncFromParsed() {
        if (!activeTab) return;
        const pretty = JSON.stringify(activeTab.parsed, null, 2);
        activeTab.json = pretty;
        rawEditor.value = pretty;
        renderTree(activeTab.parsed);
        updateInfo();
        doSearch();
    }

    // ── Utilities ─────────────────────────────────────────────────────────
    function getType(v) {
        if (v === null)           return 'null';
        if (Array.isArray(v))     return 'array';
        return typeof v;
    }

    function formatLeaf(v, type) {
        if (type === 'string')  return `"${v}"`;
        if (type === 'null')    return 'null';
        return String(v);
    }

    function tryParseValue(s) {
        if (s === 'null')  return null;
        if (s === 'true')  return true;
        if (s === 'false') return false;
        const n = Number(s);
        if (!isNaN(n) && s.trim() !== '') return n;
        try { return JSON.parse(s); } catch {}
        // Remove surrounding quotes if user typed them
        if (/^".*"$/.test(s)) return s.slice(1, -1);
        return s;
    }

    function getAtPath(root, path) {
        let cur = root;
        for (const k of path) {
            if (cur == null) return undefined;
            cur = cur[k];
        }
        return cur;
    }

    function setAtPath(root, path, value) {
        if (path.length === 0) { activeTab.parsed = value; return; }
        let cur = root;
        for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
        cur[path[path.length - 1]] = value;
    }

    function pathToString(path) {
        return path.reduce((acc, k) =>
            typeof k === 'number' || /^\d+$/.test(k)
                ? `${acc}[${k}]`
                : acc ? `${acc}.${k}` : k
        , '');
    }

    function escHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // ── Init ──────────────────────────────────────────────────────────────
    createTab('example.json', JSON.stringify({
        "name": "JSON Viewer",
        "version": "1.0",
        "features": ["tree view", "drag & drop", "inline edit", "search", "multi-tab"],
        "settings": {
            "theme": "light",
            "autoFormat": true,
            "maxDepth": null
        },
        "stats": { "nodes": 42, "depth": 3 }
    }, null, 2));

})();
