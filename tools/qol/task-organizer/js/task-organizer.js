/* task-organizer.js
   Pure JS drag-and-drop task board.
   Storage: localStorage key "to_board_v1"
   Auto-clears if last save was > 30 days ago.
   No external dependencies or API calls.
*/
"use strict";

// ── Storage keys ─────────────────────────────────────────────────────────────
const LS_KEY      = "to_board_v1";
const LS_LABEL_KEY= "to_labels_v1";
const LS_TS_KEY   = "to_board_ts";   // last-save timestamp

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
    columns: [],   // [ { id, name, tasks: [ { id, title, desc, due, priority, color, timeLimit, labels } ] } ]
};
let labels = [];  // [ { id, name, color } ]

// ── Helpers ──────────────────────────────────────────────────────────────────
function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    localStorage.setItem(LS_LABEL_KEY, JSON.stringify(labels));
    localStorage.setItem(LS_TS_KEY, Date.now().toString());
}

function load() {
    const ts = parseInt(localStorage.getItem(LS_TS_KEY) || "0", 10);
    const age = Date.now() - ts;
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    if (ts && age > THIRTY_DAYS) {
        // Auto-clear stale data
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(LS_LABEL_KEY);
        localStorage.removeItem(LS_TS_KEY);
        document.getElementById("storageNote").textContent =
            "Your previous board was cleared (30 days of inactivity). Starting fresh!";
    }

    const raw = localStorage.getItem(LS_KEY);
    const rawLabels = localStorage.getItem(LS_LABEL_KEY);

    if (rawLabels) {
        try { labels = JSON.parse(rawLabels); } catch(_) { labels = []; }
    }
    if (raw) {
        try { state = JSON.parse(raw); } catch(_) {}
    }

    // Default columns if empty
    if (!state.columns || state.columns.length === 0) {
        state.columns = [
            { id: uid(), name: "To Do",      tasks: [] },
            { id: uid(), name: "In Progress", tasks: [] },
            { id: uid(), name: "Done",        tasks: [] },
        ];
        save();
    }
}

function getLabelById(id) {
    return labels.find(l => l.id === id);
}

function getColumnById(id) {
    return state.columns.find(c => c.id === id);
}

function getTaskById(taskId) {
    for (const col of state.columns) {
        const t = col.tasks.find(t => t.id === taskId);
        if (t) return { task: t, column: col };
    }
    return null;
}

