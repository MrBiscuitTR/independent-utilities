/* matrix-calc.js
   Pure browser JS — no external requests, no API keys.
   Features:
     - Exact rational arithmetic (Fraction class)
     - Row Reduce (RREF) and Gaussian Elimination (REF)
     - Augmented matrices [A|b], [A|b1|b2|...], [A|I] for inverse
     - Symbolic last column (tracks variable expressions through row ops)
     - Rank, nullity, pivot columns, free variables
     - Unique / infinite / no solution detection
     - Parametric solution output
     - Cartesian equation of span (from symbolic column result)
     - Step-by-step operation log with formatted matrices at each step
*/
"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Rational arithmetic — avoids floating point errors entirely
// ─────────────────────────────────────────────────────────────────────────────
class Frac {
    constructor(n, d = 1) {
        if (typeof n === "string") {
            if (n.includes("/")) {
                const parts = n.split("/");
                n = parseInt(parts[0]);
                d = parseInt(parts[1]);
            } else {
                n = parseFloat(n);
                if (!Number.isInteger(n)) {
                    // Convert decimal to fraction
                    const s = String(n);
                    const dec = s.includes(".") ? s.split(".")[1].length : 0;
                    d = Math.pow(10, dec);
                    n = Math.round(parseFloat(s) * d);
                } else {
                    n = parseInt(n);
                }
            }
        }
        if (isNaN(n) || isNaN(d) || d === 0) { this.n = 0; this.d = 1; return; }
        const g = Frac._gcd(Math.abs(n), Math.abs(d));
        const sign = d < 0 ? -1 : 1;
        this.n = sign * n / g;
        this.d = sign * d / g;
    }
    static _gcd(a, b) { return b === 0 ? a : Frac._gcd(b, a % b); }
    static ZERO = new Frac(0);
    static ONE  = new Frac(1);
    isZero() { return this.n === 0; }
    isOne()  { return this.n === 1 && this.d === 1; }
    neg()    { return new Frac(-this.n, this.d); }
    abs()    { return new Frac(Math.abs(this.n), this.d); }
    add(o)   { return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o)   { return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o)   { return new Frac(this.n * o.n, this.d * o.d); }
    div(o)   { return new Frac(this.n * o.d, this.d * o.n); }
    eq(o)    { return this.n === o.n && this.d === o.d; }
    toFloat(){ return this.n / this.d; }
    toString() {
        if (this.d === 1) return String(this.n);
        return `${this.n}/${this.d}`;
    }
    toHTML() {
        if (this.d === 1) return String(this.n);
        const sign = this.n < 0 ? "-" : "";
        return `${sign}<sup>${Math.abs(this.n)}</sup>&frasl;<sub>${this.d}</sub>`;
    }
}

