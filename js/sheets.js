// Thin wrapper around the Google Sheets gviz endpoint.
// Returns rows as arrays of strings. Designed to be the single
// data-access seam so it can be swapped for a SQL fetcher later.

import { CONFIG } from "./config.js";

// In-memory cache of fetched tabs, keyed by tab name. Cleared on
// page reload — keeps repeat lookups within a session cheap (e.g.
// the Profiles tab is needed by both the summary card and the
// related-profiles card on each selection). When the SQL backend
// lands, this whole module gets swapped and the cache goes with it.
const tabCache = new Map();

/**
 * Fetch a sheet tab as a 2D array of strings.
 * Uses the public gviz CSV endpoint, which only works if the sheet
 * is shared as "Anyone with the link – Viewer".
 *
 * Results are memoized for the lifetime of the page. Pass
 * `{ refresh: true }` to bypass and re-fetch. Pass `{ sheetId }` to
 * read from a workbook other than the primary one.
 *
 * @param {string} tabName  Exact tab (sheet) name in the workbook
 * @param {{ refresh?: boolean, sheetId?: string }} [opts]
 * @returns {Promise<string[][]>}
 */
export async function fetchSheetRows(tabName, opts = {}) {
  const sheetId = opts.sheetId || CONFIG.sheetId;
  const cacheKey = `${sheetId}|${tabName}`;

  if (!opts.refresh && tabCache.has(cacheKey)) {
    return tabCache.get(cacheKey);
  }

  const url =
    `https://docs.google.com/spreadsheets/d/${sheetId}` +
    `/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;

  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) {
    throw new Error(
      `Sheet fetch failed (${res.status}). ` +
        `Confirm the sheet is shared as "Anyone with the link – Viewer" ` +
        `and that the "${tabName}" tab exists.`
    );
  }
  const csv = await res.text();
  const rows = parseCsv(csv);
  tabCache.set(cacheKey, rows);
  return rows;
}

/**
 * Look up a profile in the Profiles tab by ProfileID (column A) and
 * return the summary fields the Profile Summary card needs.
 *
 * Primary tab — Profiles:
 *   A (0)  ProfileID
 *   C (2)  OrgName
 *   J (9)  Address1
 *
 * Secondary tab — dbo_member (external workbook):
 *   A (0)  ProfileID
 *   C (2)  MemberSince
 *
 * Returns null if the Profiles row isn't found. memberSince comes
 * back as a formatted string ("Jan 15, 2020"), or "" if missing /
 * unparseable / the dbo_member lookup failed.
 *
 * @param {string} profileId
 * @returns {Promise<{
 *   id: string,
 *   orgName: string,
 *   address1: string,
 *   memberSince: string,
 * } | null>}
 */
export async function fetchProfileSummary(profileId) {
  const rows = await fetchSheetRows(CONFIG.tabs.profiles);
  if (!rows.length) return null;

  // Auto-skip a header row if column A doesn't match the requested ID
  // but looks like a header label.
  const first = rows[0];
  const looksLikeHeader =
    first.length && /id|profile/i.test((first[0] || "").trim());
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;

  const wanted = String(profileId).trim().toLowerCase();
  const row = dataRows.find(
    (r) => (r[0] || "").trim().toLowerCase() === wanted
  );
  if (!row) return null;

  // Secondary lookup — dbo_member for the MemberSince date. Run in
  // parallel with the (already-cached) Profiles fetch above; if it
  // fails (sharing, missing tab) we degrade gracefully and leave
  // memberSince blank rather than failing the whole card.
  let memberSince = "";
  try {
    memberSince = await lookupMemberSince(profileId);
  } catch (err) {
    console.warn("dbo_member lookup failed:", err);
  }

  return {
    id: (row[0] || "").trim(),
    orgName: (row[2] || "").trim(),
    address1: (row[9] || "").trim(),
    memberSince,
  };
}

/**
 * Find ProfileID in dbo_member col A and return col C (MemberSince)
 * formatted as a short date string, or "" if not found / unparseable.
 */
async function lookupMemberSince(profileId) {
  const raw = await lookupMemberSinceRaw(profileId);
  if (!raw) return "";
  const d = parseSheetDate(raw);
  if (!d) return raw; // fall back to raw text if it didn't parse
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Internal: get the raw MemberSince cell string for profileId, or ""
 * if not found. Reused by both the formatted lookup and the public
 * Date-returning accessor below.
 */
async function lookupMemberSinceRaw(profileId) {
  const src = CONFIG.external.member;
  const rows = await fetchSheetRows(src.tabName, { sheetId: src.sheetId });
  if (!rows.length) return "";

  const header = rows[0] || [];
  const hasHeader =
    header.length && /id|profile/i.test((header[0] || "").trim());
  const data = hasHeader ? rows.slice(1) : rows;

  const wanted = String(profileId).trim().toLowerCase();
  const row = data.find((r) => (r[0] || "").trim().toLowerCase() === wanted);
  if (!row) return "";

  return (row[2] || "").trim();
}

/**
 * Public accessor — returns the parsed MemberSince Date for a profile,
 * or null if missing / unparseable. Used by the Metrics card to
 * compute tenure (years & months from today).
 *
 * @param {string} profileId
 * @returns {Promise<Date | null>}
 */
export async function fetchMemberSince(profileId) {
  const raw = await lookupMemberSinceRaw(profileId);
  if (!raw) return null;
  return parseSheetDate(raw);
}

/**
 * For a given ProfileID, find all related profiles via the
 * dbo_ProfileRelations join table, then hydrate names + email from
 * the Profiles tab.
 *
 * Step 1 — dbo_ProfileRelations:
 *   B (1)  ProfileID         (the "from" side; match against profileId)
 *   C (2)  RelProfileID      (the "to" side; collected into RelatedProfileIDList)
 *
 * Step 2 — Profiles:
 *   A (0)   ProfileID
 *   X (23)  Email
 *   AD (29) ReportName  (display name for the related-profile tile)
 *
 * @param {string} profileId
 * @returns {Promise<Array<{id: string, reportName: string, email: string}>>}
 */
export async function fetchRelatedProfiles(profileId) {
  const relRows = await fetchSheetRows(CONFIG.tabs.profileRelations);
  if (!relRows.length) return [];

  // Strip a header row if column B looks like a header label.
  const relHeader = relRows[0] || [];
  const relHasHeader =
    relHeader.length >= 2 &&
    /profile/i.test((relHeader[1] || "").trim()) &&
    /rel/i.test((relHeader[2] || "").trim());
  const relData = relHasHeader ? relRows.slice(1) : relRows;

  const wanted = String(profileId).trim().toLowerCase();

  // Step 1: collect RelatedProfileIDList (SQL would build this as a
  // comma-separated IN-clause; in JS we keep it as an array and join
  // only for the conceptual mapping below).
  const RelatedProfileIDList = relData
    .filter((r) => (r[1] || "").trim().toLowerCase() === wanted)
    .map((r) => (r[2] || "").trim())
    .filter(Boolean);

  if (RelatedProfileIDList.length === 0) return [];

  const relatedSet = new Set(
    RelatedProfileIDList.map((id) => id.toLowerCase())
  );

  // Step 2: hydrate from Profiles. Reuse the same header heuristic
  // as fetchProfileSummary.
  const profileRows = await fetchSheetRows(CONFIG.tabs.profiles);
  if (!profileRows.length) return [];

  const profHeader = profileRows[0] || [];
  const profHasHeader =
    profHeader.length && /id|profile/i.test((profHeader[0] || "").trim());
  const profData = profHasHeader ? profileRows.slice(1) : profileRows;

  const matches = profData
    .filter((r) => relatedSet.has((r[0] || "").trim().toLowerCase()))
    .map((r) => ({
      id: (r[0] || "").trim(),
      reportName: (r[29] || "").trim(), // column AD
      email: (r[23] || "").trim(),      // column X
    }));

  // Preserve the order in which related IDs were declared in the
  // relations tab so the grid is stable / explainable.
  const orderIndex = new Map(
    RelatedProfileIDList.map((id, i) => [id.toLowerCase(), i])
  );
  matches.sort(
    (a, b) =>
      (orderIndex.get(a.id.toLowerCase()) ?? 0) -
      (orderIndex.get(b.id.toLowerCase()) ?? 0)
  );

  return matches;
}

/**
 * For a given ProfileID, find all invoices that belong to the profile
 * and return their line items.
 *
 * Returns invoices grouped by InvoiceNum, each with the invoice
 * date, a parsed year (for filtering/aggregation), and a computed
 * total of its line items' amounts.
 *
 * Step 1 — dbo_invoice (external workbook):
 *   A (0)  InvoiceNum
 *   B (1)  InvoiceDate
 *   D (3)  ProfileID  (match against profileId)
 *
 * Step 2 — dbo_InvoiceLineItem (external workbook):
 *   B (1)  InvoiceNum (filter to those in InvoiceNumbersList)
 *   C (2)  Item
 *   D (3)  ItemNum
 *   I (8)  Description
 *   J (9)  Amount
 *
 * Step 3 — db_RevenueItems (external workbook):
 *   A (0)  ItemNum  (lookup by line-item's ItemNum)
 *   J (9)  DuesType ("1" → "Dues", else "Non-Dues")
 *
 * @param {string} profileId
 * @returns {Promise<Array<{
 *   invoiceNum: string,
 *   invoiceDate: string,
 *   year: number | null,
 *   total: number,
 *   lineItems: Array<{
 *     item: string, itemNum: string, description: string,
 *     amount: string, amountValue: number, duesLabel: string
 *   }>
 * }>>}
 */
export async function fetchPaidInvoices(profileId) {
  const invSrc = CONFIG.external.invoice;
  const liSrc = CONFIG.external.invoiceLineItem;

  // Step 1: collect InvoiceNumbersList from dbo_invoice.
  const invRows = await fetchSheetRows(invSrc.tabName, {
    sheetId: invSrc.sheetId,
  });
  if (!invRows.length) return [];

  // Header-row heuristic: col A reads "InvoiceNum"-ish or col D reads "ProfileID"-ish.
  const invHeader = invRows[0] || [];
  const invHasHeader =
    invHeader.length &&
    (/invoice/i.test((invHeader[0] || "").trim()) ||
      /profile/i.test((invHeader[3] || "").trim()));
  const invData = invHasHeader ? invRows.slice(1) : invRows;

  const wanted = String(profileId).trim().toLowerCase();

  // Collect the InvoiceNumbersList (SQL would build a comma-joined
  // IN-clause; here we keep an array of numbers plus a Map(num→date)
  // so the date can be attached to each group later).
  const InvoiceNumbersList = [];
  const dateByInvoice = new Map();
  for (const r of invData) {
    if ((r[3] || "").trim().toLowerCase() !== wanted) continue;
    const num = (r[0] || "").trim();
    if (!num) continue;
    InvoiceNumbersList.push(num);
    dateByInvoice.set(num.toLowerCase(), (r[1] || "").trim()); // col B
  }

  if (InvoiceNumbersList.length === 0) return [];

  const invoiceSet = new Set(
    InvoiceNumbersList.map((n) => n.toLowerCase())
  );

  // Step 2: pull line items from dbo_InvoiceLineItem.
  const liRows = await fetchSheetRows(liSrc.tabName, {
    sheetId: liSrc.sheetId,
  });
  if (!liRows.length) return [];

  const liHeader = liRows[0] || [];
  const liHasHeader =
    liHeader.length &&
    /invoice/i.test((liHeader[1] || "").trim());
  const liData = liHasHeader ? liRows.slice(1) : liRows;

  const lineItems = liData
    .filter((r) => invoiceSet.has((r[1] || "").trim().toLowerCase()))
    .map((r) => {
      const amount = (r[9] || "").trim();
      return {
        invoiceNum: (r[1] || "").trim(),   // col B
        item: (r[2] || "").trim(),         // col C
        itemNum: (r[3] || "").trim(),      // col D
        description: (r[8] || "").trim(),  // col I
        amount,                            // col J (raw)
        amountValue: parseAmount(amount),  // numeric for summing
      };
    });

  if (lineItems.length === 0) return [];

  // Step 3: hydrate dues type from db_RevenueItems. Fetched once and
  // collapsed into a Map(itemNum → DuesType) so the per-row lookup
  // is constant-time.
  const riSrc = CONFIG.external.revenueItem;
  let duesByItemNum = new Map();
  try {
    const riRows = await fetchSheetRows(riSrc.tabName, {
      sheetId: riSrc.sheetId,
    });
    if (riRows.length) {
      const riHeader = riRows[0] || [];
      const riHasHeader =
        riHeader.length && /item/i.test((riHeader[0] || "").trim());
      const riData = riHasHeader ? riRows.slice(1) : riRows;
      duesByItemNum = new Map(
        riData.map((r) => [
          (r[0] || "").trim().toLowerCase(), // col A — ItemNum
          (r[9] || "").trim(),                // col J — DuesType
        ])
      );
    }
  } catch (err) {
    // Don't fail the whole card if the revenue-items lookup is
    // unavailable — fall through with empty dues labels.
    console.warn("db_RevenueItems lookup failed:", err);
  }

  for (const li of lineItems) {
    const raw = (duesByItemNum.get(li.itemNum.toLowerCase()) || "").trim();
    // Spec: "1" → Dues, anything else (including unknown) → Non-Dues.
    li.duesLabel = raw === "1" ? "Dues" : "Non-Dues";
  }

  // Group by InvoiceNum. Preserve the order in which invoices were
  // declared in dbo_invoice so the rendering is stable.
  /** @type {Map<string, {invoiceNum: string, invoiceDate: string, invoiceDateValue: Date|null, year: number|null, total: number, lineItems: any[]}>} */
  const groupsByNum = new Map();
  for (const num of InvoiceNumbersList) {
    const rawDate = dateByInvoice.get(num.toLowerCase()) || "";
    const parsed = parseSheetDate(rawDate);
    groupsByNum.set(num.toLowerCase(), {
      invoiceNum: num,
      invoiceDate: rawDate,
      invoiceDateValue: parsed || null,
      year: parsed ? parsed.getFullYear() : null,
      total: 0,
      lineItems: [],
    });
  }

  for (const li of lineItems) {
    const key = li.invoiceNum.toLowerCase();
    let group = groupsByNum.get(key);
    if (!group) {
      // Line item references an invoice we didn't see in dbo_invoice
      // (shouldn't happen given the filter above, but be defensive).
      group = {
        invoiceNum: li.invoiceNum,
        invoiceDate: "",
        total: 0,
        lineItems: [],
      };
      groupsByNum.set(key, group);
    }
    // Drop invoiceNum from the line item — it lives on the group now.
    const { invoiceNum: _drop, ...rest } = li;
    group.lineItems.push(rest);
    group.total += Number.isFinite(li.amountValue) ? li.amountValue : 0;
  }

  // Return only groups that actually have line items, in declared order.
  return [...groupsByNum.values()].filter((g) => g.lineItems.length > 0);
}

/**
 * Strip currency symbols / commas and parse to a Number. Returns
 * NaN if the string isn't a parseable number.
 */
function parseAmount(raw) {
  const s = String(raw || "").trim();
  if (!s) return NaN;
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  return Number(cleaned);
}

/**
 * Try to parse a sheet cell into a Date.
 *   - ISO / RFC 2822 strings (gviz default for typed cells)
 *   - U.S. m/d/yyyy plain text
 *   - Excel serial numbers (days since 1899-12-30)
 * Returns null if nothing parses.
 */
function parseSheetDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const ms = (n - 25569) * 86400 * 1000;
    const d2 = new Date(ms);
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

/**
 * Aggregate paid invoices into a Dues / Non-Dues breakdown by
 * invoice-date year. Drives the Financial Summary card. Returns
 * one entry per year that has any data, sorted ascending.
 *
 * @param {string} profileId
 * @returns {Promise<Array<{year: number, dues: number, nonDues: number, total: number}>>}
 */
export async function fetchFinancialSummary(profileId) {
  const groups = await fetchPaidInvoices(profileId);
  if (!groups.length) return [];

  /** @type {Map<number, {year: number, dues: number, nonDues: number}>} */
  const byYear = new Map();

  for (const g of groups) {
    // Use the pre-parsed year stamped onto the group by
    // fetchPaidInvoices — avoids parsing the date string twice.
    if (g.year == null) continue;
    const year = g.year;
    let agg = byYear.get(year);
    if (!agg) {
      agg = { year, dues: 0, nonDues: 0 };
      byYear.set(year, agg);
    }
    for (const li of g.lineItems) {
      const amt = Number.isFinite(li.amountValue) ? li.amountValue : 0;
      if (li.duesLabel === "Dues") agg.dues += amt;
      else agg.nonDues += amt;
    }
  }

  return [...byYear.values()]
    .sort((a, b) => a.year - b.year)
    .map((o) => ({ ...o, total: o.dues + o.nonDues }));
}

/**
 * Minimal RFC-4180-ish CSV parser. Handles quoted fields, embedded
 * commas, doubled-up quotes, and \r\n line endings. Good enough for
 * Google Sheets export output.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore — handled by the \n branch
    } else {
      field += c;
    }
  }

  // Trailing field / row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
