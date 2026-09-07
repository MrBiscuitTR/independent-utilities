/* ascii-art.js — pure JS ASCII art renderer, no external dependencies.
 *
 * The one rule that makes or breaks this kind of renderer: every row of a
 * glyph must be exactly the same width. Rows are printed side by side, so a
 * glyph whose rows differ in length shifts everything after it on that row
 * and the letters shear apart. The previous font data broke this rule in 126
 * of its 258 glyphs, which is why the output looked scrambled.
 *
 * Two things keep that from coming back:
 *   1. Fonts are authored as plain art blocks (see parseFont) instead of as
 *      hand-counted string arrays, so trailing spaces do not have to be
 *      counted by hand or preserved by an editor.
 *   2. normalizeFont() pads every glyph out to a rectangle and to the font's
 *      full height before it is ever used, so a mis-typed row cannot shear
 *      the output — at worst one glyph is a little narrow.
 */
"use strict";

/* ── Font authoring format ─────────────────────────────────────────────────
   A font is one template string. Each glyph starts with a line "@" + the
   character, and the lines after it are that glyph's rows, in order:

       @A
         _
        / \
       /_/ \_\

   Blank rows are kept, so a glyph can have an empty descender row. Leading
   and trailing blank lines around the whole block are ignored.            */
function parseFont(src) {
    const font = {};
    let current = null;
    for (const rawLine of src.split("\n")) {
        const line = rawLine.replace(/\r$/, "");
        if (line.startsWith("@") && line.length >= 2) {
            current = line.slice(1);          // "@ " defines the space glyph
            font[current] = [];
        } else if (current !== null) {
            font[current].push(line);
        }
    }
    return font;
}

/* Pads every glyph to a rectangle, and every glyph to the font's tallest
   height, so the renderer can assume a uniform grid. */
function normalizeFont(font) {
    const height = Math.max(...Object.values(font).map(g => g.length));
    const out = {};
    for (const [ch, rows] of Object.entries(font)) {
        const width = Math.max(0, ...rows.map(r => r.length));
        const padded = [];
        for (let r = 0; r < height; r++) {
            padded.push((rows[r] || "").padEnd(width, " "));
        }
        out[ch] = padded;
    }
    return out;
}

/* Leans finished art to the right. Applied to the whole rendered block
   rather than to each glyph, so the shear is one continuous diagonal and
   neighbouring letters keep touching instead of drifting apart. */
function shearLines(lines) {
    return lines.map((line, r) => " ".repeat(lines.length - 1 - r) + line);
}

/* Drops a one-cell shadow down and to the right of every inked cell. Also
   applied to the finished block, so the shadow runs behind the whole word
   instead of stopping at each letter. */
function shadowLines(lines, ink, shadowChar) {
    const width = Math.max(0, ...lines.map(l => l.length)) + 1;
    const grid = lines.map(l => l.padEnd(width, " "));
    grid.push(" ".repeat(width));   // a row for the shadow to fall into
    const isInk = (r, c) => r >= 0 && c >= 0 && r < grid.length && grid[r][c] === ink;
    return grid.map((row, r) => {
        let out = "";
        for (let c = 0; c < width; c++) {
            out += isInk(r, c) ? ink : (isInk(r - 1, c - 1) ? shadowChar : " ");
        }
        return out;
    });
}

/* ── STANDARD ──────────────────────────────────────────────────────────────
   Classic FIGlet-style line art. Glyphs carry their own side bearings, so
   this font is joined with no extra separator. */
