document.addEventListener("DOMContentLoaded", () => {
    const textInput = document.getElementById("textInput");
    const wordCount = document.getElementById("wordCount");
    const charCount = document.getElementById("charCount");
    const lineCount = document.getElementById("lineCount");

    const includeSpaces    = document.getElementById("includeSpaces");
    const includeLineJumps = document.getElementById("includeLineJumps");
    const separateByHyphen = document.getElementById("separateByHyphen");

    textInput.addEventListener("input", updateCounts);
    includeSpaces.addEventListener("change", updateCounts);
    includeLineJumps.addEventListener("change", updateCounts);
    separateByHyphen.addEventListener("change", updateCounts);

    const NEWLINES = /\r\n|\r|\n/g;
    // Whitespace that is NOT a line break: spaces, tabs, non-breaking spaces…
    // Using \s here instead would swallow newlines too, which is what used to
    // make the "include line breaks" option do nothing whenever "include
    // spaces" was off.
    const HORIZONTAL_WS = /[^\S\r\n]/g;

    function updateCounts() {
        const text = textInput.value;

        // ── CHARACTER COUNT ──
        // The two options cover disjoint sets of characters, so they can be
        // toggled independently and in any order.
        let counted = text;
        if (!includeLineJumps.checked) counted = counted.replace(NEWLINES, "");
        if (!includeSpaces.checked)    counted = counted.replace(HORIZONTAL_WS, "");

        // Count by code point, so an emoji or an accented character built from
        // a surrogate pair counts as one character rather than two.
        charCount.textContent = [...counted].length;

        // ── WORD COUNT ──
        // Split on every run of whitespace, not just literal spaces: words
        // separated by a newline or a tab are still separate words.
        const separator = separateByHyphen.checked ? /[\s-]+/ : /\s+/;
        const words = text.split(separator).filter(w => w.length > 0);
        wordCount.textContent = words.length;

        // ── LINE COUNT ──
        // Empty input is zero lines, not one.
        lineCount.textContent = text.length === 0 ? 0 : text.split(NEWLINES).length;
    }

    updateCounts();
});
