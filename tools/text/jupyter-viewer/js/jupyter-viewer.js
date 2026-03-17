/* jupyter-viewer.js — MyST Notebook Viewer */
'use strict';

(function () {

  /* ── State ───────────────────────────────────────────────────────── */
  let notebookData = null; // { frontMatter, cells, rawSource, fileName }
  let globalEditMode = false;

  /* ── DOM refs ────────────────────────────────────────────────────── */
  const dropZone      = document.getElementById('drop-zone');
  const fileInput     = document.getElementById('file-input');
  const nbWorkspace   = document.getElementById('nb-workspace');
  const nbCells       = document.getElementById('nb-cells');
  const nbFilename    = document.getElementById('nb-filename');
  const nbCellCount   = document.getElementById('nb-cell-count');
  const btnEditAll    = document.getElementById('btn-edit-all');
  const btnClose      = document.getElementById('btn-close');
  const btnDownload   = document.getElementById('btn-download');

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

    // Extract YAML front matter (--- ... ---)
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
      if (text) {
        cells.push({ type: 'markdown', source: text, meta: { ...currentMeta } });
      }
      currentLines = [];
      currentMeta = {};
    }

    while (i < lines.length) {
      const line = lines[i];

      // +++ cell separator (new markdown cell)
      if (/^\+\+\+[ \t]*(\{.*\})?[ \t]*$/.test(line)) {
        flushMarkdown();
        const jsonPart = line.slice(3).trim();
        if (jsonPart) {
          try { currentMeta = JSON.parse(jsonPart); } catch (_) { currentMeta = {}; }
        }
        i++;
        continue;
      }

      // ```{code-cell} lang — start of a code cell
      if (/^```\{code-cell\}/.test(line)) {
        flushMarkdown();
        const langMatch = line.match(/^```\{code-cell\}\s*(\w+)?/);
        const lang = (langMatch && langMatch[1]) || 'python';
        const cellMeta = { language: lang };
        i++;

        // Optional YAML front matter inside code cell (--- ... ---)
        if (i < lines.length && lines[i].trim() === '---') {
          i++;
          const yamlLines = [];
          while (i < lines.length && lines[i].trim() !== '---') {
            yamlLines.push(lines[i]);
            i++;
          }
          if (i < lines.length) i++; // skip closing ---
          cellMeta.yamlMeta = yamlLines.join('\n');
          // Extract tags: tags: [a, b, c]  or  tags:\n  - a
          const tagsInline = cellMeta.yamlMeta.match(/^tags:\s*\[([^\]]*)\]/m);
          const tagsList   = cellMeta.yamlMeta.match(/^tags:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m);
          if (tagsInline) {
            cellMeta.tags = tagsInline[1].split(',').map(t => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
          } else if (tagsList) {
            cellMeta.tags = tagsList[1].match(/^\s+-\s*(.+)$/gm)
              .map(s => s.replace(/^\s+-\s*/, '').trim().replace(/^['"]|['"]$/g, ''));
          }
        }

        // Collect code until closing ```
        const codeLines = [];
        while (i < lines.length && !/^```[ \t]*$/.test(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++; // skip closing ```

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
  function serializeMyST() {
    if (!notebookData) return '';
    const parts = [];

    if (notebookData.frontMatter) {
      parts.push('---\n' + notebookData.frontMatter + '\n---\n');
    }

    notebookData.cells.forEach((cell, idx) => {
      if (idx > 0 || notebookData.frontMatter) parts.push('');

      if (cell.type === 'markdown') {
        // Optional +++ metadata
        const metaKeys = Object.keys(cell.meta || {});
        if (metaKeys.length) {
          parts.push('+++ ' + JSON.stringify(cell.meta) + '\n');
        }
        parts.push(cell.source);
      } else if (cell.type === 'code') {
        const lang = cell.meta.language || 'python';
        parts.push('```{code-cell} ' + lang);
        if (cell.meta.yamlMeta) {
          parts.push('---\n' + cell.meta.yamlMeta + '\n---');
        }
        parts.push(cell.source);
        parts.push('```');
      }
    });

    return parts.join('\n');
  }

  /* ── Markdown renderer ───────────────────────────────────────────── */
  function renderMarkdownSource(source) {
    const mathStore = [];

    // Step 1: Handle admonitions  (:::{type} optional-title\ncontent\n:::)
    source = source.replace(/^:::[ \t]*\{(\w+)\}[ \t]*(.*?)\n([\s\S]*?)^:::[ \t]*$/gm,
      (_, type, title, inner) => {
        const t = type.toLowerCase();
        const displayTitle = title.trim() || (t.charAt(0).toUpperCase() + t.slice(1));
        // Indent inner so marked.js doesn't see the outer div as a block continuation
        const innerText = inner.trim();
        return [
          `<div class="admonition ${escapeHtml(t)}">`,
          `<div class="admonition-title">${escapeHtml(displayTitle)}</div>`,
          innerText,
          `</div>`,
          ''
        ].join('\n');
      }
    );

    // Step 2: Extract display math $$...$$
    source = source.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
      mathStore.push({ display: true, html: renderMath(math, true) });
      return `\u0000MATH${mathStore.length - 1}\u0000`;
    });

    // Step 3: Extract inline math $...$  (not $$)
    source = source.replace(/(?<!\$)\$(?!\$)((?:[^\$\n\\]|\\[\s\S])+?)\$(?!\$)/g, (_, math) => {
      mathStore.push({ display: false, html: renderMath(math, false) });
      return `\u0000MATH${mathStore.length - 1}\u0000`;
    });

    // Step 4: Run marked
    let html;
    try {
      html = marked.parse(source);
    } catch (e) {
      html = '<pre>' + escapeHtml(source) + '</pre>';
    }

    // Step 5: Restore math
    html = html.replace(/\u0000MATH(\d+)\u0000/g, (_, idx) => {
      const m = mathStore[parseInt(idx)];
      return m.display
        ? `<div class="math-display">${m.html}</div>`
        : `<span class="math-inline">${m.html}</span>`;
    });

    return html;
  }

  /* ── Build notebook DOM ──────────────────────────────────────────── */
  function buildNotebook() {
    nbCells.innerHTML = '';

    // Front matter block
    if (notebookData.frontMatter) {
      const fm = document.createElement('div');
      fm.className = 'frontmatter-cell';
      fm.innerHTML = `
        <button class="frontmatter-toggle" type="button" aria-expanded="false">
          <span class="frontmatter-arrow">&#9658;</span>
          <span>Notebook Metadata (front matter)</span>
        </button>
        <pre class="frontmatter-pre">${escapeHtml(notebookData.frontMatter)}</pre>`;
      fm.querySelector('.frontmatter-toggle').addEventListener('click', function () {
        const pre = fm.querySelector('.frontmatter-pre');
        const arrow = fm.querySelector('.frontmatter-arrow');
        const open = pre.classList.toggle('open');
        arrow.classList.toggle('open', open);
        this.setAttribute('aria-expanded', String(open));
      });
      nbCells.appendChild(fm);
    }

    notebookData.cells.forEach((cell, idx) => {
      const el = buildCellElement(cell, idx);
      nbCells.appendChild(el);
    });

    // Update counts
    const codeCount = notebookData.cells.filter(c => c.type === 'code').length;
    const mdCount   = notebookData.cells.filter(c => c.type === 'markdown').length;
    nbCellCount.textContent = `${notebookData.cells.length} cells (${codeCount} code, ${mdCount} markdown)`;
  }

  function buildCellElement(cell, idx) {
    const isCode = cell.type === 'code';
    const wrapper = document.createElement('div');
    wrapper.className = 'nb-cell';
    wrapper.dataset.idx = idx;

    // ── Cell header ──────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'cell-header';

    const badge = document.createElement('span');
    badge.className = 'cell-type-badge ' + (isCode ? 'badge-code' : 'badge-md');
    badge.innerHTML = isCode
      ? `<span class="cell-number">[${idx + 1}]</span> Code (${escapeHtml(cell.meta.language || 'python')})`
      : `<span class="cell-number">[${idx + 1}]</span> Markdown`;
    header.appendChild(badge);

    const actions = document.createElement('div');
    actions.className = 'cell-header-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'cell-action-btn';
    editBtn.textContent = 'Edit';
    editBtn.type = 'button';
    editBtn.addEventListener('click', () => toggleCellEdit(cell, idx, wrapper, editBtn));
    actions.appendChild(editBtn);

    header.appendChild(actions);
    wrapper.appendChild(header);

    // ── Cell body ────────────────────────────────────────────────────
    if (isCode) {
      const body = document.createElement('div');
      body.className = 'code-cell-body';

      const pre = document.createElement('pre');
      pre.className = 'code-cell-source';
      const code = document.createElement('code');
      const lang = cell.meta.language || 'python';
      code.className = `language-${lang}`;
      code.textContent = cell.source;
      // Apply highlight.js
      if (window.hljs) {
        try { hljs.highlightElement(code); } catch (_) {}
      }
      pre.appendChild(code);
      body.appendChild(pre);
      wrapper.appendChild(body);
    } else {
      const body = document.createElement('div');
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
      // Auto-grow
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end   = textarea.selectionEnd;
        textarea.value = textarea.value.slice(0, start) + '  ' + textarea.value.slice(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }
      if (e.key === 'Escape') {
        closeCellEdit(cell, idx, wrapper, editBtn, textarea);
      }
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

  /* ── Cell edit toggle ────────────────────────────────────────────── */
  function toggleCellEdit(cell, idx, wrapper, editBtn) {
    const textarea = wrapper.querySelector('.cell-editor');
    if (textarea.classList.contains('visible')) {
      closeCellEdit(cell, idx, wrapper, editBtn, textarea);
    } else {
      openCellEdit(cell, idx, wrapper, editBtn, textarea);
    }
  }

  function openCellEdit(cell, idx, wrapper, editBtn, textarea) {
    textarea.classList.add('visible');
    textarea.value = cell.source;
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(100, textarea.scrollHeight) + 'px';
    editBtn.textContent = 'Save';
    editBtn.classList.add('active');
    textarea.focus();
  }

  function closeCellEdit(cell, idx, wrapper, editBtn, textarea) {
    const newSource = textarea.value;
    cell.source = newSource;

    // Re-render the cell body
    if (cell.type === 'markdown') {
      const rendered = wrapper.querySelector('.cell-rendered');
      if (rendered) rendered.innerHTML = renderMarkdownSource(newSource);
    } else {
      const code = wrapper.querySelector('code');
      if (code) {
        code.className = `language-${cell.meta.language || 'python'}`;
        code.textContent = newSource;
        if (window.hljs) {
          try { hljs.highlightElement(code); } catch (_) {}
        }
      }
    }

    textarea.classList.remove('visible');
    editBtn.textContent = 'Edit';
    editBtn.classList.remove('active');
  }

  /* ── Global edit mode toggle ─────────────────────────────────────── */
  btnEditAll.addEventListener('click', () => {
    globalEditMode = !globalEditMode;
    btnEditAll.textContent = globalEditMode ? 'View Mode' : 'Edit Mode';
    btnEditAll.classList.toggle('active', globalEditMode);

    // Show/hide all editors
    notebookData.cells.forEach((cell, idx) => {
      const wrapper = nbCells.querySelector(`[data-idx="${idx}"]`);
      if (!wrapper) return;
      const textarea = wrapper.querySelector('.cell-editor');
      const editBtn  = wrapper.querySelector('.cell-action-btn');
      if (globalEditMode) {
        openCellEdit(cell, idx, wrapper, editBtn, textarea);
      } else {
        closeCellEdit(cell, idx, wrapper, editBtn, textarea);
      }
    });
  });

  /* ── Load file ───────────────────────────────────────────────────── */
  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const source = e.target.result;
      const parsed = parseMyST(source);
      notebookData = { ...parsed, rawSource: source, fileName: file.name };
      showNotebook();
    };
    reader.readAsText(file);
  }

  function showNotebook() {
    dropZone.style.display = 'none';
    nbWorkspace.style.display = '';
    nbFilename.textContent = notebookData.fileName;
    globalEditMode = false;
    btnEditAll.textContent = 'Edit Mode';
    btnEditAll.classList.remove('active');
    buildNotebook();
  }

  /* ── Close / download ────────────────────────────────────────────── */
  btnClose.addEventListener('click', () => {
    notebookData = null;
    nbCells.innerHTML = '';
    nbWorkspace.style.display = 'none';
    dropZone.style.display = '';
    fileInput.value = '';
  });

  btnDownload.addEventListener('click', () => {
    if (!notebookData) return;
    const myst = serializeMyST();
    const blob = new Blob([myst], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = notebookData.fileName || 'notebook.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  /* ── Drop zone events ────────────────────────────────────────────── */
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  // Allow dropping onto the notebook workspace too (to reload)
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

})();