function isOverdue(due) {
    if (!due) return false;
    return new Date(due) < new Date(new Date().toDateString());
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll() {
    renderLabelBar();
    renderBoard();
}

function renderLabelBar() {
    const chips = document.getElementById("labelChips");
    chips.innerHTML = "";
    labels.forEach(label => {
        const chip = document.createElement("button");
        chip.className = "to-label-chip";
        chip.style.background = label.color;
        chip.innerHTML = `${escHtml(label.name)} <span class="to-chip-edit" title="Edit">✎</span>`;
        chip.addEventListener("click", () => openLabelModal(label.id));
        chips.appendChild(chip);
    });
}

function renderBoard() {
    const board = document.getElementById("board");
    board.innerHTML = "";
    state.columns.forEach(col => {
        board.appendChild(buildColumn(col));
    });
    initDragAndDrop();
}

function buildColumn(col) {
    const el = document.createElement("div");
    el.className = "to-column";
    el.dataset.colId = col.id;

    el.innerHTML = `
        <div class="to-column-header" data-col-id="${col.id}">
            <span class="to-col-title">${escHtml(col.name)}</span>
            <span class="to-col-count">${col.tasks.length}</span>
            <button class="to-col-edit-btn" title="Rename / Delete column" data-col-id="${col.id}">✎</button>
        </div>
        <div class="to-task-list" data-col-id="${col.id}"></div>
        <button class="to-col-add-btn" data-col-id="${col.id}">+ Add Task</button>
    `;

    const list = el.querySelector(".to-task-list");
    col.tasks.forEach(task => {
        list.appendChild(buildCard(task));
    });

    el.querySelector(".to-col-edit-btn").addEventListener("click", () => openColumnModal(col.id));
    el.querySelector(".to-col-add-btn").addEventListener("click", () => openTaskModal(null, col.id));

    return el;
}

function buildCard(task) {
    const el = document.createElement("div");
    el.className = "to-card";
    el.draggable = true;
    el.dataset.taskId = task.id;

    // Custom border-left color
    if (task.color && task.color !== "#ffffff") {
        el.style.borderLeftColor = task.color;
    }

    const priorityHtml = task.priority
        ? `<span class="to-card-priority priority-${task.priority}">${task.priority}</span>`
        : "";

    const dueHtml = task.due
        ? `<span class="to-card-due ${isOverdue(task.due) ? "overdue" : ""}">📅 ${task.due}${isOverdue(task.due) ? " ⚠" : ""}</span>`
        : "";

    const timeHtml = task.timeLimit
        ? `<span class="to-card-time">⏱ ${task.timeLimit}h</span>`
        : "";

    const taskLabels = (task.labels || []).map(lid => {
        const lbl = getLabelById(lid);
        return lbl ? `<span class="to-card-label" style="background:${lbl.color}">${escHtml(lbl.name)}</span>` : "";
    }).join("");

    el.innerHTML = `
        <button class="to-card-edit-btn" title="Edit task" data-task-id="${task.id}">✎</button>
        <div class="to-card-title">${escHtml(task.title)}</div>
        ${task.desc ? `<div class="to-card-desc">${escHtml(task.desc.slice(0, 100))}${task.desc.length > 100 ? "…" : ""}</div>` : ""}
        <div class="to-card-meta">
            ${priorityHtml}
            ${dueHtml}
            ${timeHtml}
        </div>
        ${taskLabels ? `<div class="to-card-labels">${taskLabels}</div>` : ""}
    `;

    el.querySelector(".to-card-edit-btn").addEventListener("click", e => {
        e.stopPropagation();
        openTaskModal(task.id, null);
    });
    el.addEventListener("click", () => openTaskModal(task.id, null));

    return el;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
let dragTaskId = null;
let dragColId  = null;

function initDragAndDrop() {
    // Task cards
    document.querySelectorAll(".to-card").forEach(card => {
        card.addEventListener("dragstart", e => {
            dragTaskId = card.dataset.taskId;
            dragColId  = null;
            card.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
        });
        card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
            document.querySelectorAll(".to-task-list").forEach(l => l.classList.remove("drag-over"));
        });
    });

    // Task lists (drop zones)
    document.querySelectorAll(".to-task-list").forEach(list => {
        list.addEventListener("dragover", e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            list.classList.add("drag-over");
        });
        list.addEventListener("dragleave", () => {
            list.classList.remove("drag-over");
        });
        list.addEventListener("drop", e => {
            e.preventDefault();
            list.classList.remove("drag-over");
            if (!dragTaskId) return;

            const targetColId = list.dataset.colId;
            const targetCol   = getColumnById(targetColId);
            if (!targetCol) return;

            // Find and remove task from source
            const found = getTaskById(dragTaskId);
            if (!found) return;
            const { task, column: srcCol } = found;

            srcCol.tasks = srcCol.tasks.filter(t => t.id !== dragTaskId);

            // Determine insertion index based on mouse position
            const afterEl = getDragAfterElement(list, e.clientY);
            if (!afterEl) {
                targetCol.tasks.push(task);
            } else {
                const idx = targetCol.tasks.findIndex(t => t.id === afterEl.dataset.taskId);
                if (idx >= 0) targetCol.tasks.splice(idx, 0, task);
                else targetCol.tasks.push(task);
            }

            save();
            renderBoard();
        });
    });
}

function getDragAfterElement(container, y) {
    const draggableEls = [...container.querySelectorAll(".to-card:not(.dragging)")];
    let closest = null;
    let closestOffset = Number.NEGATIVE_INFINITY;
    draggableEls.forEach(el => {
        const box = el.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closestOffset) {
            closestOffset = offset;
            closest = el;
        }
    });
    return closest;
}

// ── Task Modal ────────────────────────────────────────────────────────────────
function openTaskModal(taskId, colId) {
    const modal  = document.getElementById("taskModal");
    const title  = document.getElementById("modalTitle");
    const delBtn = document.getElementById("deleteTaskBtn");

    document.getElementById("taskTitle").value     = "";
    document.getElementById("taskDesc").value      = "";
    document.getElementById("taskDue").value       = "";
    document.getElementById("taskPriority").value  = "";
    document.getElementById("taskColor").value     = "#ffffff";
    document.getElementById("taskTimeLimit").value = "";
    document.getElementById("editingTaskId").value = "";
    document.getElementById("taskColumnId").value  = colId || "";

    // Render label toggles
    renderTaskLabelSelector([]);

    if (taskId) {
        const found = getTaskById(taskId);
        if (!found) return;
        const { task, column } = found;
        title.textContent = "Edit Task";
        delBtn.style.display = "inline-block";
        document.getElementById("taskTitle").value     = task.title;
        document.getElementById("taskDesc").value      = task.desc || "";
        document.getElementById("taskDue").value       = task.due || "";
        document.getElementById("taskPriority").value  = task.priority || "";
        document.getElementById("taskColor").value     = task.color || "#ffffff";
        document.getElementById("taskTimeLimit").value = task.timeLimit || "";
        document.getElementById("editingTaskId").value = task.id;
        document.getElementById("taskColumnId").value  = column.id;
        renderTaskLabelSelector(task.labels || []);
    } else {
        title.textContent = "Add Task";
        delBtn.style.display = "none";
    }

    modal.classList.remove("hidden");
    document.getElementById("taskTitle").focus();
}

