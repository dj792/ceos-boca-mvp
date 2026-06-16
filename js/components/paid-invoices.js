// Paid Invoices card.
//
// For the selected ProfileID, joins dbo_invoice → dbo_InvoiceLineItem
// → db_RevenueItems (across three external workbooks) and renders a
// flat, sortable line-item table:
//   Invoice Date | Description | Amount | Type
//
// Hovering the Description cell opens a custom tooltip with the
// associated Invoice # and Item code: "Invoice #{num} {item}". The
// tooltip is a singleton on document.body so it can escape the table's
// scroll container.
//
// Supports a year filter (see setYearFilter) so the Financial Summary
// card can drill into a single year. Click any column header to sort;
// default sort is Invoice Date ascending (oldest → newest).

import { fetchPaidInvoices } from "../sheets.js";

/**
 * Column metadata for headers + comparators.
 * `key` is what we sort by; `className` styles the cell.
 */
const HEADER_DEFS = [
  { key: "date",        label: "Invoice Date", className: "invoices__col-date" },
  { key: "description", label: "Description",  className: "invoices__col-desc" },
  { key: "amount",      label: "Amount",       className: "invoices__col-amt" },
  { key: "type",        label: "Type",         className: "invoices__col-type" },
];

const COMPARATORS = {
  date: (a, b) =>
    (a.invoiceDateValue ? a.invoiceDateValue.getTime() : -Infinity) -
    (b.invoiceDateValue ? b.invoiceDateValue.getTime() : -Infinity),
  description: (a, b) => (a.description || "").localeCompare(b.description || ""),
  amount: (a, b) => (a.amountValue ?? 0) - (b.amountValue ?? 0),
  type: (a, b) => (a.duesLabel || "").localeCompare(b.duesLabel || ""),
};

/**
 * @param {HTMLElement} mountEl  The card's .card-body div
 * @returns {{
 *   load: (id: string) => Promise<void>,
 *   clear: () => void,
 *   setYearFilter: (year: number | null) => void,
 * }}
 */