const FONT_STANDARD = normalizeFont(parseFont(String.raw`
@ 
   
   
   
   
   
   
@A
     _
    / \
   / _ \
  / ___ \
 /_/   \_\

@B
 ____
| __ )
|  _ \
| |_) |
|____/

@C
  ____
 / ___|
| |
| |___
 \____|

@D
 ____
|  _ \
| | | |
| |_| |
|____/

@E
 _____
| ____|
|  _|
| |___
|_____|

@F
 _____
|  ___|
| |_
|  _|
|_|

@G
  ____
 / ___|
| |  _
| |_| |
 \____|

@H
 _   _
| | | |
| |_| |
|  _  |
|_| |_|

@I
 ___
|_ _|
 | |
 | |
|___|

@J
     _
    | |
 _  | |
| |_| |
 \___/

@K
 _  __
| |/ /
| ' /
| . \
|_|\_\

@L
 _
| |
| |
| |___
|_____|

@M
 __  __
|  \/  |
| |\/| |
| |  | |
|_|  |_|

@N
 _   _
| \ | |
|  \| |
| |\  |
|_| \_|

@O
  ___
 / _ \
| | | |
| |_| |
 \___/

@P
 ____
|  _ \
| |_) |
|  __/
|_|

@Q
  ___
 / _ \
| | | |
| |_| |
 \__\_\

@R
 ____
|  _ \
| |_) |
|  _ <
|_| \_\

@S
 ____
/ ___|
\___ \
 ___) |
|____/

@T
 _____
|_   _|
  | |
  | |
  |_|

@U
 _   _
| | | |
| | | |
| |_| |
 \___/

@V
__     __
\ \   / /
 \ \ / /
  \ V /
   \_/

@W
__        __
\ \      / /
 \ \ /\ / /
  \ V  V /
   \_/\_/

@X
__  __
\ \/ /
 \  /
 /  \
/_/\_\

@Y
__   __
\ \ / /
 \ V /
  | |
  |_|

@Z
 _____
|__  /
  / /
 / /_
/____|

`));

/* Digits and punctuation for STANDARD, merged into the same map. */
Object.assign(FONT_STANDARD, normalizeFont(parseFont(String.raw`
@0
  ___
 / _ \
| | | |
| |_| |
 \___/

@1
 _
/ |
| |
| |
|_|

@2
 ____
|___ \
  __) |
 / __/
|_____|

@3
 _____
|___ /
  |_ \
 ___) |
|____/

@4
 _  _
| || |
| || |_
|__   _|
   |_|

@5
 ____
| ___|
|___ \
 ___) |
|____/

@6
  __
 / /_
| '_ \
| (_) |
 \___/

@7
 _____
|___  |
   / /
  / /
 /_/

@8
  ___
 ( _ )
 / _ \
| (_) |
 \___/

@9
  ___
 / _ \
| (_) |
 \__, |
   /_/

@!
 _
| |
| |
|_|
(_)

@?
 ___
|__ \
  ) |
 / /
|_|
(_)
@.



 _
(_)

@,



 _
( )
|/
@-


 _____
|_____|


@_




 _____
|_____|
@'
 _
( )
|/



@"
 _ _
( | )
 V V



@:

 _
(_)
 _
(_)

@;

 _
(_)
 _
( )
|/
@(
  __
 / /
| |
| |
| |
 \_\
@)
__
\ \
 | |
 | |
 | |
/_/
@/
    __
   / /
  / /
 / /
/_/

@+

   _
 _| |_
|_   _|
  |_|

@=

 _____
|_____|
|_____|


`)));

/* ── BANNER ────────────────────────────────────────────────────────────────
   Single-stroke hash letters. Joined with one space between glyphs. */