function renderTaskLabelSelector(selected) {
    const sel = document.getElementById("taskLabelSelector");
    sel.innerHTML = "";
    if (labels.length === 0) {
        sel.innerHTML = `<span style="font-size:0.8rem;color:var(--color-text-muted)">No labels yet — create one above.</span>`;
        return;
    }
    labels.forEach(label => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "to-label-toggle" + (selected.includes(label.id) ? " selected" : "");
        btn.textContent = label.name;
        btn.style.background = label.color;
        btn.dataset.labelId = label.id;
        btn.addEventListener("click", () => {
            btn.classList.toggle("selected");
        });
        sel.appendChild(btn);
    });
}

function getSelectedLabels() {
    return [...document.querySelectorAll(".to-label-toggle.selected")].map(b => b.dataset.labelId);
}

document.getElementById("saveTaskBtn").addEventListener("click", () => {
    const titleVal = document.getElementById("taskTitle").value.trim();
    if (!titleVal) {
        document.getElementById("taskTitle").focus();
        return;
    }
    const editId = document.getElementById("editingTaskId").value;
    const colId  = document.getElementById("taskColumnId").value;

    const taskData = {
        title:     titleVal,
        desc:      document.getElementById("taskDesc").value.trim(),
        due:       document.getElementById("taskDue").value || null,
        priority:  document.getElementById("taskPriority").value || null,
        color:     document.getElementById("taskColor").value,
        timeLimit: document.getElementById("taskTimeLimit").value || null,
        labels:    getSelectedLabels(),
    };

    if (editId) {
        const found = getTaskById(editId);
        if (found) Object.assign(found.task, taskData);
    } else {
        const col = getColumnById(colId);
        if (col) {
            col.tasks.push({ id: uid(), ...taskData });
        }
    }

    save();
    renderAll();
    document.getElementById("taskModal").classList.add("hidden");
});

document.getElementById("deleteTaskBtn").addEventListener("click", () => {
    const editId = document.getElementById("editingTaskId").value;
    if (!editId) return;
    const found = getTaskById(editId);
    if (found) {
        found.column.tasks = found.column.tasks.filter(t => t.id !== editId);
        save();
        renderAll();
    }
    document.getElementById("taskModal").classList.add("hidden");
});

document.getElementById("modalClose").addEventListener("click", () => {
    document.getElementById("taskModal").classList.add("hidden");
});

document.getElementById("taskModal").addEventListener("click", e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
});

// ── Column Modal ──────────────────────────────────────────────────────────────
function openColumnModal(colId) {
    const modal    = document.getElementById("colModal");
    const delBtn   = document.getElementById("deleteColBtn");
    const titleEl  = document.getElementById("colModalTitle");

    document.getElementById("colName").value       = "";
    document.getElementById("editingColId").value  = "";
    delBtn.style.display = "none";

    if (colId) {
        const col = getColumnById(colId);
        if (!col) return;
        titleEl.textContent = "Edit Column";
        document.getElementById("colName").value      = col.name;
        document.getElementById("editingColId").value = col.id;
        delBtn.style.display = "inline-block";
    } else {
        titleEl.textContent = "Add Column";
    }

    modal.classList.remove("hidden");
    document.getElementById("colName").focus();
}

document.getElementById("saveColBtn").addEventListener("click", () => {
    const name  = document.getElementById("colName").value.trim();
    if (!name) { document.getElementById("colName").focus(); return; }
    const editId = document.getElementById("editingColId").value;
    if (editId) {
        const col = getColumnById(editId);
        if (col) col.name = name;
    } else {
        state.columns.push({ id: uid(), name, tasks: [] });
    }
    save();
    renderAll();
    document.getElementById("colModal").classList.add("hidden");
});