export function mountPaidInvoices(mountEl) {
  const cardEl = mountEl.closest(".card");
  const headerMain = cardEl?.querySelector(".card-header__main");

  mountEl.innerHTML = `
    <div class="invoices-wrap" hidden>
      <table class="invoices"></table>
    </div>
    <p class="invoices-status" role="status" aria-live="polite" hidden></p>
  `;

  // Filter chip lives in the card header alongside the title.
  const chip = buildFilterChip(() => setYearFilter(null));
  if (headerMain) headerMain.appendChild(chip.root);

  const tableEl = mountEl.querySelector(".invoices");
  const wrap = mountEl.querySelector(".invoices-wrap");
  const statusEl = mountEl.querySelector(".invoices-status");

  let loadToken = 0;
  /** @type {Array<{year: number|null, invoiceDateValue: Date|null, lineItems: any[], invoiceNum: string, invoiceDate: string}> | null} */
  let cachedGroups = null;
  /** @type {number | null} */
  let yearFilter = null;
  // Sort state — default: oldest invoice first.
  let sortKey = "date";
  let sortDir = "asc"; // "asc" | "desc"

  // ---------- Status ----------
  const setStatus = (msg, isError = false) => {
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.classList.remove("invoices-status--error");
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle("invoices-status--error", isError);
  };

  // ---------- Tooltip (Item description on hover) ----------
  const tooltipEl = ensureTooltipSingleton();
  let tooltipTarget = null;

  function showTooltip(target) {
    const text = target.dataset.tooltip;
    if (!text) return;
    tooltipEl.textContent = text;
    const rect = target.getBoundingClientRect();
    tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
    tooltipEl.style.top = `${rect.top}px`;
    tooltipEl.classList.add("app-tooltip--visible");
  }
  function hideTooltip() {
    tooltipTarget = null;
    tooltipEl.classList.remove("app-tooltip--visible");
  }

  tableEl.addEventListener("mouseover", (e) => {
    const t = e.target.closest("[data-tooltip]");
    if (t && t !== tooltipTarget) {
      tooltipTarget = t;
      showTooltip(t);
    }
  });
  tableEl.addEventListener("mouseout", (e) => {
    if (!tooltipTarget) return;
    // Ignore moves into descendants (e.g. the info icon span).
    if (tooltipTarget.contains(e.relatedTarget)) return;
    hideTooltip();
  });
  tableEl.addEventListener("mouseleave", hideTooltip);

  // ---------- Header click → sort ----------
  // Event delegation so it survives full-table re-renders.
  tableEl.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort-key]");
    if (!th) return;
    const key = th.dataset.sortKey;
    if (!key) return;
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = "asc";
    }
    if (cachedGroups) renderFiltered();
  });

  // ---------- Render ----------
  function flattenAndSort() {
    if (!cachedGroups) return [];
    const groups =
      yearFilter == null
        ? cachedGroups
        : cachedGroups.filter((g) => g.year === yearFilter);

    const rows = [];
    for (const g of groups) {
      for (const li of g.lineItems) {
        rows.push({
          ...li,
          invoiceNum: g.invoiceNum,
          invoiceDate: g.invoiceDate,
          invoiceDateValue: g.invoiceDateValue,
        });
      }
    }

    const cmp = COMPARATORS[sortKey] || COMPARATORS.date;
    rows.sort((a, b) => (sortDir === "asc" ? cmp(a, b) : cmp(b, a)));
    return rows;
  }

  function renderTable(rows) {
    if (!rows.length) {
      tableEl.innerHTML = "";
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    tableEl.innerHTML = buildHeaderHtml() + buildBodyHtml(rows);
  }

  function renderFiltered() {
    if (!cachedGroups) {
      renderTable([]);
      return;
    }
    const rows = flattenAndSort();
    if (rows.length === 0) {
      renderTable([]);
      setStatus(
        yearFilter == null
          ? "No invoices found for this profile."
          : `No invoices for ${yearFilter}.`
      );
    } else {
      renderTable(rows);
      setStatus("");
    }
  }

  function setYearFilter(year) {
    yearFilter = year == null ? null : Number(year);
    chip.set(yearFilter);
    if (cachedGroups) renderFiltered();
  }

  function clear() {
    if (cardEl) {
      cardEl.hidden = true;
      cardEl.classList.remove("card--loading");
    }
    cachedGroups = null;
    yearFilter = null;
    sortKey = "date";
    sortDir = "asc";
    chip.set(null);
    renderTable([]);
    setStatus("");
    hideTooltip();
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
    renderTable([]);
    setStatus("Loading invoices…");

    try {
      const groups = await fetchPaidInvoices(profileId);
      if (myToken !== loadToken) return;

      cachedGroups = groups;
      renderFiltered();
    } catch (err) {
      if (myToken !== loadToken) return;
      setStatus(err.message || "Failed to load invoices.", true);
    } finally {
      if (myToken === loadToken && cardEl) {
        cardEl.classList.remove("card--loading");
      }
    }
  }

  // ---------- Header markup ----------
  function buildHeaderHtml() {
    const cells = HEADER_DEFS.map((def) => {
      const active = def.key === sortKey;
      const arrow = active ? (sortDir === "asc" ? "▲" : "▼") : "↕";
      const arrowCls = active
        ? "sort-arrow sort-arrow--active"
        : "sort-arrow";
      const ariaSort = active
        ? sortDir === "asc"
          ? "ascending"
          : "descending"
        : "none";
      return `
        <th scope="col" class="${def.className}" data-sort-key="${def.key}" aria-sort="${ariaSort}">
          <button type="button" class="sort-btn">
            <span>${def.label}</span>
            <span class="${arrowCls}" aria-hidden="true">${arrow}</span>
          </button>
        </th>`;
    }).join("");
    return `<thead><tr>${cells}</tr></thead>`;
  }

  function buildBodyHtml(rows) {
    return `<tbody>${rows.map(renderRow).join("")}</tbody>`;
  }

  return { load, clear, setYearFilter };
}

// ---------- Row markup ----------