const FONT_BANNER = normalizeFont(parseFont(String.raw`
@A
 ###
#   #
#####
#   #
#   #

@B
#### 
#   #
#### 
#   #
#### 

@C
 ####
#    
#    
#    
 ####

@D
#### 
#   #
#   #
#   #
#### 

@E
#####
#    
#### 
#    
#####

@F
#####
#    
#### 
#    
#    

@G
 ####
#    
#  ##
#   #
 ####

@H
#   #
#   #
#####
#   #
#   #

@I
#####
  #  
  #  
  #  
#####

@J
   ##
    #
    #
#   #
 ### 

@K
#   #
#  # 
###  
#  # 
#   #

@L
#    
#    
#    
#    
#####

@M
#   #
## ##
# # #
#   #
#   #

@N
#   #
##  #
# # #
#  ##
#   #

@O
 ### 
#   #
#   #
#   #
 ### 

@P
#### 
#   #
#### 
#    
#    

@Q
 ### 
#   #
#   #
#  # 
 ## #

@R
#### 
#   #
#### 
#  # 
#   #

@S
 ####
#    
 ### 
    #
#### 

@T
#####
  #  
  #  
  #  
  #  

@U
#   #
#   #
#   #
#   #
 ### 

@V
#   #
#   #
#   #
 # # 
  #  

@W
#   #
#   #
# # #
## ##
#   #

@X
#   #
 # # 
  #  
 # # 
#   #

@Y
#   #
 # # 
  #  
  #  
  #  

@Z
#####
   # 
  #  
 #   
#####

@0
 ### 
#  ##
# # #
##  #
 ### 

@1
  #  
 ##  
  #  
  #  
#####

@2
 ### 
#   #
   # 
  #  
#####

@3
#### 
    #
 ### 
    #
#### 

@4
#   #
#   #
#####
    #
    #

@5
#####
#    
#### 
    #
#### 

@6
 ####
#    
#### 
#   #
 ### 

@7
#####
   # 
  #  
 #   
 #   

@8
 ### 
#   #
 ### 
#   #
 ### 

@9
 ### 
#   #
 ####
    #
#### 

@!
#
#
#

#

@?
 ### 
#   #
   # 
  #  

  #  
@.




#

@,




#
#
@-


#####


@_




#####
@'
#
#




@:

#

#


@(
 ##
#  
#  
#  
 ##

@)
## 
  #
  #
  #
## 

@/
    #
   # 
  #  
 #   
#    

@+

  #  
#####
  #  


@=


#####

#####

`));

/* ── BLOCK ─────────────────────────────────────────────────────────────────
   Double-stroke hash letters — the heavy weight next to BANNER's light one.
   The blank last row is also where SHADOW's drop shadow lands. */
const FONT_BLOCK = normalizeFont(parseFont(String.raw`
@A
 #### 
##  ##
######
##  ##
##  ##

@B
##### 
##  ##
##### 
##  ##
##### 

@C
 #####
##    
##    
##    
 #####

@D
##### 
##  ##
##  ##
##  ##
##### 

@E
######
##    
##### 
##    
######

@F
######
##    
##### 
##    
##    

@G
 #####
##    
##  ##
##  ##
 #####

@H
##  ##
##  ##
######
##  ##
##  ##

@I
######
  ##  
  ##  
  ##  
######

@J
    ##
    ##
    ##
##  ##
 #### 

@K
##  ##
## ## 
####  
## ## 
##  ##

@L
##    
##    
##    
##    
######

@M
##   ##
#######
## # ##
##   ##
##   ##

@N
##   ##
###  ##
## # ##
##  ###
##   ##

@O
 #### 
##  ##
##  ##
##  ##
 #### 

@P
##### 
##  ##
##### 
##    
##    

@Q
 #### 
##  ##
##  ##
## ## 
 ## ##

@R
##### 
##  ##
##### 
## ## 
##  ##

@S
 #####
##    
 #### 
    ##
##### 

@T
######
  ##  
  ##  
  ##  
  ##  

@U
##  ##
##  ##
##  ##
##  ##
 #### 

@V
##  ##
##  ##
##  ##
 #### 
  ##  

@W
##   ##
##   ##
## # ##
#######
##   ##

@X
##  ##
 #### 
  ##  
 #### 
##  ##

@Y
##  ##
 #### 
  ##  
  ##  
  ##  

@Z
######
   ## 
  ##  
 ##   
######

@0
 #### 
##  ##
##  ##
##  ##
 #### 

@1
  ##  
 ###  
  ##  
  ##  
######

@2
 #### 
##  ##
   ## 
  ##  
######

@3
##### 
    ##
 #### 
    ##
##### 

@4
##  ##
##  ##
######
    ##
    ##

@5
######
##    
##### 
    ##
##### 

@6
 #####
##    
##### 
##  ##
 #### 

@7
######
   ## 
  ##  
 ##   
 ##   

@8
 #### 
##  ##
 #### 
##  ##
 #### 

@9
 #### 
##  ##
 #####
    ##
##### 

@!
##
##
##
  
##

@?
 #### 
##  ##
   ## 
  ##  
      
  ##  
@.




##

@,




##
# 
@-


######


@_




######
@'
##
##




@:

##

##


@(
 ##
## 
## 
## 
 ##

@)
## 
 ##
 ##
 ##
## 

@/
    ##
   ## 
  ##  
 ##   
##    

@+

  ##  
######
  ##  


@=


######

######

`));

