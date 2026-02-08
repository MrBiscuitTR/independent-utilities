document.addEventListener("DOMContentLoaded", () => {
    // Collapsible functionality
    document.querySelectorAll(".collapsible").forEach(btn => {
        btn.addEventListener("click", () => {
            btn.classList.toggle("active");
            let content = btn.nextElementSibling;
            content.style.display = (content.style.display === "block") ? "none" : "block";
        });
    });

    // Conversion factors and functions
    const converters = {
        length: {
            base: "m",
            units: {
                mm: 0.001, cm: 0.01, m: 1, km: 1000,
                in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344,
                um: 1e-6, nm: 1e-9, nmi: 1852, au: 1.496e11
            }
        },
        mass: {
            base: "kg",
            units: {
                mg: 1e-6, g: 0.001, kg: 1, t: 1000,
                lb: 0.45359237, oz: 0.028349523125, st: 6.35029318, slug: 14.59390294
            }
        },
        temperature: {
            base: "C",
            units: {
                C: v => v, 
                F: v => (v - 32) * 5/9,
                K: v => v - 273.15,
                R: v => (v - 491.67) * 5/9
            },
            fromBase: {
                C: v => v,
                F: v => v * 9/5 + 32,
                K: v => v + 273.15,
                R: v => (v + 273.15) * 9/5
            }
        },
        volume: {
            base: "m3",
            units: {
                mL: 1e-6, L: 1e-3, m3: 1, cm3: 1e-6, mm3: 1e-9,
                in3: 1.6387e-5, ft3: 0.0283168,
                gal_us: 0.00378541, gal_uk: 0.00454609,
                bbl: 0.158987, km3: 1e9
            }
        },
        area: {
            base: "m2",
            units: {
                mm2: 1e-6, cm2: 1e-4, m2: 1, ha: 1e4, km2: 1e6,
                in2: 0.00064516, ft2: 0.092903, yd2: 0.836127,
                mi2: 2.58999e6, acre: 4046.8564224
            }
        },
        speed: {
            base: "mps",
            units: {
                mps: 1, kmph: 0.277778, mph: 0.44704,
                kn: 0.514444, fps: 0.3048, c: 299792458
            }
        },
        time: {
            base: "s",
            units: {
                ns: 1e-9, us: 1e-6, ms: 1e-3, s: 1,
                min: 60, h: 3600, day: 86400, wk: 604800,
                mo: 2629800, yr: 31557600, cent: 3155760000
            }
        },
        energy: {
            base: "J",
            units: {
                J: 1, kJ: 1000, MJ: 1e6, GJ: 1e9,
                cal: 4.184, kcal: 4184,
                Wh: 3600, kWh: 3.6e6,
                eV: 1.602176634e-19, BTU: 1055.06
            }
        },
        pressure: {
            base: "Pa",
            units: {
                Pa: 1, kPa: 1000, MPa: 1e6, bar: 1e5,
                atm: 101325, psi: 6894.76, torr: 133.322
            }
        }
    };

    function updateFields(category, fromUnit, value) {
        const group = document.querySelector(`.unit-group[data-category="${category}"]`);
        const inputs = group.querySelectorAll("input");

        if (category === "temperature") {
            let baseValue = converters.temperature.units[fromUnit](parseFloat(value));
            inputs.forEach(input => {
                if (input.dataset.unit !== fromUnit) {
                    input.value = isNaN(baseValue) ? "" : 
                        converters.temperature.fromBase[input.dataset.unit](baseValue).toFixed(4);
                }
            });
        } else {
            let baseValue = parseFloat(value) * converters[category].units[fromUnit];
            inputs.forEach(input => {
                if (input.dataset.unit !== fromUnit) {
                    input.value = isNaN(baseValue) ? "" :
                        (baseValue / converters[category].units[input.dataset.unit]).toFixed(6);
                }
            });
        }
    }

    // Attach event listeners
    document.querySelectorAll(".unit-group").forEach(group => {
        let category = group.dataset.category;
        group.querySelectorAll("input").forEach(input => {
            input.addEventListener("input", () => {
                if (input.value !== "") {
                    updateFields(category, input.dataset.unit, input.value);
                }
            });
        });
    });
});

// document.addEventListener("DOMContentLoaded", () => {
//   // Collapsible functionality
//   document.querySelectorAll(".collapsible").forEach(btn => {
//     btn.addEventListener("click", () => {
//       btn.classList.toggle("active");
//       let content = btn.nextElementSibling;
//       content.style.display = (content.style.display === "block") ? "none" : "block";
//     });
//   });

