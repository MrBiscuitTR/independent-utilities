/* jupyter-viewer.js — MyST Notebook Viewer (multi-tab) */
'use strict';

(function () {

  /* ── Tab state ───────────────────────────────────────────────────── */
  const notebooks = new Map(); // id → { id, fileName, frontMatter, cells, editMode }
  let tabOrder    = [];
  let activeId    = null;
  let idCounter   = 0;
  function nextId() { return ++idCounter; }

  /* ── DOM refs ────────────────────────────────────────────────────── */
  const nbLanding         = document.getElementById('nb-landing');
  const nbWorkspace       = document.getElementById('nb-workspace');
  const nbTabbar          = document.getElementById('nb-tabbar');
  const nbCells           = document.getElementById('nb-cells');
  const nbCellCount       = document.getElementById('nb-cell-count');
  const btnEditAll        = document.getElementById('btn-edit-all');
  const btnCopySource     = document.getElementById('btn-copy-source');
  const btnDownload       = document.getElementById('btn-download');
  // Landing
  const dropZone          = document.getElementById('drop-zone');
  const fileInput         = document.getElementById('file-input');
  const pasteInput        = document.getElementById('paste-input');
  const pasteFilename     = document.getElementById('paste-filename');
  const btnPasteOpen      = document.getElementById('btn-paste-open');
  // Overlay
  const addOverlay        = document.getElementById('add-overlay');
  const btnOverlayClose   = document.getElementById('btn-overlay-close');
  const overlayDropZone   = document.getElementById('overlay-drop-zone');
  const overlayFileInput  = document.getElementById('overlay-file-input');
  const overlayPasteInput = document.getElementById('overlay-paste-input');
  const overlayPasteFilename = document.getElementById('overlay-paste-filename');
  const btnOverlayPaste   = document.getElementById('btn-overlay-paste-open');

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function copyToClipboard(text, btn, successLabel) {
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = successLabel || '✓ Copied';
      btn.classList.add('active');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('active'); }, 1500);
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
      const orig = btn.textContent;
      btn.textContent = successLabel || '✓ Copied';
      btn.classList.add('active');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('active'); }, 1500);
    });
  }

  /* ── Math rendering (temml) ──────────────────────────────────────── */
  function renderMath(latex, display) {
    try {
      return temml.renderToString(latex.trim(), { displayMode: display });
    } catch (e) {
      return `<code class="math-error" style="color:#c0392b">${escapeHtml(latex)}</code>`;
    }
  }

  /* ── MyST Parser ─────────────────────────────────────────────────── */
  function parseMyST(source) {
    let content = source;
    let frontMatter = '';

    const fmMatch = content.match(/^---[ \t]*\r?\n([\s\S]*?)\n---[ \t]*\r?\n?/);
    if (fmMatch) {
      frontMatter = fmMatch[1];
      content = content.slice(fmMatch[0].length);
    }

    const cells = [];
    const lines = content.split('\n');
    let currentLines = [];
    let currentMeta = {};
    let i = 0;

    function flushMarkdown() {
      const text = currentLines.join('\n').trim();
      if (text) cells.push({ type: 'markdown', source: text, meta: { ...currentMeta } });
      currentLines = [];
      currentMeta = {};
    }

    while (i < lines.length) {
      const line = lines[i];

      if (/^\+\+\+[ \t]*(\{.*\})?[ \t]*$/.test(line)) {
        flushMarkdown();
        const jsonPart = line.slice(3).trim();
        if (jsonPart) {
          try { currentMeta = JSON.parse(jsonPart); } catch (_) { currentMeta = {}; }
        }
        i++;
        continue;
      }

      if (/^```\{code-cell\}/.test(line)) {
        flushMarkdown();
        const langMatch = line.match(/^```\{code-cell\}\s*(\w+)?/);
        const lang = (langMatch && langMatch[1]) || 'python';
        const cellMeta = { language: lang };
        i++;

        if (i < lines.length && lines[i].trim() === '---') {
          i++;
          const yamlLines = [];
          while (i < lines.length && lines[i].trim() !== '---') {
            yamlLines.push(lines[i]);
            i++;
          }
          if (i < lines.length) i++;
          cellMeta.yamlMeta = yamlLines.join('\n');
          const tagsInline = cellMeta.yamlMeta.match(/^tags:\s*\[([^\]]*)\]/m);
          const tagsList   = cellMeta.yamlMeta.match(/^tags:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m);
          if (tagsInline) {
            cellMeta.tags = tagsInline[1].split(',').map(t => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
          } else if (tagsList) {
            cellMeta.tags = (tagsList[1].match(/^\s+-\s*(.+)$/gm) || [])
              .map(s => s.replace(/^\s+-\s*/, '').trim().replace(/^['"]|['"]$/g, ''));
          }
        }

        const codeLines = [];
        while (i < lines.length && !/^```[ \t]*$/.test(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;

        cells.push({ type: 'code', source: codeLines.join('\n'), meta: cellMeta });
        continue;
      }

      currentLines.push(line);
      i++;
    }

    flushMarkdown();
    return { frontMatter, cells };
  }

  /* ── Serialize notebook back to MyST .md ────────────────────────── */
  function serializeMyST(nb) {
    const parts = [];
    if (nb.frontMatter) {
      parts.push('---\n' + nb.frontMatter + '\n---\n');
    }
    nb.cells.forEach((cell, idx) => {
      if (idx > 0 || nb.frontMatter) parts.push('');
      if (cell.type === 'markdown') {
        const metaKeys = Object.keys(cell.meta || {});
        if (metaKeys.length) parts.push('+++ ' + JSON.stringify(cell.meta) + '\n');
        parts.push(cell.source);
      } else if (cell.type === 'code') {
        const lang = cell.meta.language || 'python';
        parts.push('```{code-cell} ' + lang);
        if (cell.meta.yamlMeta) parts.push('---\n' + cell.meta.yamlMeta + '\n---');
        parts.push(cell.source);
        parts.push('```');
      }
    });
    return parts.join('\n');
  }

  /* ── Admonition converter (line-by-line, reliable) ──────────────── */
  function convertAdmonitions(source) {
    const lines  = source.split('\n');
    const out    = [];
    let i = 0;
    while (i < lines.length) {
      const m = lines[i].match(/^:::[ \t]*\{(\w+)\}[ \t]*(.*)$/);
      if (m) {
        const t = m[1].toLowerCase();
        const displayTitle = m[2].trim() || (t.charAt(0).toUpperCase() + t.slice(1));
        i++;
        const content = [];
        while (i < lines.length && !/^:::[ \t]*$/.test(lines[i])) {
          content.push(lines[i]);
          i++;
        }
        i++; // skip closing :::
        out.push(`<div class="admonition ${escapeHtml(t)}">`);
        out.push(`<div class="admonition-title">${escapeHtml(displayTitle)}</div>`);
        if (content.length) out.push(content.join('\n').trim());
        out.push(`</div>`);
        out.push('');
      } else {
        out.push(lines[i]);
        i++;
      }
    }
    return out.join('\n');
  }

  /* ── Markdown renderer ───────────────────────────────────────────── */
  function renderMarkdownSource(source) {
    const mathStore = [];

    // Admonitions: :::{ type } optional-title\ncontent\n:::
    source = convertAdmonitions(source);

    // Display math $$...$$
    source = source.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
      mathStore.push({ display: true, html: renderMath(math, true) });
      return `\u0000MATH${mathStore.length - 1}\u0000`;
    });

    // Inline math $...$
    source = source.replace(/(?<!\$)\$(?!\$)((?:[^\$\n\\]|\\[\s\S])+?)\$(?!\$)/g, (_, math) => {
      mathStore.push({ display: false, html: renderMath(math, false) });
      return `\u0000MATH${mathStore.length - 1}\u0000`;
    });

    let html;
    try { html = marked.parse(source); }
    catch (e) { html = '<pre>' + escapeHtml(source) + '</pre>'; }

    html = html.replace(/\u0000MATH(\d+)\u0000/g, (_, idx) => {
      const m = mathStore[parseInt(idx)];
      return m.display
        ? `<div class="math-display">${m.html}</div>`
        : `<span class="math-inline">${m.html}</span>`;
    });

    return html;
  }

  /* ── Tab management ──────────────────────────────────────────────── */
  function addNotebook(parsed, fileName) {
    const id = nextId();
    notebooks.set(id, { id, fileName, frontMatter: parsed.frontMatter, cells: parsed.cells, editMode: false });
    tabOrder.push(id);
    switchTab(id);
  }

  function switchTab(id) {
    activeId = id;
    const nb = notebooks.get(id);
    nb.editMode = false; // reset edit mode on switch
    rerenderTabBar();
    buildNotebook(nb);
    showWorkspace();
  }

  function closeTab(id) {
    const idx = tabOrder.indexOf(id);
    notebooks.delete(id);
    tabOrder = tabOrder.filter(x => x !== id);
    if (tabOrder.length === 0) {
      activeId = null;
      showLanding();
    } else {
      // Switch to neighbor
      const nextIdx = Math.min(idx, tabOrder.length - 1);
      switchTab(tabOrder[nextIdx]);
    }
  }

  function rerenderTabBar() {
    nbTabbar.innerHTML = '';
    tabOrder.forEach(id => {
      const nb = notebooks.get(id);
      const tab = document.createElement('div');
      tab.className = 'nb-tab' + (id === activeId ? ' active' : '');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(id === activeId));
      tab.setAttribute('tabindex', id === activeId ? '0' : '-1');
      tab.title = nb.fileName;

      const name = document.createElement('span');
      name.className = 'tab-name';
      name.textContent = nb.fileName;

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close';
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Close ' + nb.fileName);
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(id);
      });

      tab.appendChild(name);
      tab.appendChild(closeBtn);
      tab.addEventListener('click', () => { if (activeId !== id) switchTab(id); });
      tab.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (activeId !== id) switchTab(id); }
      });

      nbTabbar.appendChild(tab);
    });

    // Spacer
    const spacer = document.createElement('div');
    spacer.className = 'tabbar-spacer';
    nbTabbar.appendChild(spacer);

    // Add button
    const addBtn = document.createElement('button');
    addBtn.className = 'tab-add-btn';
    addBtn.type = 'button';
    addBtn.title = 'Add notebook';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', openAddOverlay);
    nbTabbar.appendChild(addBtn);
  }

  /* ── Show / hide views ───────────────────────────────────────────── */
  function showLanding() {
    nbLanding.style.display = '';
    nbWorkspace.style.display = 'none';
    btnEditAll.textContent = 'Edit Mode';
    btnEditAll.classList.remove('active');
  }

  function showWorkspace() {
    nbLanding.style.display = 'none';
    nbWorkspace.style.display = '';
  }

  /* ── Build notebook DOM ──────────────────────────────────────────── */
  function buildNotebook(nb) {
    nbCells.innerHTML = '';

    // Sync Edit Mode button to notebook's editMode state
    btnEditAll.textContent = nb.editMode ? 'View Mode' : 'Edit Mode';
    btnEditAll.classList.toggle('active', nb.editMode);

    // Cell count
    const codeCount = nb.cells.filter(c => c.type === 'code').length;
    const mdCount   = nb.cells.filter(c => c.type === 'markdown').length;
    nbCellCount.textContent = `${nb.cells.length} cells (${codeCount} code, ${mdCount} md)`;

    // Front matter
    if (nb.frontMatter) {
      const fm = document.createElement('div');
      fm.className = 'frontmatter-cell';
      fm.innerHTML = `
        <button class="frontmatter-toggle" type="button" aria-expanded="false">
          <span class="frontmatter-arrow">&#9658;</span>
          <span>Notebook Metadata (front matter)</span>
        </button>
        <pre class="frontmatter-pre">${escapeHtml(nb.frontMatter)}</pre>`;
      fm.querySelector('.frontmatter-toggle').addEventListener('click', function () {
        const pre   = fm.querySelector('.frontmatter-pre');
        const arrow = fm.querySelector('.frontmatter-arrow');
        const open  = pre.classList.toggle('open');
        arrow.classList.toggle('open', open);
        this.setAttribute('aria-expanded', String(open));
      });
      nbCells.appendChild(fm);
    }

    nb.cells.forEach((cell, idx) => {
      nbCells.appendChild(buildCellElement(nb, cell, idx));
    });

    // If edit mode is on, open all editors after building
    if (nb.editMode) {
      nb.cells.forEach((cell, idx) => {
        const wrapper  = nbCells.querySelector(`[data-idx="${idx}"]`);
        const editBtn  = wrapper && wrapper.querySelector('.cell-action-btn');
        const textarea = wrapper && wrapper.querySelector('.cell-editor');
        if (wrapper && editBtn && textarea) openCellEdit(cell, wrapper, editBtn, textarea);
      });
    }
  }

  function buildCellElement(nb, cell, idx) {
    const isCode  = cell.type === 'code';
    const wrapper = document.createElement('div');
    wrapper.className = 'nb-cell';
    wrapper.dataset.idx = idx;

    // ── Cell header ──────────────────────────────────────────────────
    const header  = document.createElement('div');
    header.className = 'cell-header';

    const badge   = document.createElement('span');
    badge.className = 'cell-type-badge ' + (isCode ? 'badge-code' : 'badge-md');
    badge.innerHTML = isCode
      ? `<span class="cell-number">[${idx + 1}]</span> Code (${escapeHtml(cell.meta.language || 'python')})`
      : `<span class="cell-number">[${idx + 1}]</span> Markdown`;
    header.appendChild(badge);

    const actions = document.createElement('div');
    actions.className = 'cell-header-actions';

    // Copy button — code cells only
    if (isCode) {
      const copyBtn   = document.createElement('button');
      copyBtn.className = 'cell-action-btn';
      copyBtn.type    = 'button';
      copyBtn.textContent = 'Copy';
      copyBtn.title   = 'Copy cell source';
      copyBtn.addEventListener('click', () => copyToClipboard(cell.source, copyBtn, '✓'));
      actions.appendChild(copyBtn);
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'cell-action-btn';
    editBtn.textContent = 'Edit';
    editBtn.type  = 'button';
    editBtn.addEventListener('click', () => {
      const textarea = wrapper.querySelector('.cell-editor');
      if (textarea.classList.contains('visible')) {
        closeCellEdit(cell, wrapper, editBtn, textarea);
      } else {
        openCellEdit(cell, wrapper, editBtn, textarea);
      }
    });
    actions.appendChild(editBtn);
    header.appendChild(actions);
    wrapper.appendChild(header);

    // ── Cell body ────────────────────────────────────────────────────
    if (isCode) {
      const body  = document.createElement('div');
      body.className = 'code-cell-body';
      const pre   = document.createElement('pre');
      pre.className = 'code-cell-source';
      const code  = document.createElement('code');
      code.className = `language-${cell.meta.language || 'python'}`;
      code.textContent = cell.source;
      if (window.hljs) { try { hljs.highlightElement(code); } catch (_) {} }
      pre.appendChild(code);
      body.appendChild(pre);
      wrapper.appendChild(body);
    } else {
      const body  = document.createElement('div');
      body.className = 'cell-body';
      const rendered = document.createElement('div');
      rendered.className = 'cell-rendered';
      rendered.innerHTML = renderMarkdownSource(cell.source);
      body.appendChild(rendered);
      wrapper.appendChild(body);
    }

    // ── Edit textarea ────────────────────────────────────────────────
    const textarea = document.createElement('textarea');
    textarea.className = 'cell-editor';
    textarea.value = cell.source;
    textarea.setAttribute('aria-label', `Edit cell ${idx + 1}`);
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = textarea.selectionStart, en = textarea.selectionEnd;
        textarea.value = textarea.value.slice(0, s) + '  ' + textarea.value.slice(en);
        textarea.selectionStart = textarea.selectionEnd = s + 2;
      }
      if (e.key === 'Escape') closeCellEdit(cell, wrapper, editBtn, textarea);
    });
    wrapper.appendChild(textarea);

    // ── Tags row ─────────────────────────────────────────────────────
    const tags = (cell.meta && cell.meta.tags) || [];
    if (tags.length) {
      const tagRow = document.createElement('div');
      tagRow.className = 'cell-tags';
      tags.forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'cell-tag';
        chip.textContent = t;
        tagRow.appendChild(chip);
      });
      wrapper.appendChild(tagRow);
    }

    return wrapper;
  }

  /* ── Cell edit helpers ───────────────────────────────────────────── */
  function openCellEdit(cell, wrapper, editBtn, textarea) {
    textarea.value = cell.source;
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(100, textarea.scrollHeight) + 'px';
    textarea.classList.add('visible');
    editBtn.textContent = 'Save';
    editBtn.classList.add('active');
    textarea.focus();
  }

  function closeCellEdit(cell, wrapper, editBtn, textarea) {
    cell.source = textarea.value;
    if (cell.type === 'markdown') {
      const rendered = wrapper.querySelector('.cell-rendered');
      if (rendered) rendered.innerHTML = renderMarkdownSource(cell.source);
    } else {
      const code = wrapper.querySelector('code');
      if (code) {
        code.className = `language-${cell.meta.language || 'python'}`;
        code.textContent = cell.source;
        if (window.hljs) { try { hljs.highlightElement(code); } catch (_) {} }
      }
    }
    textarea.classList.remove('visible');
    editBtn.textContent = 'Edit';
    editBtn.classList.remove('active');
  }

  /* ── Global Edit Mode toggle ─────────────────────────────────────── */
  btnEditAll.addEventListener('click', () => {
    const nb = activeId && notebooks.get(activeId);
    if (!nb) return;
    nb.editMode = !nb.editMode;
    btnEditAll.textContent = nb.editMode ? 'View Mode' : 'Edit Mode';
    btnEditAll.classList.toggle('active', nb.editMode);
    nb.cells.forEach((cell, idx) => {
      const wrapper  = nbCells.querySelector(`[data-idx="${idx}"]`);
      const editBtn  = wrapper && wrapper.querySelector('.cell-action-btn:last-child');
      const textarea = wrapper && wrapper.querySelector('.cell-editor');
      if (!wrapper || !editBtn || !textarea) return;
      if (nb.editMode) openCellEdit(cell, wrapper, editBtn, textarea);
      else             closeCellEdit(cell, wrapper, editBtn, textarea);
    });
  });

  /* ── Copy source button ──────────────────────────────────────────── */
  btnCopySource.addEventListener('click', () => {
    const nb = activeId && notebooks.get(activeId);
    if (!nb) return;
    copyToClipboard(serializeMyST(nb), btnCopySource, '✓ Copied');
  });

  /* ── Download button ─────────────────────────────────────────────── */
  btnDownload.addEventListener('click', () => {
    const nb = activeId && notebooks.get(activeId);
    if (!nb) return;
    const blob = new Blob([serializeMyST(nb)], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = nb.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  /* ── Load helpers ────────────────────────────────────────────────── */
  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => { addNotebook(parseMyST(e.target.result), file.name); };
    reader.readAsText(file);
  }

  function loadText(text, fileName) {
    if (!text.trim()) return;
    addNotebook(parseMyST(text), fileName || 'untitled.md');
  }

  function loadFiles(fileList) {
    Array.from(fileList).forEach(loadFile);
  }

  /* ── Landing drop zone ───────────────────────────────────────────── */
  function setupDropZone(zone, input) {
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      loadFiles(e.dataTransfer.files);
      closeAddOverlay();
    });
    input.addEventListener('change', () => {
      loadFiles(input.files);
      input.value = '';
      closeAddOverlay();
    });
  }

  setupDropZone(dropZone, fileInput);
  setupDropZone(overlayDropZone, overlayFileInput);

  // Landing paste button
  btnPasteOpen.addEventListener('click', () => {
    loadText(pasteInput.value, pasteFilename.value || 'untitled.md');
    pasteInput.value = '';
    pasteFilename.value = '';
  });

  // Overlay paste button
  btnOverlayPaste.addEventListener('click', () => {
    loadText(overlayPasteInput.value, overlayPasteFilename.value || 'untitled.md');
    overlayPasteInput.value = '';
    overlayPasteFilename.value = '';
    closeAddOverlay();
  });

  /* ── Add overlay ─────────────────────────────────────────────────── */
  function openAddOverlay() {
    addOverlay.style.display = '';
    overlayPasteInput.value = '';
    overlayPasteFilename.value = '';
    overlayPasteInput.focus();
  }

  function closeAddOverlay() {
    addOverlay.style.display = 'none';
  }

  btnOverlayClose.addEventListener('click', closeAddOverlay);
  addOverlay.addEventListener('click', (e) => {
    if (e.target === addOverlay) closeAddOverlay();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && addOverlay.style.display !== 'none') closeAddOverlay();
  });

  /* ── Global paste event (auto-fill paste textarea on landing) ────── */
  document.addEventListener('paste', (e) => {
    // Only auto-fill if the landing is visible and the paste target isn't already an input
    const target = e.target;
    const isInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
    if (isInput) return;
    if (nbLanding.style.display === 'none') return;

    const text = e.clipboardData && e.clipboardData.getData('text');
    if (!text) return;
    e.preventDefault();
    pasteInput.value = text;
    pasteInput.focus();
    pasteInput.setSelectionRange(0, 0);
    pasteInput.scrollTop = 0;
  });

  /* ── Allow drag-and-drop anywhere on the document ───────────────── */
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      loadFiles(e.dataTransfer.files);
      closeAddOverlay();
    }
  });

  /* ── Tab bar horizontal scrolling with mouse wheel ──────────────── */
  nbTabbar.addEventListener('wheel', (e) => {
    // Enable horizontal scrolling with mouse wheel when cursor is in tab bar
    if (e.deltaY !== 0) {
      e.preventDefault();
      nbTabbar.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  /* ── Initial state ───────────────────────────────────────────────── */
  showLanding();

})();
