/* text-art.js — text art & emoticon clipboard, pure JS */
"use strict";

// ── Data ──────────────────────────────────────────────────────────────────────
// Format: { name, art, tags (optional), cat }
const ART_DATA = [
    // ── Smileys & Emotions ───────────────────────────────────────────────────
    { cat:"Smileys", name:"Shrug",           art:"¯\\_(ツ)_/¯",  tags:["dunno","idk"] },
    { cat:"Smileys", name:"Lenny Face",      art:"( ͡° ͜ʖ ͡°)",   tags:["lenny"] },
    { cat:"Smileys", name:"Tableflip",       art:"(╯°□°）╯︵ ┻━┻", tags:["flip","rage","angry"] },
    { cat:"Smileys", name:"Put table back",  art:"┬─┬ ノ( ゜-゜ノ)", tags:["table"] },
    { cat:"Smileys", name:"Disapproval",     art:"ಠ_ಠ",          tags:["stare","unimpressed"] },
    { cat:"Smileys", name:"Bear",            art:"ʕ•ᴥ•ʔ",        tags:["bear","animal"] },
    { cat:"Smileys", name:"Cat",             art:"=^.^=",        tags:["cat","animal","kitty"] },
    { cat:"Smileys", name:"Kirby",           art:"(>'-')>",       tags:["kirby","game"] },
    { cat:"Smileys", name:"Kirby dance",     art:"<(^.^)>",       tags:["kirby","dance"] },
    { cat:"Smileys", name:"Happy face",      art:"(◠‿◠)",        tags:["happy","smile"] },
    { cat:"Smileys", name:"Crying",          art:"(╥_╥)",        tags:["sad","cry"] },
    { cat:"Smileys", name:"Annoyed",         art:"(¬_¬)",        tags:["annoyed","skeptical"] },
    { cat:"Smileys", name:"Surprised",       art:"(⊙_⊙)",        tags:["surprised","wide eyes"] },
    { cat:"Smileys", name:"Evil grin",       art:"(ಠ‿ಠ)",        tags:["evil","grin"] },
    { cat:"Smileys", name:"Nervous",         art:"(´・ω・`)",     tags:["nervous","worried"] },
    { cat:"Smileys", name:"Excited",         art:"╰(*°▽°*)╯",    tags:["excited","happy"] },
    { cat:"Smileys", name:"Shy",             art:"(///>///)",     tags:["shy","blushing"] },
    { cat:"Smileys", name:"Wink",            art:"(｀ω´)",        tags:["wink","smug"] },
    { cat:"Smileys", name:"Star eyes",       art:"(★‿★)",        tags:["star","eyes"] },
    { cat:"Smileys", name:"Thinking",        art:"(¬‿¬)",        tags:["think"] },
    { cat:"Smileys", name:"Hug",             art:"(づ｡◕‿‿◕｡)づ", tags:["hug","arms"] },
    { cat:"Smileys", name:"Flipping hair",   art:"(╭☞ ͡° ͜ʖ ͡°)╭☞", tags:["point"] },
    { cat:"Smileys", name:"Facepalm",        art:"(－‸ლ)",       tags:["facepalm","ugh"] },
    { cat:"Smileys", name:"Running away",    art:"ε=ε=ε=┌(;*´Д`)ノ", tags:["run","escape"] },
    { cat:"Smileys", name:"Sleeping",        art:"(-_-)zzZ",     tags:["sleep","tired","zzz"] },
    { cat:"Smileys", name:"No no",           art:"(ㄒoㄒ)",      tags:["no","sad"] },
    { cat:"Smileys", name:"Kawaii",          art:"(◕‿◕✿)",      tags:["kawaii","cute"] },
    { cat:"Smileys", name:"Spider",          art:"╭∩╮(︶︿︶)╭∩╮", tags:["middle","finger","rude"] },
    { cat:"Smileys", name:"Bow",             art:"m(_ _)m",      tags:["bow","sorry","please"] },
    { cat:"Smileys", name:"Domo",            art:"(ΘεΘ;)",       tags:["domo","face"] },

    // ── Animals ──────────────────────────────────────────────────────────────
    { cat:"Animals", name:"Dog",             art:"(・∀・)",       tags:["dog","shibe"] },
    { cat:"Animals", name:"Bunny",           art:"(\_/)  (='.'=)  (\\\")(\\\")",  tags:["bunny","rabbit"] },
    { cat:"Animals", name:"Penguin",         art:"(>'-')>",       tags:["penguin","bird"] },
    { cat:"Animals", name:"Fish",            art:"<°)))><",       tags:["fish","sea"] },
    { cat:"Animals", name:"Shark",           art:"/\\___/\\",     tags:["shark"] },
    { cat:"Animals", name:"Elephant",        art:"(❍ᴥ❍ʋ)",       tags:["elephant"] },

    // ── Symbols & Arrows ─────────────────────────────────────────────────────
    { cat:"Symbols", name:"Arrow right",     art:"→",            tags:["arrow","right"] },
    { cat:"Symbols", name:"Arrow left",      art:"←",            tags:["arrow","left"] },
    { cat:"Symbols", name:"Arrow up",        art:"↑",            tags:["arrow","up"] },
    { cat:"Symbols", name:"Arrow down",      art:"↓",            tags:["arrow","down"] },
    { cat:"Symbols", name:"Double arrow",    art:"⇔",            tags:["arrow","both"] },
    { cat:"Symbols", name:"Checkmark",       art:"✓",            tags:["check","tick","yes"] },
    { cat:"Symbols", name:"Heavy check",     art:"✔",            tags:["check","tick"] },
    { cat:"Symbols", name:"Cross mark",      art:"✗",            tags:["cross","no","wrong"] },
    { cat:"Symbols", name:"Heavy cross",     art:"✘",            tags:["cross"] },
    { cat:"Symbols", name:"Star",            art:"★",            tags:["star","favourite"] },
    { cat:"Symbols", name:"Star outline",    art:"☆",            tags:["star","empty"] },
    { cat:"Symbols", name:"Heart",           art:"♥",            tags:["heart","love"] },
    { cat:"Symbols", name:"Heart outline",   art:"♡",            tags:["heart","love","empty"] },
    { cat:"Symbols", name:"Music note",      art:"♪",            tags:["music","note","song"] },
    { cat:"Symbols", name:"Double note",     art:"♫",            tags:["music","notes"] },
    { cat:"Symbols", name:"Infinity",        art:"∞",            tags:["infinity","forever"] },
    { cat:"Symbols", name:"Copyright",       art:"©",            tags:["copyright"] },
    { cat:"Symbols", name:"Registered",      art:"®",            tags:["registered","trademark"] },
    { cat:"Symbols", name:"Trademark",       art:"™",            tags:["trademark"] },
    { cat:"Symbols", name:"Degree",          art:"°",            tags:["degree","temperature"] },
    { cat:"Symbols", name:"Bullet",          art:"•",            tags:["bullet","dot"] },
    { cat:"Symbols", name:"Ellipsis",        art:"…",            tags:["ellipsis","dot"] },
    { cat:"Symbols", name:"En dash",         art:"–",            tags:["dash","hyphen"] },
    { cat:"Symbols", name:"Em dash",         art:"—",            tags:["dash"] },
    { cat:"Symbols", name:"Snowflake",       art:"❄",            tags:["snow","winter","cold"] },
    { cat:"Symbols", name:"Lightning",       art:"⚡",           tags:["lightning","electric","zap"] },
    { cat:"Symbols", name:"Fire",            art:"🔥",           tags:["fire","hot","flame"] },
    { cat:"Symbols", name:"Sparkle",         art:"✨",           tags:["sparkle","shine"] },
    { cat:"Symbols", name:"Warning",         art:"⚠️",           tags:["warning","alert","caution"] },
    { cat:"Symbols", name:"Info",            art:"ℹ️",           tags:["info","information"] },
    { cat:"Symbols", name:"No entry",        art:"⛔",           tags:["no","entry","stop"] },
    { cat:"Symbols", name:"Peace",           art:"☮",            tags:["peace","hippie"] },
    { cat:"Symbols", name:"Yin yang",        art:"☯",            tags:["yin yang","balance"] },

    // ── Gestures ──────────────────────────────────────────────────────────────
    { cat:"Gestures", name:"Thumbs up",     art:"👍",            tags:["thumbs","up","like"] },
    { cat:"Gestures", name:"Thumbs down",   art:"👎",            tags:["thumbs","down","dislike"] },
    { cat:"Gestures", name:"Wave",          art:"(  ﾟヮﾟ)/",      tags:["wave","hello","hi"] },
    { cat:"Gestures", name:"OK hand",       art:"(•̀ᴗ•́)و",     tags:["ok","good"] },
    { cat:"Gestures", name:"Peace sign",    art:"✌(◕‿-)✌",      tags:["peace","v"] },
    { cat:"Gestures", name:"Fist bump",     art:"(ﾉ ◕ヮ◕)ﾉ*:・ﾟ✧", tags:["fist","bump","celebrate"] },
    { cat:"Gestures", name:"High five",     art:"(o゜▽゜)o☆",    tags:["hi5","high five"] },
    { cat:"Gestures", name:"Clap",          art:"(^_^)ｲｪｰｲ",    tags:["clap","applause"] },

    // ── ASCII Art ─────────────────────────────────────────────────────────────
    { cat:"ASCII Art", name:"Rocket",       art:"|\\  /|\n| \\/ |\n| /\\ |\n|/ \\ |",   tags:["rocket","space"] },
    { cat:"ASCII Art", name:"Diamond",      art:"  *\n * *\n*   *\n * *\n  *",          tags:["diamond","shape"] },
    { cat:"ASCII Art", name:"Skull",        art:" ░░░░░░░\n░░(o)(o)░\n░░(  oo  )░\n░░ \\  / ░\n░░  \\/  ░", tags:["skull","death"] },
    { cat:"ASCII Art", name:"Trophy",       art:"   ___\n  |   |\n  |   |\n  |___|\n   | |\n  _|_|_", tags:["trophy","award"] },

    // ── Dividers ──────────────────────────────────────────────────────────────
    { cat:"Dividers", name:"Simple line",   art:"─────────",     tags:["line","separator","rule"] },
    { cat:"Dividers", name:"Double line",   art:"═════════",     tags:["double","line"] },
    { cat:"Dividers", name:"Wave line",     art:"～～～～～",    tags:["wave","line"] },
    { cat:"Dividers", name:"Star line",     art:"★ ─ ─ ─ ─ ★",  tags:["star","line"] },
    { cat:"Dividers", name:"Dot line",      art:"· · · · · · ·", tags:["dot","line"] },
    { cat:"Dividers", name:"Box top",       art:"╔══════════╗",  tags:["box","border"] },
    { cat:"Dividers", name:"Box bottom",    art:"╚══════════╝",  tags:["box","border"] },
    { cat:"Dividers", name:"Bullet list",   art:"• Item 1\n• Item 2\n• Item 3", tags:["list","bullets"] },
    { cat:"Dividers", name:"Arrow list",    art:"→ Item 1\n→ Item 2\n→ Item 3", tags:["list","arrows"] },

    // ── Weather ───────────────────────────────────────────────────────────────
    { cat:"Weather", name:"Sun",            art:"☀",             tags:["sun","hot","sunny"] },
    { cat:"Weather", name:"Cloud",          art:"☁",             tags:["cloud","cloudy"] },
    { cat:"Weather", name:"Rain",           art:"🌧",            tags:["rain","rainy"] },
    { cat:"Weather", name:"Umbrella",       art:"☂",             tags:["umbrella","rain"] },
    { cat:"Weather", name:"Snow",           art:"❄",             tags:["snow","cold","winter"] },
    { cat:"Weather", name:"Lightning",      art:"⚡",            tags:["lightning","storm"] },
    { cat:"Weather", name:"Rainbow",        art:"🌈",            tags:["rainbow","colorful"] },
    { cat:"Weather", name:"Moon",           art:"🌙",            tags:["moon","night","crescent"] },

    // ── Food ──────────────────────────────────────────────────────────────────
    { cat:"Food", name:"Coffee",            art:"c[_]",          tags:["coffee","drink","cup"] },
    { cat:"Food", name:"Pizza",             art:"🍕",            tags:["pizza","food"] },
    { cat:"Food", name:"Cookie",            art:"🍪",            tags:["cookie","food","snack"] },
    { cat:"Food", name:"Birthday cake",     art:"🎂",            tags:["cake","birthday","party"] },
];

