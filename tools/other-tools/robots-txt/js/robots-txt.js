/* robots-txt.js — pure JS, no dependencies */
"use strict";

const rulesContainer = document.getElementById("rulesContainer");
const addRuleBtn     = document.getElementById("addRuleBtn");
const sitemapUrl     = document.getElementById("sitemapUrl");
const outputEl       = document.getElementById("robotsOutput");
const copyBtn        = document.getElementById("robotsCopyBtn");
const downloadBtn    = document.getElementById("robotsDownloadBtn");

let ruleCount = 0;

const COMMON_AGENTS = [
    "*", "Googlebot", "Bingbot", "Slurp", "DuckDuckBot",
    "Baiduspider", "Yandexbot", "facebookexternalhit", "Twitterbot",
    "GPTBot", "CCBot", "Claude-Web", "anthropic-ai",
];

function createRuleBlock() {
    ruleCount++;
    const id  = ruleCount;
    const div = document.createElement("div");
    div.className = "rule-block";
    div.dataset.ruleId = id;

    div.innerHTML = `
        <div class="rule-header">
            <span class="rule-title">Rule #${id}</span>
            <button class="remove-rule-btn" data-remove="${id}" title="Remove rule">✕ Remove</button>
        </div>

        <div class="rule-field">
            <label for="agent-${id}">User-agent</label>
            <input type="text" id="agent-${id}" class="tool-input mono agent-input"
                placeholder="* (all bots)" value="*" autocomplete="off" spellcheck="false">
            <div class="quick-agents">
                ${COMMON_AGENTS.map(a => `<button class="agent-chip" data-agent-for="${id}">${a}</button>`).join("")}
            </div>
        </div>

        <div class="rule-field">
            <label>Disallow paths <span style="font-weight:400;color:var(--color-text-muted)">(leave empty to allow all)</span></label>
            <div class="disallow-list" id="disallow-list-${id}">
                <div class="disallow-row">
                    <input type="text" class="disallow-input" placeholder="/admin/" spellcheck="false" autocomplete="off">
                    <button class="rm-disallow-btn" title="Remove">✕</button>
                </div>
            </div>
            <button class="add-disallow-btn" data-disallow-for="${id}">+ Add path</button>
        </div>

        <div class="rule-field">
            <label for="crawl-delay-${id}">Crawl-delay <span style="font-weight:400;color:var(--color-text-muted)">(seconds, optional)</span></label>
            <input type="number" id="crawl-delay-${id}" class="tool-input" style="width:120px" min="0" max="86400" placeholder="e.g. 10">
        </div>`;

    rulesContainer.appendChild(div);
    attachRuleListeners(div, id);
    generate();
}

function attachRuleListeners(div, id) {
    // Remove rule
    div.querySelector(`[data-remove="${id}"]`).addEventListener("click", () => {
        div.remove();
        generate();
    });

    // Agent chips
    div.querySelectorAll(`[data-agent-for="${id}"]`).forEach(chip => {
        chip.addEventListener("click", () => {
            div.querySelector(`#agent-${id}`).value = chip.textContent;
            generate();
        });
    });

    // Add disallow row
    div.querySelector(`[data-disallow-for="${id}"]`).addEventListener("click", () => {
        addDisallowRow(div.querySelector(`#disallow-list-${id}`));
        generate();
    });

    // Remove disallow row (event delegation)
    div.querySelector(`#disallow-list-${id}`).addEventListener("click", e => {
        if (e.target.classList.contains("rm-disallow-btn")) {
            const row = e.target.closest(".disallow-row");
            if (div.querySelectorAll(".disallow-row").length > 1) {
                row.remove();
            } else {
                row.querySelector(".disallow-input").value = "";
            }
            generate();
        }
    });

    // Live generate on any input
    div.addEventListener("input", generate);
}

function addDisallowRow(list) {
    const row = document.createElement("div");
    row.className = "disallow-row";
    row.innerHTML = `
        <input type="text" class="disallow-input" placeholder="/path/" spellcheck="false" autocomplete="off">
        <button class="rm-disallow-btn" title="Remove">✕</button>`;
    list.appendChild(row);
}

function generate() {
    const lines = [];
    const blocks = rulesContainer.querySelectorAll(".rule-block");

    blocks.forEach(block => {
        const id     = block.dataset.ruleId;
        const agent  = (block.querySelector(`#agent-${id}`)?.value.trim() || "*");
        const delay  = block.querySelector(`#crawl-delay-${id}`)?.value.trim();
        const paths  = [...block.querySelectorAll(".disallow-input")]
            .map(i => i.value.trim())
            .filter(Boolean);

        lines.push(`User-agent: ${agent}`);
        if (paths.length === 0) {
            lines.push("Disallow:");
        } else {
            paths.forEach(p => lines.push(`Disallow: ${p}`));
        }
        if (delay) lines.push(`Crawl-delay: ${delay}`);
        lines.push("");
    });

    const sitemap = sitemapUrl.value.trim();
    if (sitemap) lines.push(`Sitemap: ${sitemap}`);

    outputEl.value = lines.join("\n").trimEnd();
}

addRuleBtn.addEventListener("click", createRuleBlock);
sitemapUrl.addEventListener("input", generate);

copyBtn.addEventListener("click", () => {
    if (!outputEl.value) return;
    navigator.clipboard.writeText(outputEl.value).then(() => {
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("copied");
        setTimeout(() => { copyBtn.textContent = "Copy"; copyBtn.classList.remove("copied"); }, 1500);
    });
});

downloadBtn.addEventListener("click", () => {
    if (!outputEl.value) return;
    const blob = new Blob([outputEl.value], { type: "text/plain" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = "robots.txt";
    a.click();
    URL.revokeObjectURL(a.href);
});

// Start with one default rule
createRuleBlock();