function renderRow(row) {
  const hasDesc = !!(row.description && row.description.trim());
  const descText = hasDesc
    ? escapeHtml(row.description)
    : "(Missing description)";
  const descClass = hasDesc
    ? "invoices__col-desc"
    : "invoices__col-desc invoices__col-desc--missing";

  // Tooltip shows the originating invoice and item code for context.
  // Same format regardless of whether the description is present.
  const tooltipParts = [];
  if (row.invoiceNum) tooltipParts.push(`Invoice #${row.invoiceNum}`);
  if (row.item) tooltipParts.push(row.item);
  const tooltip = tooltipParts.join(" ");

  const descCell = tooltip
    ? `<td class="${descClass}" data-has-desc="true" data-tooltip="${escapeHtml(tooltip)}">${descText}<span class="info-icon" aria-hidden="true">i</span></td>`
    : `<td class="${descClass}">${descText}</td>`;

  return `
    <tr>
      <td class="invoices__col-date">${formatDate(row.invoiceDate)}</td>
      ${descCell}
      <td class="invoices__col-amt">${formatAmountCell(row.amount, row.amountValue)}</td>
      <td class="invoices__col-type">${renderTypePill(row.duesLabel)}</td>
    </tr>`;
}

// ---------- Tooltip singleton ----------

function ensureTooltipSingleton() {
  let el = document.querySelector(".app-tooltip");
  if (el) return el;
  el = document.createElement("div");
  el.className = "app-tooltip";
  el.setAttribute("role", "tooltip");
  document.body.appendChild(el);
  return el;
}

// ---------- Filter chip in the header ----------

function buildFilterChip(onClear) {
  const root = document.createElement("span");
  root.className = "filter-chip";
  root.hidden = true;
  root.innerHTML = `
    <span class="filter-chip__label">Year</span>
    <span class="filter-chip__value"></span>
    <button type="button" class="filter-chip__clear" aria-label="Clear year filter">×</button>
  `;
  const valueEl = root.querySelector(".filter-chip__value");
  const clearBtn = root.querySelector(".filter-chip__clear");

  // Clicks inside the chip must not bubble up to the header's
  // collapse/expand handler.
  root.addEventListener("click", (e) => e.stopPropagation());
  root.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
  });
  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClear();
  });

  return {
    root,
    set(year) {
      if (year == null) {
        root.hidden = true;
        valueEl.textContent = "";
      } else {
        root.hidden = false;
        valueEl.textContent = String(year);
      }
    },
  };
}

// ---------- Helpers ----------

function renderTypePill(label) {
  if (!label) return "—";
  const modifier = label === "Dues" ? "dues" : "nondues";
  return `<span class="type-pill type-pill--${modifier}">${escapeHtml(label)}</span>`;
}

/**
 * Amount cell. Prefers the pre-parsed numeric amountValue (so rounded
 * display matches the sort order); falls back to a re-parse of the raw
 * string, and finally to the raw string itself if it isn't numeric.
 */
function formatAmountCell(raw, parsedValue) {
  if (Number.isFinite(parsedValue)) return formatCurrency(parsedValue);
  const s = String(raw || "").trim();
  if (!s) return "—";
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return escapeHtml(s);
  return formatCurrency(n);
}

/** USD, rounded to the nearest whole dollar (no cents). */
function formatCurrency(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Try a few common interpretations of the sheet's date value:
 *   - ISO / RFC 2822 strings (gviz CSV defaults to these for typed cells)
 *   - U.S. m/d/yyyy plain text
 *   - Excel-style serial numbers as a last resort
 * Falls back to the raw string when nothing parses.
 */
function formatDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return "—";

  const d = new Date(s);
  if (!isNaN(d.getTime())) return renderDate(d);

  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const ms = (n - 25569) * 86400 * 1000;
    const d2 = new Date(ms);
    if (!isNaN(d2.getTime())) return renderDate(d2);
  }

  return escapeHtml(s);
}

function renderDate(d) {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Natural-order string compare so e.g. INV-2 sorts before INV-10.
 */
function natCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