/* ── SMALL ─────────────────────────────────────────────────────────────────
   Four rows instead of six, for when the full-size fonts are too tall to
   paste somewhere. */
const FONT_SMALL = normalizeFont(parseFont(String.raw`
@A
 ## 
#  #
####
#  #
@B
### 
#  #
### 
### 
@C
 ###
#   
#   
 ###
@D
### 
#  #
#  #
### 
@E
####
#   
### 
####
@F
####
#   
### 
#   
@G
 ###
#   
# ##
 ###
@H
#  #
#  #
####
#  #
@I
###
 # 
 # 
###
@J
  ##
   #
#  #
 ## 
@K
#  #
# # 
##  
#  #
@L
#   
#   
#   
####
@M
#   #
## ##
# # #
#   #
@N
#  #
## #
# ##
#  #
@O
 ## 
#  #
#  #
 ## 
@P
### 
#  #
### 
#   
@Q
 ## 
#  #
# ##
 ###
@R
### 
#  #
### 
#  #
@S
 ###
##  
  ##
### 
@T
###
 # 
 # 
 # 
@U
#  #
#  #
#  #
 ## 
@V
#  #
#  #
 ## 
 ## 
@W
#   #
# # #
# # #
 # # 
@X
#  #
 ## 
 ## 
#  #
@Y
#  #
 ## 
  # 
  # 
@Z
####
  # 
 #  
####
@0
 ## 
#  #
#  #
 ## 
@1
 # 
## 
 # 
###
@2
 ## 
#  #
  # 
####
@3
### 
  ##
   #
### 
@4
#  #
#  #
####
   #
@5
####
#   
   #
### 
@6
 ###
#   
#  #
 ## 
@7
####
   #
  # 
 #  
@8
 ## 
#  #
 ## 
 ## 
@9
 ## 
#  #
 ###
### 
@!
#
#
 
#
@?
 ## 
#  #
  # 
  # 
@.



#
@,



#
#
@-

####


@_



####
@'
#
#


@:

#

#
@(
 #
# 
# 
 #
@)
# 
 #
 #
# 
@/
   #
  # 
 #  
#   
@+
   
 # 
###
 # 
@=

####

####
`));

/* Space is defined here rather than in the art blocks above so that an editor
   stripping trailing whitespace cannot silently collapse it to zero width. */
FONT_STANDARD[" "] = ["   ", "   ", "   ", "   ", "   ", "   "];
FONT_BANNER[" "]   = ["   ", "   ", "   ", "   ", "   ", "   "];
FONT_BLOCK[" "]    = ["    ", "    ", "    ", "    ", "    ", "    "];
FONT_SMALL[" "]    = ["  ", "  ", "  ", "  ", "  "];

/* One last pass per font, now that every glyph is in place: the letters,
   digits and punctuation were parsed in separate blocks, so this is what
   guarantees a single uniform height across the whole font. */
for (const font of [FONT_STANDARD, FONT_BANNER, FONT_BLOCK, FONT_SMALL]) {
    Object.assign(font, normalizeFont(font));
}