function parseFrac(s) {
    s = s.trim();
    if (!s || s === "0" || s === "") return Frac.ZERO;
    return new Frac(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Symbolic expression — linear combination of named variables + constant
// Represents: c₀ + c₁·x₁ + c₂·x₂ + … stored as Map<name,Frac> and constant Frac
// ─────────────────────────────────────────────────────────────────────────────
class Sym {
    constructor(constant = Frac.ZERO, vars = new Map()) {
        this.const = constant;                        // Frac
        this.vars  = new Map(vars);                   // Map<string, Frac>
    }
    static fromFrac(f) { return new Sym(f); }
    static fromStr(s) {
        s = s.trim();
        if (!s || s === "0") return new Sym();
        // Try plain number
        if (/^-?[\d./]+$/.test(s)) return new Sym(parseFrac(s));
        // Try single letter: a, b, c, x, y, z, x₁ etc.
        if (/^[a-zA-Z][₀-₉0-9]*$/.test(s)) {
            const m = new Map(); m.set(s, Frac.ONE);
            return new Sym(Frac.ZERO, m);
        }
        // Try coefficient × letter: 2a, -3b, 2/3a, -a
        const match = s.match(/^(-?[\d./]*)([a-zA-Z][₀-₉0-9]*)$/);
        if (match) {
            const coeff = match[1] === "" || match[1] === "+" ? Frac.ONE
                        : match[1] === "-" ? new Frac(-1)
                        : parseFrac(match[1]);
            const m = new Map(); m.set(match[2], coeff);
            return new Sym(Frac.ZERO, m);
        }
        // More complex: parse token by token (handle + and - separation)
        // Simple tokenizer for expressions like "2a+3b-c+1"
        const tokens = s.replace(/\s+/g, "").split(/(?=[+-])/);
        let sym = new Sym();
        for (const tok of tokens) {
            if (!tok) continue;
            const tm = tok.match(/^([+-]?[\d./]*)([a-zA-Z][₀-₉0-9]*)?$/);
            if (!tm) continue;
            const numPart = tm[1];
            const varPart = tm[2];
            if (varPart) {
                const coeff = numPart === "" || numPart === "+" ? Frac.ONE
                            : numPart === "-" ? new Frac(-1)
                            : parseFrac(numPart);
                const newM = new Map(sym.vars);
                newM.set(varPart, (sym.vars.get(varPart) || Frac.ZERO).add(coeff));
                sym = new Sym(sym.const, newM);
            } else if (numPart) {
                sym = new Sym(sym.const.add(parseFrac(numPart)), sym.vars);
            }
        }
        return sym;
    }
    isZero() {
        if (!this.const.isZero()) return false;
        for (const v of this.vars.values()) if (!v.isZero()) return false;
        return true;
    }
    scale(f) {
        if (f.isZero()) return new Sym();
        const newConst = this.const.mul(f);
        const newVars  = new Map();
        for (const [k, v] of this.vars) {
            const r = v.mul(f);
            if (!r.isZero()) newVars.set(k, r);
        }
        return new Sym(newConst, newVars);
    }
    add(o) {
        const newConst = this.const.add(o.const);
        const newVars  = new Map(this.vars);
        for (const [k, v] of o.vars) {
            const existing = newVars.get(k) || Frac.ZERO;
            const r = existing.add(v);
            if (r.isZero()) newVars.delete(k); else newVars.set(k, r);
        }
        return new Sym(newConst, newVars);
    }
    neg() { return this.scale(new Frac(-1)); }
    sub(o) { return this.add(o.neg()); }
    toString() {
        const parts = [];
        for (const [k, v] of this.vars) {
            if (v.isZero()) continue;
            if (v.isOne()) parts.push(k);
            else if (v.eq(new Frac(-1))) parts.push("-" + k);
            else parts.push(`${v}${k}`);
        }
        if (!this.const.isZero()) parts.push(String(this.const));
        if (parts.length === 0) return "0";
        // Assemble with +/- between terms
        let out = parts[0];
        for (let i = 1; i < parts.length; i++) {
            if (parts[i].startsWith("-")) out += parts[i];
            else out += "+" + parts[i];
        }
        return out;
    }
}

// A "cell value" is either a Frac (numeric) or a Sym (symbolic).
// In practice the base columns are always Frac; only aug cols can be Sym.
class Cell {
    constructor(v) { this.v = v; }
    static num(f) { return new Cell(f); }
    static sym(s) { return new Cell(s); }
    isSym()  { return this.v instanceof Sym; }
    isZero() { return this.isSym() ? this.v.isZero() : this.v.isZero(); }
    neg()    { return new Cell(this.isSym() ? this.v.neg() : this.v.neg()); }
    add(o) {
        if (!this.isSym() && !o.isSym()) return new Cell(this.v.add(o.v));
        const a = this.isSym() ? this.v : Sym.fromFrac(this.v);
        const b = o.isSym()   ? o.v    : Sym.fromFrac(o.v);
        return new Cell(a.add(b));
    }
    scale(f) {
        // f is always a Frac
        if (!this.isSym()) return new Cell(this.v.mul(f));
        return new Cell(this.v.scale(f));
    }
    toString() {
        return String(this.v);
    }
    toDisplayHTML() {
        if (this.isSym()) return escHtml(this.v.toString());
        return this.v.toHTML();
    }
    toDisplayStr() {
        if (this.isSym()) return this.v.toString();
        return this.v.toString();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Matrix class — 2D array of Cell, with row operations
// ─────────────────────────────────────────────────────────────────────────────
class Matrix {
    constructor(rows, cols) {
        this.rows = rows;
        this.cols = cols;
        this.data = Array.from({length: rows}, () =>
            Array.from({length: cols}, () => Cell.num(Frac.ZERO))
        );
    }

    get(r, c) { return this.data[r][c]; }
    set(r, c, v) { this.data[r][c] = v; }

    clone() {
        const m = new Matrix(this.rows, this.cols);
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                m.data[r][c] = this.data[r][c];
        return m;
    }

    // Scale row r by fraction f
    scaleRow(r, f) {
        for (let c = 0; c < this.cols; c++)
            this.data[r][c] = this.data[r][c].scale(f);
    }

    // Add f * row src to row dst
    addRow(dst, src, f) {
        for (let c = 0; c < this.cols; c++)
            this.data[dst][c] = this.data[dst][c].add(this.data[src][c].scale(f));
    }

    // Swap rows r1 and r2
    swapRows(r1, r2) {
        [this.data[r1], this.data[r2]] = [this.data[r2], this.data[r1]];
    }

    // Find the row with the largest absolute pivot value in col c, starting at row startR
    pivotRow(startR, c) {
        let best = startR, bestVal = 0;
        for (let r = startR; r < this.rows; r++) {
            const cell = this.data[r][c];
            if (cell.isSym()) continue;
            const abs = Math.abs(cell.v.toFloat());
            if (abs > bestVal) { bestVal = abs; best = r; }
        }
        return best;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gaussian elimination engine
// Returns { rref, steps, pivotCols, rank }
// ─────────────────────────────────────────────────────────────────────────────
function eliminate(mat, mode, baseCols) {
    const m = mat.clone();
    const steps = [];
    const pivotCols = [];
    let stepNum = 0;

    function snapshot(opHtml) {
        stepNum++;
        steps.push({ op: opHtml, mat: m.clone() });
    }

    // Forward elimination
    let pivotRow = 0;
    for (let col = 0; col < baseCols && pivotRow < m.rows; col++) {
        // Find pivot
        const pr = m.pivotRow(pivotRow, col);
        const pivotCell = m.get(pr, col);
        if (pivotCell.isZero()) continue; // no pivot in this column

        // Swap if needed
        if (pr !== pivotRow) {
            m.swapRows(pr, pivotRow);
            snapshot(`<span class="op-swap">R${pivotRow+1} ↔ R${pr+1}</span>`);
        }

        // Scale pivot row to make pivot = 1 (for RREF; for REF, skip this but normalize at end)
        const pivotVal = m.get(pivotRow, col).v; // always Frac for base cols
        if (!pivotVal.isOne()) {
            const inv = Frac.ONE.div(pivotVal);
            m.scaleRow(pivotRow, inv);
            snapshot(`<span class="op-scale">R${pivotRow+1} ← (${inv}) · R${pivotRow+1}</span>`);
        }

        pivotCols.push(col);

        // Eliminate below (forward pass)
        for (let r = pivotRow + 1; r < m.rows; r++) {
            const factor = m.get(r, col);
            if (factor.isZero()) continue;
            const fval = factor.isSym() ? null : factor.v;
            if (fval) {
                m.addRow(r, pivotRow, fval.neg());
                snapshot(`<span class="op-add">R${r+1} ← R${r+1} − (${fval}) · R${pivotRow+1}</span>`);
            }
        }

        pivotRow++;
    }

    const rank = pivotCols.length;

    // Back substitution (RREF only)
    if (mode === "rref") {
        for (let pi = pivotCols.length - 1; pi >= 0; pi--) {
            const col = pivotCols[pi];
            const pr  = pi; // pivot row index = pi (after forward pass, pivots are in rows 0..rank-1)
            for (let r = 0; r < pr; r++) {
                const factor = m.get(r, col);
                if (factor.isZero()) continue;
                const fval = factor.isSym() ? null : factor.v;
                if (fval) {
                    m.addRow(r, pr, fval.neg());
                    snapshot(`<span class="op-add">R${r+1} ← R${r+1} − (${fval}) · R${pr+1}</span>`);
                }
            }
        }
    }

    snapshot(`<span class="op-done">✓ Done</span>`);
    return { result: m, steps, pivotCols, rank };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build solution text from RREF result
// ─────────────────────────────────────────────────────────────────────────────
function interpretSolution(rref, pivotCols, rank, baseCols, augCols, varMode, varNames) {
    const rows = rref.rows;
    const totalCols = rref.cols; // baseCols + augCols
    const numVars = baseCols;

    // Check for inconsistency: pivot in augmented column
    // A row [0 0 0 | c] where c ≠ 0 with no base pivot → inconsistent
    for (let r = rank; r < rows; r++) {
        for (let c = baseCols; c < totalCols; c++) {
            if (!rref.get(r, c).isZero()) {
                return { type: "inconsistent", html: buildInconsistentHTML(r, rref, baseCols, totalCols) };
            }
        }
    }

    if (augCols === 0) {
        // Homogeneous or pure matrix — just describe rank/nullity
        return { type: "homogeneous", html: buildHomogeneousHTML(pivotCols, rank, numVars, varNames) };
    }

    const freeVars = [];
    const pivotSet = new Set(pivotCols);
    for (let c = 0; c < baseCols; c++) {
        if (!pivotSet.has(c)) freeVars.push(c);
    }

    if (freeVars.length === 0 && rank === numVars) {
        // Unique solution
        if (varMode && augCols === 1) {
            return { type: "span", html: buildSpanHTML(rref, pivotCols, baseCols, varNames) };
        }
        return { type: "unique", html: buildUniqueHTML(rref, pivotCols, baseCols, augCols, varNames) };
    } else {
        // Infinite solutions
        return { type: "infinite", html: buildInfiniteHTML(rref, pivotCols, freeVars, baseCols, augCols, varNames, varMode) };
    }
}

function varName(i, names) {
    if (names && names[i]) return names[i];
    if (i < 3) return ["x", "y", "z"][i];
    return "x" + subscript(i + 1);
}

function subscript(n) {
    const sub = "₀₁₂₃₄₅₆₇₈₉";
    return String(n).split("").map(d => sub[parseInt(d)] || d).join("");
}

function buildUniqueHTML(rref, pivotCols, baseCols, augCols, varNames) {
    let html = `<div class="mx-solution"><p class="sol-unique">✓ Unique solution</p>`;
    html += `<span class="sol-label">Solution vector</span>`;
    for (let pi = 0; pi < pivotCols.length; pi++) {
        const col = pivotCols[pi];
        const vn  = varName(col, varNames);
        // For each augmented column
        const vals = [];
        for (let ac = 0; ac < augCols; ac++) {
            vals.push(rref.get(pi, baseCols + ac).toDisplayStr());
        }
        html += `<code class="sol-eq">${vn} = ${vals.join("  ,  ")}</code>`;
    }
    html += `</div>`;
    return html;
}

function buildInconsistentHTML(r, rref, baseCols, totalCols) {
    return `<div class="mx-solution">
        <p class="sol-inconsistent">✗ Inconsistent — no solution exists</p>
        <p>Row ${r+1} yields a contradiction: all left-hand side coefficients are 0 but the right-hand side is non-zero.</p>
        <code class="sol-eq">${rowToStr(rref, r, baseCols, totalCols)}</code>
    </div>`;
}

function rowToStr(m, r, baseCols, totalCols) {
    const left  = Array.from({length: baseCols}, (_, c) => m.get(r, c).toDisplayStr()).join("  ");
    const right = Array.from({length: totalCols - baseCols}, (_, c) => m.get(r, baseCols + c).toDisplayStr()).join("  ");
    return `[ ${left} | ${right} ]`;
}

function buildHomogeneousHTML(pivotCols, rank, numVars, varNames) {
    const pivotSet = new Set(pivotCols);
    const freeVars = [];
    for (let c = 0; c < numVars; c++) if (!pivotSet.has(c)) freeVars.push(c);
    let html = `<div class="mx-solution">`;
    html += `<p>Homogeneous system Ax = 0 or plain matrix properties.</p>`;
    if (freeVars.length === 0) {
        html += `<p class="sol-unique">✓ Only the trivial solution: all variables = 0</p>`;
    } else {
        html += `<p class="sol-infinite">∞ Non-trivial solutions exist — ${freeVars.length} free variable(s)</p>`;
        html += `<span class="sol-label">Free variables</span><code class="sol-eq">${freeVars.map(c => varName(c, varNames)).join(", ")}</code>`;
    }
    html += `</div>`;
    return html;
}

function buildInfiniteHTML(rref, pivotCols, freeVars, baseCols, augCols, varNames, varMode) {
    let html = `<div class="mx-solution">`;
    html += `<p class="sol-infinite">∞ Infinitely many solutions — ${freeVars.length} free variable(s)</p>`;

    const freeParams = freeVars.map((c, i) => {
        const letters = ["s", "t", "u", "v", "w"];
        return { col: c, param: letters[i] || `t${subscript(i+1)}` };
    });

    html += `<span class="sol-label">Free variables → parameters</span>`;
    html += `<code class="sol-eq">${freeParams.map(f => `${varName(f.col, varNames)} = <span class="sol-free">${f.param}</span>`).join("  ,  ")}</code>`;

    html += `<span class="sol-label">Parametric solution</span>`;
    const pivotSet = new Set(pivotCols);
    for (let pi = 0; pi < pivotCols.length; pi++) {
        const col = pivotCols[pi];
        const vn  = varName(col, varNames);
        for (let ac = 0; ac < augCols; ac++) {
            let expr = rref.get(pi, baseCols + ac).toDisplayStr();
            // Subtract the free variable contributions
            let parts = [expr];
            for (const fp of freeParams) {
                const coeff = rref.get(pi, fp.col);
                if (!coeff.isZero()) {
                    const cstr = coeff.toDisplayStr();
                    if (cstr === "1")       parts.push(`− ${fp.param}`);
                    else if (cstr === "-1") parts.push(`+ ${fp.param}`);
                    else if (cstr.startsWith("-")) parts.push(`+ ${cstr.slice(1)}${fp.param}`);
                    else parts.push(`− ${cstr}${fp.param}`);
                }
            }
            html += `<code class="sol-eq">${vn} = ${parts.join(" ")}</code>`;
        }
    }

    if (varMode && augCols === 1) {
        html += buildSpanHTML(rref, pivotCols, baseCols, varNames);
    }

    html += `</div>`;
    return html;
}

function buildSpanHTML(rref, pivotCols, baseCols, varNames) {
    // The symbolic column gives a Cartesian equation of the span.
    // Each pivot row: left-side variables eliminated, last col has symbolic expression.
    // This means: Σ(coefficients × variables) = symbolic(a,b,c,…)
    // → Rearrange to get: symbolic(a,b,c,…) = f(free vars) → eliminates to pure relation.
    // We extract the result from the symbolic column directly.
    let html = `<span class="sol-label">Cartesian equation(s) of the span</span>`;
    // Zero rows give the equations
    let equationCount = 0;
    for (let r = 0; r < rref.rows; r++) {
        // Check if base cols are all zero
        let allZero = true;
        for (let c = 0; c < baseCols; c++) {
            if (!rref.get(r, c).isZero()) { allZero = false; break; }
        }
        if (allZero) {
            const rhs = rref.get(r, baseCols);
            if (!rhs.isZero()) {
                // This is a Cartesian constraint: symbolic = 0
                html += `<code class="sol-eq">${escHtml(rhs.toDisplayStr())} = 0</code>`;
                equationCount++;
            }
        } else {
            // Pivot row — the RHS gives the expression for the pivot variable
            // Not directly a Cartesian equation
        }
    }
    if (equationCount === 0) {
        html += `<code class="sol-eq">(The span is all of ℝⁿ — no constraints)</code>`;
    }
    return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the inverse from [A|I] → RREF → [I|A⁻¹]
// ─────────────────────────────────────────────────────────────────────────────
function buildInverseHTML(rref, baseCols) {
    const n = baseCols;
    // Check identity on left side
    let isIdentity = true;
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const expected = r === c ? Frac.ONE : Frac.ZERO;
            const cell = rref.get(r, c);
            if (cell.isSym() || !cell.v.eq(expected)) { isIdentity = false; break; }
        }
        if (!isIdentity) break;
    }

    if (!isIdentity) {
        return `<div class="mx-solution"><p class="sol-inconsistent">✗ Matrix is singular — no inverse exists (rank < n)</p></div>`;
    }

    let html = `<div class="mx-solution"><p class="sol-unique">✓ Inverse found — right half of the reduced matrix is A⁻¹</p></div>`;
    return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset data
// ─────────────────────────────────────────────────────────────────────────────
const PRESETS = {
    "3x3aug": {
        rows: 3, cols: 3, aug: 1, op: "rref", varMode: false,
        data: [["2","1","-1","8"],["−3","−1","2","−11"],["−2","1","2","−3"]],
        note: "Classic 3×3 system — unique solution"
    },
    "3x3inv": {
        rows: 3, cols: 3, aug: "auto-identity", op: "inverse", varMode: false,
        data: [["1","2","3"],["0","1","4"],["5","6","0"]],
        note: "3×3 matrix — compute inverse via [A|I]"
    },
    "4x3aug": {
        rows: 4, cols: 3, aug: 1, op: "rref", varMode: false,
        data: [["1","2","3","4"],["2","5","7","8"],["1","3","4","5"],["3","7","10","12"]],
        note: "Over-determined system (4 equations, 3 unknowns)"
    },
    "3x4aug": {
        rows: 3, cols: 4, aug: 1, op: "rref", varMode: false,
        data: [["1","2","3","1","0"],["0","1","1","2","1"],["2","1","3","-1","1"]],
        note: "Under-determined system — infinite solutions"
    },
    "span3": {
        rows: 3, cols: 3, aug: 1, op: "rref", varMode: true,
        data: [["1","0","2","a"],["0","1","-1","b"],["2","1","3","c"]],
        note: "Find Cartesian equation of span(v₁,v₂,v₃)"
    },
    "2x2inv": {
        rows: 2, cols: 2, aug: "auto-identity", op: "inverse", varMode: false,
        data: [["3","1"],["5","2"]],
        note: "2×2 inverse"
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// UI State
// ─────────────────────────────────────────────────────────────────────────────
let currentRows = 3, currentCols = 3, currentAug = 1, currentOp = "rref", currentVarMode = false;

// ─────────────────────────────────────────────────────────────────────────────
// Build the matrix input grid
// ─────────────────────────────────────────────────────────────────────────────
function buildGrid(rows, cols, aug, varMode, prefillData) {
    currentRows = rows; currentCols = cols; currentAug = aug; currentOp = document.getElementById("mxOp").value; currentVarMode = varMode;

    const isInverse = currentOp === "inverse";
    const effectiveAug = isInverse ? cols : aug;

    const container = document.getElementById("matrixGrid");
    container.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "mx-grid";

    const totalCols = cols + effectiveAug;
    // CSS grid: each base col, then separator, then aug cols (last one may be var)
    let gtc = "";
    for (let c = 0; c < cols; c++) gtc += "64px ";
    if (effectiveAug > 0) gtc += "24px "; // separator
    for (let a = 0; a < effectiveAug; a++) {
        const isLast = a === effectiveAug - 1;
        const isVarCol = varMode && isLast && !isInverse;
        gtc += isVarCol ? "90px " : "64px ";
    }
    grid.style.gridTemplateColumns = gtc.trim();
    grid.style.gridTemplateRows = `repeat(${rows}, 36px)`;

    for (let r = 0; r < rows; r++) {
        // Base matrix columns
        for (let c = 0; c < cols; c++) {
            const input = document.createElement("input");
            input.type = "text";
            input.className = "mx-cell";
            input.dataset.r = r;
            input.dataset.c = c;
            input.dataset.type = "base";
            input.placeholder = "0";
            if (prefillData && prefillData[r] && prefillData[r][c] !== undefined) {
                input.value = prefillData[r][c] !== "0" ? prefillData[r][c] : "";
            }
            if (r === 0 && c === 0) input.autofocus = true;
            // Keyboard navigation: arrow keys + tab
            input.addEventListener("keydown", cellKeyNav);
            grid.appendChild(input);
        }
        // Separator (only first row to span all rows via row positioning)
        if (effectiveAug > 0 && r === 0) {
            const sep = document.createElement("div");
            sep.className = "mx-col-sep";
            sep.style.gridRow = `1 / ${rows + 1}`;
            sep.innerHTML = "|";
            grid.appendChild(sep);
        }
        // Augmented columns
        for (let a = 0; a < effectiveAug; a++) {
            const input = document.createElement("input");
            const isLast = a === effectiveAug - 1;
            const isVarCol = varMode && isLast && !isInverse;
            input.type = "text";
            input.className = isVarCol ? "mx-cell var-col" : "mx-cell aug-col";
            input.dataset.r = r;
            input.dataset.c = cols + a;
            input.dataset.type = isVarCol ? "var" : "aug";
            input.placeholder = isInverse ? (r === a ? "1" : "0") : (isVarCol ? "e.g. a" : "0");
            if (isInverse) {
                input.value = r === a ? "1" : "";
                input.style.background = "#f8f8f8";
                input.readOnly = true;
            } else if (prefillData && prefillData[r] && prefillData[r][cols + a] !== undefined) {
                const val = prefillData[r][cols + a];
                input.value = val !== "0" ? val : "";
            }
            input.addEventListener("keydown", cellKeyNav);
            grid.appendChild(input);
        }
    }

    container.appendChild(grid);

    // Update title
    const titleEl = document.getElementById("matrixInputTitle");
    if (isInverse) titleEl.textContent = `Enter ${rows}×${cols} matrix to invert [A | I will be appended]`;
    else           titleEl.textContent = `Enter ${rows}×${cols + effectiveAug} matrix${effectiveAug > 0 ? " (augmented)" : ""}`;

    // Var note
    const varNote = document.getElementById("varModeNote");
    if (varMode && !isInverse) varNote.classList.remove("hidden");
    else varNote.classList.add("hidden");

    document.getElementById("matrixInputSection").style.display = "";
    document.getElementById("resultsSection").style.display = "none";
}

// Arrow key navigation between cells
function cellKeyNav(e) {
    if (!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"].includes(e.key)) return;
    const r = parseInt(this.dataset.r);
    const c = parseInt(this.dataset.c);
    let tr = r, tc = c;
    if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey))   tr--;
    else if (e.key === "ArrowDown" || e.key === "Enter")             tr++;
    else if (e.key === "ArrowLeft")  tc--;
    else if (e.key === "ArrowRight") tc++;
    else return;
    const next = document.querySelector(`.mx-cell[data-r="${tr}"][data-c="${tc}"]`);
    if (next) { e.preventDefault(); next.focus(); next.select(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Read matrix from grid
// ─────────────────────────────────────────────────────────────────────────────
function readMatrix() {
    const isInverse = currentOp === "inverse";
    const effectiveAug = isInverse ? currentCols : currentAug;
    const totalCols = currentCols + effectiveAug;
    const m = new Matrix(currentRows, totalCols);

    for (let r = 0; r < currentRows; r++) {
        for (let c = 0; c < currentCols; c++) {
            const input = document.querySelector(`.mx-cell[data-r="${r}"][data-c="${c}"]`);
            const val = (input ? input.value.trim() : "") || "0";
            try { m.set(r, c, Cell.num(parseFrac(val))); }
            catch (e) { m.set(r, c, Cell.num(Frac.ZERO)); }
        }
        for (let a = 0; a < effectiveAug; a++) {
            const c = currentCols + a;
            const input = document.querySelector(`.mx-cell[data-r="${r}"][data-c="${c}"]`);
            const val = (input ? input.value.trim() : "") || "0";
            const isLastAug = a === effectiveAug - 1;
            const isVarCol  = currentVarMode && isLastAug && !isInverse;
            if (isVarCol) {
                try { m.set(r, c, Cell.sym(Sym.fromStr(val))); }
                catch (e) { m.set(r, c, Cell.sym(new Sym())); }
            } else {
                if (isInverse) {
                    m.set(r, c, Cell.num(r === a ? Frac.ONE : Frac.ZERO));
                } else {
                    try { m.set(r, c, Cell.num(parseFrac(val))); }
                    catch (e) { m.set(r, c, Cell.num(Frac.ZERO)); }
                }
            }
        }
    }
    return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render a Matrix as an HTML display grid
// ─────────────────────────────────────────────────────────────────────────────
function renderMatrix(mat, baseCols, augCols, pivotCols) {
    const pivotSet = new Set(pivotCols || []);
    const totalCols = mat.cols;
    let gtc = "";
    for (let c = 0; c < baseCols; c++) gtc += "56px ";
    if (augCols > 0) gtc += "18px ";
    for (let a = 0; a < augCols; a++) gtc += "64px ";

    const grid = document.createElement("div");
    grid.className = "mx-display-grid";
    grid.style.gridTemplateColumns = gtc.trim();
    grid.style.gridTemplateRows = `repeat(${mat.rows}, 32px)`;

    for (let r = 0; r < mat.rows; r++) {
        for (let c = 0; c < baseCols; c++) {
            const cell = mat.get(r, c);
            const div = document.createElement("div");
            div.className = "mx-dval" + (pivotSet.has(c) ? " pivot-col" : "") + (cell.isZero() ? " zero" : "");
            div.innerHTML = cell.toDisplayHTML();
            grid.appendChild(div);
        }
        if (augCols > 0 && r === 0) {
            const sep = document.createElement("div");
            sep.className = "mx-dsep";
            sep.style.gridRow = `1 / ${mat.rows + 1}`;
            sep.textContent = "|";
            grid.appendChild(sep);
        }
        for (let a = 0; a < augCols; a++) {
            const c = baseCols + a;
            const cell = mat.get(r, c);
            const div = document.createElement("div");
            const isVarCol = cell.isSym();
            div.className = "mx-dval" + (isVarCol ? " var" : " aug") + (cell.isZero() ? " zero" : "");
            div.innerHTML = cell.toDisplayHTML();
            grid.appendChild(div);
        }
    }
    return grid;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main solve function
// ─────────────────────────────────────────────────────────────────────────────
function solve() {
    const mat = readMatrix();
    const isInverse = currentOp === "inverse";
    const effectiveAug = isInverse ? currentCols : currentAug;
    const mode = currentOp === "ref" ? "ref" : "rref";

    // Run elimination
    const { result, steps, pivotCols, rank } = eliminate(mat, mode, currentCols);

    const nullity   = currentCols - rank;
    const isFull    = rank === Math.min(currentRows, currentCols);
    const isSquare  = currentRows === currentCols;
    const det       = isSquare && rank === currentCols ? "non-zero" : "0 (singular)";

    // Interpret solution
    let interpretation = null;
    if (isInverse) {
        interpretation = buildInverseHTML(result, currentCols);
    } else if (effectiveAug > 0) {
        const interp = interpretSolution(result, pivotCols, rank, currentCols, effectiveAug, currentVarMode, null);
        interpretation = { html: interp.html, type: interp.type };
    }

    // ── Render UI ────────────────────────────────────────────────────────────
    document.getElementById("resultsSection").style.display = "";

    // Summary
    const summaryItems = [
        { k: "Matrix Size",    v: `${currentRows} × ${currentCols}` },
        { k: "Rank",           v: rank, cls: isFull ? "good" : "warn" },
        { k: "Nullity",        v: nullity, cls: nullity === 0 ? "good" : "warn" },
    ];
    if (effectiveAug > 0) {
        summaryItems.push({ k: "Pivot Cols", v: pivotCols.map(c => c + 1).join(", ") || "none" });
    }
    if (isSquare) {
        summaryItems.push({ k: "Invertible", v: rank === currentCols ? "Yes" : "No", cls: rank === currentCols ? "good" : "bad" });
    }
    if (currentCols > rank) {
        const freeCols = [];
        const pivotSet = new Set(pivotCols);
        for (let c = 0; c < currentCols; c++) if (!pivotSet.has(c)) freeCols.push(c + 1);
        summaryItems.push({ k: "Free Vars", v: `col ${freeCols.join(", ")}`, cls: "warn" });
    }

    document.getElementById("summaryGrid").innerHTML = summaryItems.map(item =>
        `<div class="mx-summary-item">
            <span class="mx-summary-key">${escHtml(item.k)}</span>
            <span class="mx-summary-val ${item.cls || ""}">${escHtml(String(item.v))}</span>
        </div>`
    ).join("");

    // Result matrix
    const resultTitle = isInverse ? "Reduced Matrix [I | A⁻¹]" :
                        mode === "rref" ? "Row Reduced Echelon Form (RREF)" :
                        "Row Echelon Form (REF)";
    document.getElementById("resultMatrixTitle").textContent = resultTitle;
    const display = document.getElementById("resultMatrixDisplay");
    display.innerHTML = "";
    display.appendChild(renderMatrix(result, currentCols, effectiveAug, pivotCols));

    // Solution / interpretation
    const solCard = document.getElementById("solutionCard");
    if (interpretation) {
        document.getElementById("solutionTitle").textContent =
            isInverse ? "Inverse Result" :
            interpretation.type === "unique" ? "Unique Solution" :
            interpretation.type === "inconsistent" ? "No Solution (Inconsistent)" :
            interpretation.type === "infinite" ? "Infinite Solutions (Parametric)" :
            interpretation.type === "span" ? "Cartesian Equation of Span" :
            "Solution";
        document.getElementById("solutionBody").innerHTML = interpretation.html;
        solCard.style.display = "";
    } else {
        solCard.style.display = "none";
    }

    // Steps
    const stepsBody = document.getElementById("stepsBody");
    stepsBody.innerHTML = steps.map((step, i) => {
        const matGrid = renderMatrix(step.mat, currentCols, effectiveAug, pivotCols);
        const div = document.createElement("div");
        div.className = "mx-step";
        div.innerHTML = `<div class="mx-step-label">
            <span class="mx-step-num">${i + 1}</span>
            <span class="mx-op-desc">${step.op}</span>
        </div>`;
        div.appendChild(matGrid);
        return div.outerHTML;
    }).join("");
    // Re-render to actually insert the grid elements (innerHTML can't insert elements directly)
    // Instead build HTML with serialized matrix
    const stepsHTML = steps.map((step, i) => {
        return `<div class="mx-step">
            <div class="mx-step-label">
                <span class="mx-step-num">${i + 1}</span>
                <span class="mx-op-desc">${step.op}</span>
            </div>
            ${matrixToHTML(step.mat, currentCols, effectiveAug, pivotCols)}
        </div>`;
    }).join("");
    stepsBody.innerHTML = stepsHTML;

    document.getElementById("resultsSection").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function matrixToHTML(mat, baseCols, augCols, pivotCols) {
    const pivotSet = new Set(pivotCols || []);
    let gtc = "";
    for (let c = 0; c < baseCols; c++) gtc += "52px ";
    if (augCols > 0) gtc += "16px ";
    for (let a = 0; a < augCols; a++) gtc += "60px ";

    let inner = "";
    for (let r = 0; r < mat.rows; r++) {
        for (let c = 0; c < baseCols; c++) {
            const cell = mat.get(r, c);
            const cls = "mx-dval" + (pivotSet.has(c) ? " pivot-col" : "") + (cell.isZero() ? " zero" : "");
            inner += `<div class="${cls}">${cell.toDisplayHTML()}</div>`;
        }
        if (augCols > 0 && r === 0) {
            inner += `<div class="mx-dsep" style="grid-row:1/${mat.rows+1}">|</div>`;
        }
        for (let a = 0; a < augCols; a++) {
            const cell = mat.get(r, baseCols + a);
            const cls = "mx-dval " + (cell.isSym() ? "var" : "aug") + (cell.isZero() ? " zero" : "");
            inner += `<div class="${cls}">${cell.toDisplayHTML()}</div>`;
        }
    }

    return `<div class="mx-display-grid" style="grid-template-columns:${gtc.trim()};grid-template-rows:repeat(${mat.rows},30px)">${inner}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────────────────────────────
const tooltip = document.getElementById("mxTooltip");

function showTip(icon) {
    tooltip.textContent = icon.dataset.tip;
    tooltip.classList.add("visible");
    const r = icon.getBoundingClientRect();
    let top = r.bottom + 8;
    let left = r.left;
    if (left + 310 > window.innerWidth) left = window.innerWidth - 320;
    if (top + 120 > window.innerHeight) top = r.top - 128;
    tooltip.style.top = top + "px";
    tooltip.style.left = left + "px";
}

document.addEventListener("mouseover", e => {
    const icon = e.target.closest(".mx-info-icon");
    if (icon && icon.dataset.tip) showTip(icon);
});
document.addEventListener("mouseout", e => {
    if (e.target.closest(".mx-info-icon")) tooltip.classList.remove("visible");
});
document.addEventListener("click", e => {
    const icon = e.target.closest(".mx-info-icon");
    if (!icon) { tooltip.classList.remove("visible"); return; }
    if (icon.dataset.tip) {
        if (tooltip.classList.contains("visible") && tooltip.textContent === icon.dataset.tip)
            tooltip.classList.remove("visible");
        else showTip(icon);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────
function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Wiring
// ─────────────────────────────────────────────────────────────────────────────
document.getElementById("buildMatrixBtn").addEventListener("click", () => {
    const rows = parseInt(document.getElementById("mxRows").value);
    const cols = parseInt(document.getElementById("mxCols").value);
    const aug  = parseInt(document.getElementById("mxAug").value);
    const varMode = document.getElementById("mxVarMode").checked;
    buildGrid(rows, cols, aug, varMode, null);
});

document.getElementById("solveBtn").addEventListener("click", solve);

document.getElementById("fillZeroBtn").addEventListener("click", () => {
    document.querySelectorAll(".mx-cell:not([readonly])").forEach(i => { i.value = ""; });
});

document.getElementById("fillIdentityBtn").addEventListener("click", () => {
    document.querySelectorAll(".mx-cell[data-type=base]").forEach(i => {
        const r = parseInt(i.dataset.r), c = parseInt(i.dataset.c);
        i.value = r === c ? "1" : "";
    });
});

document.getElementById("clearMatrixBtn").addEventListener("click", () => {
    document.querySelectorAll(".mx-cell:not([readonly])").forEach(i => { i.value = ""; });
});

// Operation change
document.getElementById("mxOp").addEventListener("change", () => {
    const op = document.getElementById("mxOp").value;
    if (op === "inverse") {
        document.getElementById("mxAug").value = "0";
        document.getElementById("mxVarMode").checked = false;
    }
});

// Presets
document.querySelectorAll(".mx-preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const key = btn.dataset.preset;
        const preset = PRESETS[key];
        if (!preset) return;
        document.getElementById("mxRows").value = preset.rows;
        document.getElementById("mxCols").value = preset.cols;
        document.getElementById("mxOp").value   = preset.op;
        document.getElementById("mxVarMode").checked = preset.varMode || false;

        let augVal;
        if (preset.aug === "auto-identity") {
            augVal = 0; // handled inside buildGrid for inverse
        } else {
            augVal = preset.aug;
            document.getElementById("mxAug").value = augVal;
        }

        buildGrid(preset.rows, preset.cols, preset.aug === "auto-identity" ? 0 : preset.aug,
                  preset.varMode || false, preset.data);
    });
});

// Steps toggle
document.getElementById("stepsToggle").addEventListener("click", () => {
    const body  = document.getElementById("stepsBody");
    const arrow = document.querySelector(".mx-steps-arrow");
    body.classList.toggle("open");
    arrow.classList.toggle("open");
});

// Auto-build default matrix on page load
buildGrid(3, 3, 1, false, null);