// ── Build category list ───────────────────────────────────────────────────────
const CATEGORIES = [...new Set(ART_DATA.map(a => a.cat))];

const catSelect = document.getElementById("taCat");
CATEGORIES.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat; opt.textContent = cat;
    catSelect.appendChild(opt);
});

// ── Render ────────────────────────────────────────────────────────────────────
const searchEl  = document.getElementById("taSearch");
const maxLenEl  = document.getElementById("taMaxLen");
const grid      = document.getElementById("taGrid");
const countEl   = document.getElementById("taCount");

function filter() {
    const q      = searchEl.value.trim().toLowerCase();
    const maxLen = parseInt(maxLenEl.value) || 0;
    const cat    = catSelect.value;

    return ART_DATA.filter(item => {
        if (cat && item.cat !== cat) return false;
        if (maxLen && item.art.length > maxLen) return false;
        if (!q) return true;
        return item.name.toLowerCase().includes(q) ||
               item.art.toLowerCase().includes(q) ||
               (item.tags || []).some(t => t.includes(q));
    });
}

function render() {
    const items = filter();
    countEl.textContent = `${items.length} item${items.length !== 1 ? "s" : ""}`;

    if (!items.length) {
        grid.innerHTML = '<div class="ta-empty">No matching art found. Try a different search.</div>';
        return;
    }

    grid.innerHTML = items.map((item, i) => `
        <div class="ta-item" data-idx="${i}" title="Click to copy">
            <div class="ta-art">${escHtml(item.art)}</div>
            <div class="ta-name">${escHtml(item.name)}</div>
            <div class="ta-cat-badge">${escHtml(item.cat)}</div>
            <div class="ta-copied-flash" id="flash-${i}"></div>
        </div>`).join("");

    grid.querySelectorAll(".ta-item").forEach((el, i) => {
        el.addEventListener("click", () => {
            navigator.clipboard.writeText(items[i].art).then(() => {
                const flash = el.querySelector(".ta-copied-flash");
                flash.classList.add("show");
                setTimeout(() => flash.classList.remove("show"), 400);
            });
        });
    });
}

function escHtml(s) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

searchEl.addEventListener("input", render);
maxLenEl.addEventListener("change", render);
catSelect.addEventListener("change", render);

render();
