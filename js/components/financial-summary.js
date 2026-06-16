// Financial Summary card.
//
// Stacked-bar chart of Dues vs. Non-Dues by invoice-date year, plus
// the same data as a small table below the chart. Pulls from
// fetchFinancialSummary in sheets.js (which itself reuses the cached
// Paid Invoices fetch).
//
// Pure CSS bars — no chart library — to honor the "no external libs"
// rule in CLAUDE.md and keep the Apple Stocks visual feel.

import { fetchFinancialSummary } from "../sheets.js";

/**
 * @param {HTMLElement} mountEl  The card's .card-body div
 * @param {(year: number) => void} [onYearSelect]  Optional drill-down
 *   callback fired when the user clicks a year column in the chart.
 * @returns {{ load: (id: string) => Promise<void>, clear: () => void }}
 */
export function mountFinancialSummary(mountEl, onYearSelect) {
  const cardEl = mountEl.closest(".card");

  mountEl.innerHTML = `
    <div class="fs">
      <div class="fs-legend" aria-hidden="true">
        <span class="fs-legend__item">
          <span class="fs-legend__swatch fs-legend__swatch--dues"></span>
          <span class="fs-legend__label">Dues</span>
        </span>
        <span class="fs-legend__item">
          <span class="fs-legend__swatch fs-legend__swatch--nondues"></span>
          <span class="fs-legend__label">Non-Dues</span>
        </span>
      </div>
      <div class="fs-chart" role="img" aria-label="Dues and Non-Dues totals by year"></div>
    </div>
    <p class="fs-status" role="status" aria-live="polite" hidden></p>
  `;

  const chartEl = mountEl.querySelector(".fs-chart");
  const fsRoot = mountEl.querySelector(".fs");
  const statusEl = mountEl.querySelector(".fs-status");

  let loadToken = 0;

  const setStatus = (msg, isError = false) => {
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.classList.remove("fs-status--error");
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle("fs-status--error", isError);
  };

  const setData = (rows) => {
    if (!rows.length) {
      fsRoot.hidden = true;
      chartEl.innerHTML = "";
      return;
    }
    fsRoot.hidden = false;
    const interactive = typeof onYearSelect === "function";
    chartEl.innerHTML = renderChart(rows, interactive);
  };

  // Delegated click + keyboard handler for any element tagged with
  // [data-year]. Keeps individual rows / columns light.
  const handleActivate = (e) => {
    if (typeof onYearSelect !== "function") return;
    const target = e.target.closest("[data-year]");
    if (!target) return;
    const y = Number(target.dataset.year);
    if (!Number.isFinite(y)) return;
    if (e.type === "keydown") {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
    }
    onYearSelect(y);
  };
  mountEl.addEventListener("click", handleActivate);
  mountEl.addEventListener("keydown", handleActivate);

  function clear() {
    if (cardEl) {
      cardEl.hidden = true;
      cardEl.classList.remove("card--loading");
    }
    setData([]);
    setStatus("");
  }

  async function load(profileId) {
    if (!profileId) {
      clear();
      return;
    }

    const myToken = ++loadToken;
    if (cardEl) {
      cardEl.hidden = false;
      cardEl.classList.add("card--loading");
    }
    setData([]);
    setStatus("Loading financial summary…");

    try {
      const rows = await fetchFinancialSummary(profileId);
      if (myToken !== loadToken) return;

      if (rows.length === 0) {
        setStatus("No dated invoices to summarize.");
        return;
      }
      setData(rows);
      setStatus("");
    } catch (err) {
      if (myToken !== loadToken) return;
      setStatus(err.message || "Failed to load financial summary.", true);
    } finally {
      if (myToken === loadToken && cardEl) {
        cardEl.classList.remove("card--loading");
      }
    }
  }

  return { load, clear };
}

// ---------- Rendering ----------

function renderChart(rows, interactive) {
  const maxTotal = Math.max(...rows.map((r) => r.total), 0);

  // Each column = one year. Bar fills its column to a fraction of
  // full height matching its share of the max total. Within each
  // bar, the two segments split the bar height by their proportions.
  // When interactive, the whole column is a button (role + tabindex)
  // and dispatches via the delegated handler in mountFinancialSummary.
  const cols = rows
    .map((r) => {
      const barRatio = maxTotal > 0 ? r.total / maxTotal : 0;
      const duesPct = r.total > 0 ? (r.dues / r.total) * 100 : 0;
      const nonDuesPct = r.total > 0 ? (r.nonDues / r.total) * 100 : 0;
      const interactiveAttrs = interactive
        ? `data-year="${r.year}" role="button" tabindex="0" aria-label="Show ${r.year} invoices"`
        : "";
      const interactiveClass = interactive ? " fs-col--interactive" : "";
      return `
        <div class="fs-col${interactiveClass}" ${interactiveAttrs}>
          <div class="fs-col__top">${formatShort(r.total)}</div>
          <div class="fs-col__bar-area">
            <div class="fs-col__bar" style="height: ${(barRatio * 100).toFixed(2)}%;">
              <div class="fs-col__seg fs-col__seg--nondues" style="height: ${nonDuesPct.toFixed(2)}%;" title="Non-Dues: ${formatCurrency(r.nonDues)}"></div>
              <div class="fs-col__seg fs-col__seg--dues" style="height: ${duesPct.toFixed(2)}%;" title="Dues: ${formatCurrency(r.dues)}"></div>
            </div>
          </div>
          <div class="fs-col__label">${r.year}</div>
        </div>`;
    })
    .join("");

  return `<div class="fs-chart__plot">${cols}</div>`;
}


// ---------- Helpers ----------

function formatCurrency(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Compact USD label for use above the chart bars
 * (e.g. $12.3k, $1.05M) so long totals don't overflow the bar width.
 */
function formatShort(n) {
  if (!Number.isFinite(n) || n === 0) return "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(2)}k`;
  return `$${n.toFixed(0)}`;
}
