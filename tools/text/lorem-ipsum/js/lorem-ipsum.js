/* lorem-ipsum.js — pure JS, no dependencies */
"use strict";

// ── Word bank ────────────────────────────────────────────────────────────────
const WORDS = [
    "lorem","ipsum","dolor","sit","amet","consectetur","adipiscing","elit",
    "sed","do","eiusmod","tempor","incididunt","ut","labore","et","dolore",
    "magna","aliqua","enim","ad","minim","veniam","quis","nostrud","exercitation",
    "ullamco","laboris","nisi","aliquip","ex","ea","commodo","consequat","duis",
    "aute","irure","in","reprehenderit","voluptate","velit","esse","cillum",
    "eu","fugiat","nulla","pariatur","excepteur","sint","occaecat","cupidatat",
    "non","proident","sunt","culpa","qui","officia","deserunt","mollit","anim",
    "id","est","laborum","pellentesque","habitant","morbi","tristique","senectus",
    "netus","malesuada","fames","ac","turpis","egestas","integer","eget","aliquet",
    "nibh","praesent","commodo","cursus","magna","vel","scelerisque","nisl","consectetur",
    "a","diam","maecenas","ultricies","mi","eget","mauris","pharetra","et","ultrices",
    "neque","ornare","aenean","euismod","elementum","nisi","quis","eleifend","quam",
    "adipiscing","vitae","proin","sagittis","nisl","rhoncus","mattis","rhoncus","urna",
    "neque","viverra","justo","nec","ultrices","dui","sapien","eget","mi","proin",
    "sed","libero","enim","sed","faucibus","turpis","in","eu","mi","bibendum","neque",
    "egestas","congue","quisque","egestas","diam","in","arcu","cursus","euismod",
    "quis","viverra","nibh","cras","pulvinar","mattis","nunc","sed","blandit","libero",
    "volutpat","sed","cras","ornare","arcu","dui","vivamus","arcu","felis","bibendum",
];

const CLASSIC_START = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

// ── Helpers ──────────────────────────────────────────────────────────────────
function rnd(max) { return Math.floor(Math.random() * max); }

function randomWord() { return WORDS[rnd(WORDS.length)]; }

function randomSentence(wordMin = 6, wordMax = 18) {
    const len = wordMin + rnd(wordMax - wordMin);
    const words = [];
    for (let i = 0; i < len; i++) words.push(randomWord());
    words[0] = words[0][0].toUpperCase() + words[0].slice(1);
    return words.join(" ") + ".";
}

function randomParagraph(sentMin = 3, sentMax = 7) {
    const len = sentMin + rnd(sentMax - sentMin);
    const sents = [];
    for (let i = 0; i < len; i++) sents.push(randomSentence());
    return sents.join(" ");
}

// ── Generate ─────────────────────────────────────────────────────────────────
function generate(count, unit, classic, htmlWrap) {
    let parts = [];

    if (unit === "words") {
        const words = [];
        if (classic) {
            const classicWords = CLASSIC_START.replace(/[.,]/g, "").toLowerCase().split(" ");
            words.push(...classicWords.slice(0, Math.min(classicWords.length, count)));
        }
        while (words.length < count) words.push(randomWord());
        parts = [words.slice(0, count).join(" ")];

    } else if (unit === "sentences") {
        if (classic && count > 0) parts.push(CLASSIC_START);
        const extra = count - (classic ? 1 : 0);
        for (let i = 0; i < extra; i++) parts.push(randomSentence());

    } else { // paragraphs
        if (classic && count > 0) parts.push(CLASSIC_START + " " + randomParagraph(2, 5));
        const extra = count - (classic ? 1 : 0);
        for (let i = 0; i < extra; i++) parts.push(randomParagraph());
    }

    if (htmlWrap && unit !== "words") {
        return parts.map(p => `<p>${p}</p>`).join("\n");
    }
    return unit === "paragraphs" ? parts.join("\n\n") : parts.join(" ");
}

// ── DOM ──────────────────────────────────────────────────────────────────────
const countEl   = document.getElementById("loremCount");
const unitEl    = document.getElementById("loremUnit");
const classicEl = document.getElementById("startClassic");
const htmlEl    = document.getElementById("htmlWrapped");
const outputEl  = document.getElementById("loremOutput");
const copyBtn   = document.getElementById("loremCopyBtn");
const infoEl    = document.getElementById("wordCountInfo");
const genBtn    = document.getElementById("generateBtn");

function run() {
    const count  = Math.max(1, Math.min(10000, parseInt(countEl.value) || 5));
    const unit   = unitEl.value;
    const result = generate(count, unit, classicEl.checked, htmlEl.checked);
    outputEl.value = result;

    const wordCount = result.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
    const charCount = result.length;
    infoEl.textContent = `${wordCount} words, ${charCount} characters`;
}

genBtn.addEventListener("click", run);

// Auto-generate on load
run();

copyBtn.addEventListener("click", () => {
    if (!outputEl.value) return;
    navigator.clipboard.writeText(outputEl.value).then(() => {
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("copied");
        setTimeout(() => { copyBtn.textContent = "Copy"; copyBtn.classList.remove("copied"); }, 1500);
    });
});
