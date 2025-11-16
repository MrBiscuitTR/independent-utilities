document.addEventListener("DOMContentLoaded", () => {
    const textInput = document.getElementById("textInput");
    const wordCount = document.getElementById("wordCount");
    const charCount = document.getElementById("charCount");
    const lineCount = document.getElementById("lineCount");

    const includeSpaces = document.getElementById("includeSpaces");
    const includeLineJumps = document.getElementById("includeLineJumps");
    const separateByHyphen = document.getElementById("separateByHyphen");

    textInput.addEventListener("input", updateCounts);
    includeSpaces.addEventListener("change", updateCounts);
    includeLineJumps.addEventListener("change", updateCounts);
    separateByHyphen.addEventListener("change", updateCounts);

    function updateCounts() {
        const originalText = textInput.value; // <-- keep untouched for word counting
        let processedText = originalText;     // <-- used for char/line options

        // Handle "Include spaces"
        if (!includeSpaces.checked) {
            processedText = processedText.replace(/\s/g, "");
        }

        // Handle "Include line jumps"
        if (!includeLineJumps.checked) {
            processedText = processedText.replace(/\r\n|\r|\n/g, "");
        }

        // ---- WORD COUNT (always uses original text) ----
        let wordSeparators = [" "];

        if (separateByHyphen.checked) {
            wordSeparators.push("-");
        }

        const wordRegex = new RegExp("[" + wordSeparators.join("") + "]+");
        const words = originalText
            .split(wordRegex)
            .filter(w => w.trim().length > 0);

        wordCount.textContent = words.length;

        // ---- CHARACTER COUNT ----
        charCount.textContent = processedText.length;

        // ---- LINE COUNT ----
        const lines = originalText.split(/\r\n|\r|\n/);
        lineCount.textContent = lines.length;
    }
});