document.getElementById("deleteColBtn").addEventListener("click", () => {
    const editId = document.getElementById("editingColId").value;
    if (!editId) return;
    state.columns = state.columns.filter(c => c.id !== editId);
    save();
    renderAll();
    document.getElementById("colModal").classList.add("hidden");
});

document.getElementById("colModalClose").addEventListener("click", () => {
    document.getElementById("colModal").classList.add("hidden");
});

document.getElementById("colModal").addEventListener("click", e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
});

// ── Label Modal ───────────────────────────────────────────────────────────────
function openLabelModal(labelId) {
    const modal  = document.getElementById("labelModal");
    const delBtn = document.getElementById("deleteLabelBtn");

    document.getElementById("labelName").value       = "";
    document.getElementById("labelColor").value      = "#4a90e2";
    document.getElementById("editingLabelId").value  = "";
    delBtn.style.display = "none";

    if (labelId) {
        const lbl = getLabelById(labelId);
        if (!lbl) return;
        document.getElementById("labelName").value      = lbl.name;
        document.getElementById("labelColor").value     = lbl.color;
        document.getElementById("editingLabelId").value = lbl.id;
        delBtn.style.display = "inline-block";
    }

    modal.classList.remove("hidden");
    document.getElementById("labelName").focus();
}

document.getElementById("saveLabelBtn").addEventListener("click", () => {
    const name  = document.getElementById("labelName").value.trim();
    if (!name) { document.getElementById("labelName").focus(); return; }
    const color  = document.getElementById("labelColor").value;
    const editId = document.getElementById("editingLabelId").value;

    if (editId) {
        const lbl = getLabelById(editId);
        if (lbl) { lbl.name = name; lbl.color = color; }
    } else {
        labels.push({ id: uid(), name, color });
    }
    save();
    renderAll();
    document.getElementById("labelModal").classList.add("hidden");
});

document.getElementById("deleteLabelBtn").addEventListener("click", () => {
    const editId = document.getElementById("editingLabelId").value;
    if (!editId) return;
    labels = labels.filter(l => l.id !== editId);
    // Remove from all tasks
    state.columns.forEach(col => {
        col.tasks.forEach(t => {
            t.labels = (t.labels || []).filter(lid => lid !== editId);
        });
    });
    save();
    renderAll();
    document.getElementById("labelModal").classList.add("hidden");
});

document.getElementById("labelModalClose").addEventListener("click", () => {
    document.getElementById("labelModal").classList.add("hidden");
});

document.getElementById("labelModal").addEventListener("click", e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
});

// ── Toolbar buttons ───────────────────────────────────────────────────────────
document.getElementById("addTaskBtn").addEventListener("click", () => {
    const firstCol = state.columns[0];
    if (!firstCol) { alert("Add a column first."); return; }
    openTaskModal(null, firstCol.id);
});

document.getElementById("addColumnBtn").addEventListener("click", () => openColumnModal(null));
document.getElementById("addLabelBtn").addEventListener("click", () => openLabelModal(null));

// ── Export ────────────────────────────────────────────────────────────────────
document.getElementById("exportBtn").addEventListener("click", () => {
    const payload = JSON.stringify({ labels, state }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `task-board-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
});

// ── Import ────────────────────────────────────────────────────────────────────
document.getElementById("importFile").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const parsed = JSON.parse(ev.target.result);
            if (parsed.state && parsed.state.columns) {
                state = parsed.state;
                labels = parsed.labels || [];
                save();
                renderAll();
            } else {
                alert("Invalid task board JSON.");
            }
        } catch(_) {
            alert("Could not parse JSON file.");
        }
    };
    reader.readAsText(file);
    // Reset input so same file can be imported again
    e.target.value = "";
});

// ── Clear All ─────────────────────────────────────────────────────────────────
document.getElementById("clearBtn").addEventListener("click", () => {
    if (!confirm("Clear ALL tasks, columns, and labels? This cannot be undone.")) return;
    state = {
        columns: [
            { id: uid(), name: "To Do",      tasks: [] },
            { id: uid(), name: "In Progress", tasks: [] },
            { id: uid(), name: "Done",        tasks: [] },
        ],
    };
    labels = [];
    save();
    renderAll();
});

// ── Keyboard support ──────────────────────────────────────────────────────────
document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
        ["taskModal", "colModal", "labelModal"].forEach(id => {
            document.getElementById(id).classList.add("hidden");
        });
    }
});

// ── Init ──────────────────────────────────────────────────────────────────────
load();
renderAll();