//   const converters = {
//     length: {
//       base: "m",
//       units: {
//         mm: 0.001, cm: 0.01, m: 1, km: 1000,
//         in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344,
//         um: 1e-6, nm: 1e-9, nmi: 1852, au: 1.496e11
//       }
//     },
//     mass: {
//       base: "kg",
//       units: {
//         mg: 1e-6, g: 0.001, kg: 1, t: 1000,
//         lb: 0.45359237, oz: 0.028349523125, st: 6.35029318, slug: 14.59390294
//       }
//     },
//     temperature: {
//       base: "C",
//       units: {
//         C: v => v, 
//         F: v => (v - 32) * 5/9,
//         K: v => v - 273.15,
//         R: v => (v - 491.67) * 5/9
//       },
//       fromBase: {
//         C: v => v,
//         F: v => v * 9/5 + 32,
//         K: v => v + 273.15,
//         R: v => (v + 273.15) * 9/5
//       }
//     },
//     volume: {
//       base: "m3",
//       units: {
//         mL: 1e-6, L: 1e-3, m3: 1, cm3: 1e-6, mm3: 1e-9,
//         in3: 1.6387e-5, ft3: 0.0283168,
//         gal_us: 0.00378541, gal_uk: 0.00454609,
//         bbl: 0.158987, km3: 1e9
//       }
//     },
//     area: {
//       base: "m2",
//       units: {
//         mm2: 1e-6, cm2: 1e-4, m2: 1, ha: 1e4, km2: 1e6,
//         in2: 0.00064516, ft2: 0.092903, yd2: 0.836127,
//         mi2: 2.58999e6, acre: 4046.8564224
//       }
//     },
//     speed: {
//       base: "mps",
//       units: {
//         mps: 1, kmph: 0.277778, mph: 0.44704,
//         kn: 0.514444, fps: 0.3048, c: 299792458
//       }
//     },
//     time: {
//       base: "s",
//       units: {
//         ns: 1e-9, us: 1e-6, ms: 1e-3, s: 1,
//         min: 60, h: 3600, day: 86400, wk: 604800,
//         mo: 2629800, yr: 31557600, cent: 3155760000
//       }
//     },
//     energy: {
//       base: "J",
//       units: {
//         J: 1, kJ: 1000, MJ: 1e6, GJ: 1e9,
//         cal: 4.184, kcal: 4184,
//         Wh: 3600, kWh: 3.6e6,
//         eV: 1.602176634e-19, BTU: 1055.06
//       }
//     },
//     pressure: {
//       base: "Pa",
//       units: {
//         Pa: 1, kPa: 1000, MPa: 1e6, bar: 1e5,
//         atm: 101325, psi: 6894.76, torr: 133.322
//       }
//     }
//   };

//   // Map unit => category for "Most Common" inputs
//   const unitToCategory = {
//     cm: "length",
//     m: "length",
//     ft: "length",
//     kg: "mass",
//     lb: "mass",
//     oz: "mass",
//     C: "temperature",
//     F: "temperature",
//     K: "temperature",
//     L: "volume",
//     mL: "volume",
//     m3: "volume",
//   };

//   function updateFields(category, fromUnit, value) {
//     const group = document.querySelector(`.unit-group[data-category="${category}"]`);
//     if (!group) return;
//     const inputs = group.querySelectorAll("input");

//     if (category === "temperature") {
//       let baseValue = converters.temperature.units[fromUnit](parseFloat(value));
//       inputs.forEach(input => {
//         if (input.dataset.unit !== fromUnit) {
//           input.value = isNaN(baseValue) ? "" : 
//             converters.temperature.fromBase[input.dataset.unit](baseValue).toFixed(4);
//         }
//       });
//     } else {
//       let baseValue = parseFloat(value) * converters[category].units[fromUnit];
//       inputs.forEach(input => {
//         if (input.dataset.unit !== fromUnit) {
//           input.value = isNaN(baseValue) ? "" :
//             (baseValue / converters[category].units[input.dataset.unit]).toFixed(6);
//         }
//       });
//     }
//   }

//   // Sync Most Common inputs with their counterparts in categories
//   function syncCommonToCategory(unit, val) {
//     const category = unitToCategory[unit];
//     if (!category) return;

//     // Update category inputs from this value
//     updateFields(category, unit, val);

//     // Also update Most Common inputs that match same unit in case changed programmatically
//     document.querySelectorAll(`.unit-group[data-category="common"] input[data-unit="${unit}"]`)
//       .forEach(input => {
//         if (input.value !== val) input.value = val;
//       });
//   }

//   // When category inputs change, update others
//   function onCategoryInputChange(e) {
//     let input = e.target;
//     let category = input.closest(".unit-group").dataset.category;
//     let unit = input.dataset.unit;
//     let val = input.value;
//     if (val === "") return;

//     updateFields(category, unit, val);

//     // Also sync with Most Common if this unit exists there
//     if (category !== "common") {
//       // Find all common inputs of same unit and update them
//       document.querySelectorAll(`.unit-group[data-category="common"] input[data-unit="${unit}"]`)
//         .forEach(commonInput => {
//           if (commonInput.value !== val) commonInput.value = val;
//         });
//     }
//   }

//   // When common inputs change, update category & common inputs
//   function onCommonInputChange(e) {
//     let input = e.target;
//     let unit = input.dataset.unit;
//     let val = input.value;
//     if (val === "") return;

//     syncCommonToCategory(unit, val);
//   }

//   // Attach event listeners
//   document.querySelectorAll(".unit-group").forEach(group => {
//     if (group.dataset.category === "common") {
//       group.querySelectorAll("input").forEach(input => {
//         input.addEventListener("input", onCommonInputChange);
//       });
//     } else {
//       group.querySelectorAll("input").forEach(input => {
//         input.addEventListener("input", onCategoryInputChange);
//       });
//     }
//   });
// });