/* sep    — what goes between two glyphs. One space everywhere: the line-art
             fonts have almost no side bearing of their own, so without it a
             letter's right wall lands directly against the next letter's left
             wall and the two read as one shape.
   effect — a transform applied to the finished block. SLANT and SHADOW are
             the base fonts seen through one of these rather than separate
             hand-drawn alphabets, which is why they cannot fall out of
             alignment the way the old hand-drawn variants did. */
const FONTS = {
    standard: { glyphs: FONT_STANDARD, sep: " " },
    banner:   { glyphs: FONT_BANNER,   sep: " " },
    block:    { glyphs: FONT_BLOCK,    sep: " " },
    small:    { glyphs: FONT_SMALL,    sep: " " },
    shadow:   { glyphs: FONT_BLOCK,    sep: " ", effect: "shadow" },
    slant:    { glyphs: FONT_STANDARD, sep: " ", effect: "slant"  },
};

/* A character the font has no glyph for is printed as itself, sitting on the
   baseline, rather than silently vanishing. */
function fallbackGlyph(ch, height) {
    const rows = [];
    for (let r = 0; r < height; r++) {
        rows.push(r === height - 2 ? " " + ch + " " : "   ");
    }
    return rows;
}

/* Renders a string, returning multi-line ASCII art. */
function renderAsciiArt(text, fontName) {
    const font   = FONTS[fontName] || FONTS.standard;
    const glyphs = font.glyphs;
    const height = glyphs[" "].length;

    const chars = [...text.toUpperCase()].slice(0, 60);
    if (chars.length === 0) return "";

    const lineRows = Array.from({ length: height }, () => []);
    for (const ch of chars) {
        const glyph = glyphs[ch] || fallbackGlyph(ch, height);
        for (let r = 0; r < height; r++) {
            lineRows[r].push(glyph[r]);
        }
    }

    let lines = lineRows.map(parts => parts.join(font.sep));

    // Blank leading and trailing rows just waste vertical space; drop them
    // before the effect runs so the shear starts from the visible top row.
    while (lines.length && lines[0].trim() === "") lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

    if (font.effect === "slant")  lines = shearLines(lines);
    if (font.effect === "shadow") lines = shadowLines(lines, "#", ".");

    // Trailing spaces are noise once the art is pasted somewhere else.
    return lines.map(l => l.replace(/\s+$/, "")).join("\n");
}

/* ─────────────────────────────────────────────────────────────────────────
   UI
   ───────────────────────────────────────────────────────────────────────── */

const textInput  = document.getElementById("textInput");
const fontSelect = document.getElementById("fontSelect");
const sizeSelect = document.getElementById("sizeSelect");
const artOutput  = document.getElementById("artOutput");
const copyBtn    = document.getElementById("copyBtn");
const charCount  = document.getElementById("charCount");

let debounceTimer = null;

function updateArt() {
    const text = textInput.value;
    charCount.textContent = [...text].length;

    artOutput.className = "aa-output size-" + sizeSelect.value;

    if (!text.trim()) {
        artOutput.classList.add("empty");
        artOutput.textContent = "Type something above to see ASCII art here";
        return;
    }

    artOutput.classList.remove("empty");
    artOutput.textContent = renderAsciiArt(text, fontSelect.value);
}

function scheduleUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateArt, 60);
}

textInput.addEventListener("input", scheduleUpdate);
fontSelect.addEventListener("change", updateArt);
sizeSelect.addEventListener("change", updateArt);

function flashCopied() {
    copyBtn.textContent = "Copied!";
    copyBtn.classList.add("copied");
    setTimeout(() => {
        copyBtn.textContent = "Copy";
        copyBtn.classList.remove("copied");
    }, 1500);
}

copyBtn.addEventListener("click", () => {
    const art = artOutput.textContent;
    if (!art || artOutput.classList.contains("empty")) return;
    navigator.clipboard.writeText(art).then(flashCopied).catch(() => {
        // Fallback for browsers that refuse the async clipboard API
        const ta = document.createElement("textarea");
        ta.value = art;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); flashCopied(); } catch (_) { /* nothing else to try */ }
        document.body.removeChild(ta);
    });
});

updateArt();
