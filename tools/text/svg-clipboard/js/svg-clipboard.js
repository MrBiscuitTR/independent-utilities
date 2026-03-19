/* svg-clipboard.js */
'use strict';

(function () {

  // Comprehensive SVG icon collection for web design
  const svgIcons = [
    // ── Arrows ──────────────────────────────────────────────────────────
    { name: 'Arrow Right', category: 'arrows', tags: ['right', 'next', 'forward'], path: 'M5 12h14m-7-7 7 7-7 7' },
    { name: 'Arrow Left', category: 'arrows', tags: ['left', 'back', 'previous'], path: 'M19 12H5m7-7-7 7 7 7' },
    { name: 'Arrow Up', category: 'arrows', tags: ['up', 'top'], path: 'M12 19V5m-7 7 7-7 7 7' },
    { name: 'Arrow Down', category: 'arrows', tags: ['down', 'bottom'], path: 'M12 5v14m7-7-7 7-7-7' },
    { name: 'Arrow Up Right', category: 'arrows', tags: ['diagonal', 'external'], path: 'M7 17 17 7m0 0H7m10 0v10' },
    { name: 'Arrow Down Left', category: 'arrows', tags: ['diagonal'], path: 'M17 7 7 17m0 0h10M7 17V7' },
    { name: 'Arrow Up Left', category: 'arrows', tags: ['diagonal'], path: 'M17 17 7 7m0 0v10M7 7h10' },
    { name: 'Arrow Down Right', category: 'arrows', tags: ['diagonal'], path: 'M7 7l10 10m0 0V7m0 10H7' },
    { name: 'Chevron Right', category: 'arrows', tags: ['chevron', 'next', 'expand'], path: 'm9 18 6-6-6-6' },
    { name: 'Chevron Left', category: 'arrows', tags: ['chevron', 'back', 'collapse'], path: 'm15 18-6-6 6-6' },
    { name: 'Chevron Up', category: 'arrows', tags: ['chevron', 'collapse', 'accordion'], path: 'm18 15-6-6-6 6' },
    { name: 'Chevron Down', category: 'arrows', tags: ['chevron', 'expand', 'dropdown', 'accordion'], path: 'm6 9 6 6 6-6' },
    { name: 'Chevrons Right', category: 'arrows', tags: ['double', 'fast forward'], path: 'm13 17 5-5-5-5m-6 10 5-5-5-5' },
    { name: 'Chevrons Left', category: 'arrows', tags: ['double', 'rewind'], path: 'm11 17-5-5 5-5m6 10-5-5 5-5' },
    { name: 'Chevrons Up', category: 'arrows', tags: ['double', 'expand all'], path: 'm17 11-5-5-5 5m10 6-5-5-5 5' },
    { name: 'Chevrons Down', category: 'arrows', tags: ['double', 'collapse all'], path: 'm7 13 5 5 5-5M7 7l5 5 5-5' },
    { name: 'Caret Right', category: 'arrows', tags: ['caret', 'play', 'expand'], path: 'M6 4l12 8-12 8V4z', fill: true },
    { name: 'Caret Left', category: 'arrows', tags: ['caret'], path: 'M18 4L6 12l12 8V4z', fill: true },
    { name: 'Caret Up', category: 'arrows', tags: ['caret', 'sort'], path: 'M4 18l8-12 8 12H4z', fill: true },
    { name: 'Caret Down', category: 'arrows', tags: ['caret', 'dropdown', 'sort'], path: 'M4 6l8 12 8-12H4z', fill: true },
    { name: 'Arrow Circle Right', category: 'arrows', tags: ['circle', 'next'], path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm-2-14 4 4-4 4' },
    { name: 'Arrow Circle Left', category: 'arrows', tags: ['circle', 'back'], path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm2-14-4 4 4 4' },
    { name: 'Arrow Refresh', category: 'arrows', tags: ['refresh', 'reload', 'sync'], path: 'M4 4v6h6M20 20v-6h-6m.5-5A8 8 0 0 0 4.68 9.5M3.5 14.5A8 8 0 0 0 19.32 14.5' },
    { name: 'Arrow Repeat', category: 'arrows', tags: ['repeat', 'loop', 'cycle'], path: 'm17 1 4 4-4 4m0-4H7a4 4 0 0 0-4 4v1m4 14-4-4 4-4m0 4h10a4 4 0 0 0 4-4v-1' },
    { name: 'Arrow Sort', category: 'arrows', tags: ['sort', 'reorder'], path: 'M3 6h18M6 12h12m-9 6h6' },

    // ── Navigation / Menu ───────────────────────────────────────────────
    { name: 'Menu Hamburger', category: 'navigation', tags: ['hamburger', 'menu', 'toggle', 'sidebar'], path: 'M4 6h16M4 12h16M4 18h16' },
    { name: 'Menu Hamburger Alt', category: 'navigation', tags: ['hamburger', 'menu', 'toggle'], path: 'M4 6h16M4 12h10M4 18h16' },
    { name: 'Menu Dots Vertical', category: 'navigation', tags: ['kebab', 'more', 'options', 'menu'], circles: [{cx:12,cy:5,r:1},{cx:12,cy:12,r:1},{cx:12,cy:19,r:1}] },
    { name: 'Menu Dots Horizontal', category: 'navigation', tags: ['meatball', 'more', 'options', 'menu'], circles: [{cx:5,cy:12,r:1},{cx:12,cy:12,r:1},{cx:19,cy:12,r:1}] },
    { name: 'Menu Grid', category: 'navigation', tags: ['apps', 'grid', 'bento'], circles: [{cx:5,cy:5,r:1.5},{cx:12,cy:5,r:1.5},{cx:19,cy:5,r:1.5},{cx:5,cy:12,r:1.5},{cx:12,cy:12,r:1.5},{cx:19,cy:12,r:1.5},{cx:5,cy:19,r:1.5},{cx:12,cy:19,r:1.5},{cx:19,cy:19,r:1.5}] },
    { name: 'Close X', category: 'navigation', tags: ['close', 'x', 'cancel', 'remove', 'dismiss'], path: 'M18 6 6 18M6 6l12 12' },
    { name: 'Close Circle', category: 'navigation', tags: ['close', 'cancel', 'circle'], path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm3-13-6 6m0-6 6 6' },
    { name: 'Plus', category: 'navigation', tags: ['add', 'plus', 'new', 'create'], path: 'M12 5v14m-7-7h14' },
    { name: 'Plus Circle', category: 'navigation', tags: ['add', 'plus', 'circle'], path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-14v8m-4-4h8' },
    { name: 'Minus', category: 'navigation', tags: ['remove', 'subtract', 'minus'], path: 'M5 12h14' },
    { name: 'Minus Circle', category: 'navigation', tags: ['remove', 'minus', 'circle'], path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm-4-10h8' },
    { name: 'Home', category: 'navigation', tags: ['home', 'house', 'main'], path: 'M3 12l2-2m0 0 7-7 7 7m-14 0v9a1 1 0 0 0 1 1h4V14h4v6h4a1 1 0 0 0 1-1v-9m-5 0v5' },
    { name: 'External Link', category: 'navigation', tags: ['external', 'link', 'open', 'new tab'], path: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4-3h6m0 0v6m0-6L10 14' },
    { name: 'Link', category: 'navigation', tags: ['link', 'chain', 'url'], path: 'M10 14a3.5 3.5 0 0 0 5 0l4-4a3.5 3.5 0 0 0-5-5l-.5.5m1 7a3.5 3.5 0 0 1-5 0l-4-4a3.5 3.5 0 0 1 5-5l.5.5' },
    { name: 'Sidebar Left', category: 'navigation', tags: ['sidebar', 'panel', 'layout'], path: 'M3 3h18v18H3V3zm6 0v18' },
    { name: 'Sidebar Right', category: 'navigation', tags: ['sidebar', 'panel', 'layout'], path: 'M3 3h18v18H3V3zm12 0v18' },

    // ── UI Controls ─────────────────────────────────────────────────────
    { name: 'Check', category: 'ui-controls', tags: ['check', 'tick', 'done', 'complete', 'success'], path: 'M20 6 9 17l-5-5' },
    { name: 'Check Circle', category: 'ui-controls', tags: ['check', 'success', 'circle', 'complete'], path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm-3-10 2 2 4-4' },
    { name: 'Check Square', category: 'ui-controls', tags: ['checkbox', 'check', 'square'], path: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm6 5 2 2 4-4' },
    { name: 'Square', category: 'ui-controls', tags: ['checkbox', 'empty', 'unchecked'], path: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z' },
    { name: 'Circle', category: 'ui-controls', tags: ['radio', 'empty', 'unchecked'], path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z' },
    { name: 'Radio Checked', category: 'ui-controls', tags: ['radio', 'selected', 'checked'], path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', circles: [{cx:12,cy:12,r:4,fill:true}] },
    { name: 'Toggle Off', category: 'ui-controls', tags: ['toggle', 'switch', 'off'], path: 'M8 5h8a7 7 0 1 1 0 14H8A7 7 0 1 1 8 5z', circles: [{cx:8,cy:12,r:3}] },
    { name: 'Toggle On', category: 'ui-controls', tags: ['toggle', 'switch', 'on'], path: 'M8 5h8a7 7 0 1 1 0 14H8A7 7 0 1 1 8 5z', circles: [{cx:16,cy:12,r:3,fill:true}] },
    { name: 'Slider', category: 'ui-controls', tags: ['slider', 'range', 'adjust'], path: 'M4 12h5m3 0h8M12 9v6' },
    { name: 'Settings', category: 'ui-controls', tags: ['settings', 'gear', 'cog', 'preferences'], path: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8.13-2.63a7.5 7.5 0 0 0 0-1.74l1.68-1.32a.4.4 0 0 0 .1-.51l-1.6-2.76a.4.4 0 0 0-.49-.17l-1.98.8a7 7 0 0 0-1.5-.87l-.3-2.1a.4.4 0 0 0-.4-.34h-3.18a.4.4 0 0 0-.4.34l-.3 2.1a7 7 0 0 0-1.5.87l-1.98-.8a.4.4 0 0 0-.49.17l-1.6 2.76a.4.4 0 0 0 .1.51l1.68 1.32a7.5 7.5 0 0 0 0 1.74l-1.68 1.32a.4.4 0 0 0-.1.51l1.6 2.76a.4.4 0 0 0 .49.17l1.98-.8c.46.35.97.64 1.5.87l.3 2.1a.4.4 0 0 0 .4.34h3.18a.4.4 0 0 0 .4-.34l.3-2.1a7 7 0 0 0 1.5-.87l1.98.8a.4.4 0 0 0 .49-.17l1.6-2.76a.4.4 0 0 0-.1-.51l-1.68-1.32z' },
    { name: 'Filter', category: 'ui-controls', tags: ['filter', 'funnel', 'sort'], path: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z' },
    { name: 'Search', category: 'ui-controls', tags: ['search', 'magnify', 'find', 'look'], path: 'M21 21l-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z' },
    { name: 'Edit Pencil', category: 'ui-controls', tags: ['edit', 'pencil', 'write', 'modify'], path: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7m-1.5-10.5a2.12 2.12 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z' },
    { name: 'Trash', category: 'ui-controls', tags: ['delete', 'trash', 'remove', 'bin'], path: 'M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-6 5v6m4-6v6' },
    { name: 'Copy', category: 'ui-controls', tags: ['copy', 'duplicate', 'clone'], path: 'M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M16 4h2a2 2 0 0 1 2 2v2M8 4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2m-8 0v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4' },
    { name: 'Clipboard', category: 'ui-controls', tags: ['clipboard', 'paste'], path: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2m4-2h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h0' },
    { name: 'Download', category: 'ui-controls', tags: ['download', 'save', 'export'], path: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3' },
    { name: 'Upload', category: 'ui-controls', tags: ['upload', 'import'], path: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m14-7-5-5-5 5m5-5v12' },
    { name: 'Refresh', category: 'ui-controls', tags: ['refresh', 'reload', 'sync'], path: 'M1 4v6h6M23 20v-6h-6m-1-4a8 8 0 0 0-14 4m20 0a8 8 0 0 1-14 4' },
    { name: 'Expand', category: 'ui-controls', tags: ['expand', 'fullscreen', 'maximize'], path: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3' },
    { name: 'Collapse', category: 'ui-controls', tags: ['collapse', 'minimize', 'shrink'], path: 'M4 9h4V5M20 9h-4V5m0 14v-4h4M4 15h4v4' },
    { name: 'Eye', category: 'ui-controls', tags: ['eye', 'view', 'visible', 'show'], path: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', circles: [{cx:12,cy:12,r:3}] },
    { name: 'Eye Off', category: 'ui-controls', tags: ['eye', 'hide', 'invisible', 'hidden'], path: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22' },
    { name: 'Lock', category: 'ui-controls', tags: ['lock', 'secure', 'password'], path: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zm2 0V7a5 5 0 1 1 10 0v4' },
    { name: 'Unlock', category: 'ui-controls', tags: ['unlock', 'open'], path: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zm2 0V7a5 5 0 0 1 9-3' },
    { name: 'Info', category: 'ui-controls', tags: ['info', 'information', 'about', 'help'], path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-14v0m0 4v4' },
    { name: 'Warning', category: 'ui-controls', tags: ['warning', 'alert', 'caution', 'exclamation'], path: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01' },
    { name: 'Question', category: 'ui-controls', tags: ['question', 'help', 'faq'], path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-6v0m0-2a2.5 2.5 0 0 0 1-4.5 2.5 2.5 0 0 0-3 2' },
    { name: 'Bell', category: 'ui-controls', tags: ['bell', 'notification', 'alert'], path: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9m-4.27 13a2 2 0 0 1-3.46 0' },
    { name: 'Star', category: 'ui-controls', tags: ['star', 'favorite', 'rating'], path: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
    { name: 'Heart', category: 'ui-controls', tags: ['heart', 'love', 'like', 'favorite'], path: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' },
    { name: 'Bookmark', category: 'ui-controls', tags: ['bookmark', 'save', 'flag'], path: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z' },

    // ── Media ───────────────────────────────────────────────────────────
    { name: 'Play', category: 'media', tags: ['play', 'start', 'video', 'audio'], path: 'M5 3l14 9-14 9V3z', fill: true },
    { name: 'Play Circle', category: 'media', tags: ['play', 'video', 'circle'], path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm-2-14l6 4-6 4V8z' },
    { name: 'Pause', category: 'media', tags: ['pause', 'stop'], path: 'M6 4h4v16H6V4zm8 0h4v16h-4V4z' },
    { name: 'Stop', category: 'media', tags: ['stop', 'end'], path: 'M6 6h12v12H6V6z', fill: true },
    { name: 'Skip Forward', category: 'media', tags: ['skip', 'next', 'forward'], path: 'M5 4l10 8-10 8V4zm14 0v16' },
    { name: 'Skip Back', category: 'media', tags: ['skip', 'previous', 'back'], path: 'M19 20L9 12l10-8v16zM5 4v16' },
    { name: 'Fast Forward', category: 'media', tags: ['fast forward', 'speed'], path: 'M13 19V5l8 7-8 7zm-11 0V5l8 7-8 7z' },
    { name: 'Rewind', category: 'media', tags: ['rewind', 'back'], path: 'M11 19V5L3 12l8 7zm11 0V5l-8 7 8 7z' },
    { name: 'Volume High', category: 'media', tags: ['volume', 'sound', 'audio', 'speaker'], path: 'M11 5 6 9H2v6h4l5 4V5zm8 4a5 5 0 0 1 0 6M15.54 6.46a9 9 0 0 1 0 12.73' },
    { name: 'Volume Low', category: 'media', tags: ['volume', 'sound', 'audio'], path: 'M11 5 6 9H2v6h4l5 4V5zm4.54 3.46a5 5 0 0 1 0 7.07' },
    { name: 'Volume Mute', category: 'media', tags: ['mute', 'silent', 'volume off'], path: 'M11 5 6 9H2v6h4l5 4V5zm12 4-6 6m0-6 6 6' },
    { name: 'Mic', category: 'media', tags: ['microphone', 'audio', 'record'], path: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zm7 11a7 7 0 0 1-14 0m7 7v4m-4 0h8' },
    { name: 'Camera', category: 'media', tags: ['camera', 'photo', 'image'], path: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2v11z', circles: [{cx:12,cy:13,r:4}] },
    { name: 'Video', category: 'media', tags: ['video', 'camera', 'record'], path: 'M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z' },
    { name: 'Image', category: 'media', tags: ['image', 'photo', 'picture'], path: 'M3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm18 14-4-5-3 3-5-5-7 9', circles: [{cx:8.5,cy:8.5,r:1.5}] },
    { name: 'Music', category: 'media', tags: ['music', 'audio', 'song'], path: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z' },

    // ── Social ──────────────────────────────────────────────────────────
    { name: 'Share', category: 'social', tags: ['share', 'send', 'forward'], path: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8m-4-6-4-4-4 4m4-4v13' },
    { name: 'Share Alt', category: 'social', tags: ['share', 'nodes', 'network'], circles: [{cx:18,cy:5,r:3},{cx:6,cy:12,r:3},{cx:18,cy:19,r:3}], path: 'M8.59 13.51l6.83 3.98m-.01-10.98l-6.82 3.98' },
    { name: 'User', category: 'social', tags: ['user', 'person', 'profile', 'account'], path: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', circles: [{cx:12,cy:7,r:4}] },
    { name: 'Users', category: 'social', tags: ['users', 'people', 'group', 'team'], path: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m22 0v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75', circles: [{cx:9,cy:7,r:4}] },
    { name: 'User Plus', category: 'social', tags: ['add user', 'invite', 'register'], path: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m13-7h6m-3-3v6', circles: [{cx:9,cy:7,r:4}] },
    { name: 'Message', category: 'social', tags: ['message', 'chat', 'comment', 'bubble'], path: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z' },
    { name: 'Messages', category: 'social', tags: ['messages', 'chat', 'conversation'], path: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' },
    { name: 'Send', category: 'social', tags: ['send', 'paper plane', 'message'], path: 'M22 2 11 13m11-11-7 20-4-9-9-4 20-7z' },
    { name: 'Mail', category: 'social', tags: ['mail', 'email', 'envelope', 'message'], path: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm18 2-10 7L2 6' },
    { name: 'Phone', category: 'social', tags: ['phone', 'call', 'contact'], path: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.97.36 1.93.69 2.85a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.92.33 1.88.56 2.85.69a2 2 0 0 1 1.72 2.04z' },
    { name: 'Globe', category: 'social', tags: ['globe', 'world', 'web', 'internet', 'language'], path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm-10-10h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2' },
    { name: 'Rss', category: 'social', tags: ['rss', 'feed', 'subscribe'], circles: [{cx:5,cy:19,r:1}], path: 'M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16' },

    // ── Common ──────────────────────────────────────────────────────────
    { name: 'File', category: 'common', tags: ['file', 'document', 'page'], path: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-2 0v6h6' },
    { name: 'Folder', category: 'common', tags: ['folder', 'directory'], path: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z' },
    { name: 'Folder Open', category: 'common', tags: ['folder', 'open', 'directory'], path: 'M5 19a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1M5 19h14a2 2 0 0 0 2-2l1-7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2l1 7a2 2 0 0 0 2 2z' },
    { name: 'Calendar', category: 'common', tags: ['calendar', 'date', 'schedule', 'event'], path: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18' },
    { name: 'Clock', category: 'common', tags: ['clock', 'time', 'schedule'], path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-14v6l4 2' },
    { name: 'Map Pin', category: 'common', tags: ['location', 'pin', 'map', 'place', 'marker'], path: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', circles: [{cx:12,cy:10,r:3}] },
    { name: 'Navigation', category: 'common', tags: ['navigation', 'compass', 'direction'], path: 'M12 2 4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z', fill: true },
    { name: 'Tag', category: 'common', tags: ['tag', 'label', 'price'], path: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z', circles: [{cx:7,cy:7,r:1}] },
    { name: 'Tags', category: 'common', tags: ['tags', 'labels', 'categories'], path: 'M8 6H2v8l9.59 9.59a2 2 0 0 0 2.83 0l6.17-6.17a2 2 0 0 0 0-2.83L11 6h0m0 0V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8', circles: [{cx:5,cy:9,r:1}] },
    { name: 'Gift', category: 'common', tags: ['gift', 'present', 'reward'], path: 'M20 12v10H4V12M2 7h20v5H2V7zm10 15V7m0 0H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zm0 0h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z' },
    { name: 'Shopping Cart', category: 'common', tags: ['cart', 'shopping', 'ecommerce', 'buy'], circles: [{cx:9,cy:21,r:1},{cx:20,cy:21,r:1}], path: 'M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6' },
    { name: 'Shopping Bag', category: 'common', tags: ['bag', 'shopping', 'ecommerce'], path: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6zm0 4h12M16 10a4 4 0 1 1-8 0' },
    { name: 'Credit Card', category: 'common', tags: ['credit card', 'payment', 'purchase'], path: 'M1 5h22v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5zm0 4h22' },
    { name: 'Printer', category: 'common', tags: ['printer', 'print', 'document'], path: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2m-12 0h12v4H6v-4z' },
    { name: 'Layout', category: 'common', tags: ['layout', 'template', 'grid'], path: 'M3 3h18v18H3V3zm0 6h18M9 9v12' },
    { name: 'Layers', category: 'common', tags: ['layers', 'stack', 'depth'], path: 'M12 2 2 7l10 5 10-5-10-5zm0 18L2 15l10 5 10-5-10 5zm0-5L2 10l10 5 10-5-10 5z' },
    { name: 'Code', category: 'common', tags: ['code', 'developer', 'programming'], path: 'm16 18 6-6-6-6M8 6l-6 6 6 6' },
    { name: 'Terminal', category: 'common', tags: ['terminal', 'console', 'command'], path: 'M4 17l6-6-6-6m8 14h8' },
    { name: 'Database', category: 'common', tags: ['database', 'storage', 'data'], path: 'M12 2C6.48 2 2 4.24 2 7v10c0 2.76 4.48 5 10 5s10-2.24 10-5V7c0-2.76-4.48-5-10-5zm10 10c0 2.76-4.48 5-10 5S2 14.76 2 12m20 0c0-2.76-4.48-5-10-5S2 9.24 2 12' },
    { name: 'Cloud', category: 'common', tags: ['cloud', 'storage', 'upload'], path: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z' },
    { name: 'Sun', category: 'common', tags: ['sun', 'light', 'day', 'brightness'], circles: [{cx:12,cy:12,r:5}], path: 'M12 1v2m0 18v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42' },
    { name: 'Moon', category: 'common', tags: ['moon', 'dark', 'night', 'theme'], path: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' },
    { name: 'Zap', category: 'common', tags: ['zap', 'lightning', 'flash', 'power'], path: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z', fill: true }
  ];

  // DOM refs
  const searchInput = document.getElementById('svgSearch');
  const categorySelect = document.getElementById('svgCat');
  const sizeSelect = document.getElementById('svgSize');
  const strokeSelect = document.getElementById('svgStroke');
  const colorInput = document.getElementById('svgColor');
  const countDisplay = document.getElementById('svgCount');
  const grid = document.getElementById('svgGrid');
  const toast = document.getElementById('copiedToast');

  // State
  let currentSize = 24;
  let currentStroke = 2;
  let currentColor = '#000000';

  // Generate SVG string
  function generateSvg(icon, size, stroke, color) {
    const fill = icon.fill ? color : 'none';
    let inner = '';

    if (icon.path) {
      inner += `<path d="${icon.path}" fill="${fill}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    if (icon.circles) {
      icon.circles.forEach(c => {
        const circleFill = c.fill ? color : 'none';
        inner += `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${circleFill}" stroke="${color}" stroke-width="${stroke}"/>`;
      });
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }

  // Copy to clipboard
  function copyToClipboard(text, card) {
    navigator.clipboard.writeText(text).then(() => {
      // Show feedback on card
      card.classList.add('copied');
      setTimeout(() => card.classList.remove('copied'), 300);

      // Show toast
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    });
  }

  // Render grid
  function renderGrid() {
    const query = searchInput.value.toLowerCase().trim();
    const category = categorySelect.value;
    currentSize = parseInt(sizeSelect.value);
    currentStroke = parseFloat(strokeSelect.value);
    currentColor = colorInput.value;

    let filtered = svgIcons;

    // Filter by category
    if (category) {
      filtered = filtered.filter(i => i.category === category);
    }

    // Filter by search
    if (query) {
      filtered = filtered.filter(i => {
        const nameMatch = i.name.toLowerCase().includes(query);
        const tagMatch = i.tags.some(t => t.includes(query));
        const catMatch = i.category.includes(query);
        return nameMatch || tagMatch || catMatch;
      });
    }

    // Group by category if showing all
    const grouped = !category && !query;
    let html = '';

    if (grouped) {
      const categories = ['arrows', 'navigation', 'ui-controls', 'media', 'social', 'common'];
      const categoryNames = {
        'arrows': 'Arrows & Chevrons',
        'navigation': 'Navigation & Menu',
        'ui-controls': 'UI Controls',
        'media': 'Media',
        'social': 'Social & Communication',
        'common': 'Common'
      };

      categories.forEach(cat => {
        const catIcons = filtered.filter(i => i.category === cat);
        if (catIcons.length === 0) return;

        html += `<div class="category-header">${categoryNames[cat]} (${catIcons.length})</div>`;
        catIcons.forEach(icon => {
          html += renderCard(icon);
        });
      });
    } else {
      filtered.forEach(icon => {
        html += renderCard(icon);
      });
    }

    grid.innerHTML = html;
    countDisplay.textContent = `${filtered.length} icons`;

    // Add click handlers
    grid.querySelectorAll('.svg-card').forEach(card => {
      card.addEventListener('click', () => {
        const iconName = card.dataset.name;
        const icon = svgIcons.find(i => i.name === iconName);
        if (icon) {
          const svg = generateSvg(icon, currentSize, currentStroke, currentColor);
          copyToClipboard(svg, card);
        }
      });
    });
  }

  function renderCard(icon) {
    const previewSvg = generateSvg(icon, 32, 2, currentColor);
    const categoryLabel = icon.category.replace('-', ' ');

    return `
      <div class="svg-card" data-name="${icon.name}">
        <div class="svg-preview">${previewSvg}</div>
        <div class="svg-name">${icon.name}</div>
        <div class="svg-category">${categoryLabel}</div>
      </div>
    `;
  }

  // Event listeners
  searchInput.addEventListener('input', renderGrid);
  categorySelect.addEventListener('change', renderGrid);
  sizeSelect.addEventListener('change', renderGrid);
  strokeSelect.addEventListener('change', renderGrid);
  colorInput.addEventListener('input', renderGrid);

  // Initial render
  renderGrid();

})();
