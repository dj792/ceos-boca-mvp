// Related Profiles card.
//
// Given a selected ProfileID, looks up rows in dbo_ProfileRelations
// (col B match) → builds RelatedProfileIDList from col C → hydrates
// each from the Profiles tab (ReportName AD, Email X) and renders a
// grid of tiles.

import { fetchRelatedProfiles } from "../sheets.js";

/**
 * @param {HTMLElement} mountEl  The card's .card-body div
 * @returns {{ load: (id: string) => Promise<void>, clear: () => void }}
 */
export function mountRelatedProfiles(mountEl) {
  const cardEl = mountEl.closest(".card");

  mountEl.innerHTML = `
    <div class="related-grid" role="list"></div>
    <p class="related-status" role="status" aria-live="polite" hidden></p>
  `;

  const grid = mountEl.querySelector(".related-grid");
  const statusEl = mountEl.querySelector(".related-status");

  let loadToken = 0;

  const setStatus = (msg, isError = false) => {
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.classList.remove("related-status--error");
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle("related-status--error", isError);
  };

  const renderTiles = (items) => {
    if (!items.length) {
      grid.innerHTML = "";
      return;
    }
    grid.innerHTML = items
      .map((p) => {
        const name = (p.reportName || "").trim() || "—";
        const initials = makeInitials(name);
        return `
          <div class="related-tile" role="listitem">
            <div class="related-tile__avatar" aria-hidden="true">${escapeHtml(initials)}</div>
            <div class="related-tile__body">
              <div class="related-tile__name">${escapeHtml(name)}</div>
              ${
                p.email
                  ? `<a class="related-tile__email" href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>`
                  : `<div class="related-tile__email related-tile__email--empty">No email on file</div>`
              }
            </div>
          </div>`;
      })
      .join("");
  };

  function clear() {
    if (cardEl) {
      cardEl.hidden = true;
      cardEl.classList.remove("card--loading");
    }
    grid.innerHTML = "";
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
    grid.innerHTML = "";
    setStatus("Loading related profiles…");

    try {
      const items = await fetchRelatedProfiles(profileId);
      if (myToken !== loadToken) return;

      if (items.length === 0) {
        setStatus("No related profiles found.");
        return;
      }
      renderTiles(items);
      setStatus("");
    } catch (err) {
      if (myToken !== loadToken) return;
      setStatus(err.message || "Failed to load related profiles.", true);
    } finally {
      if (myToken === loadToken && cardEl) {
        cardEl.classList.remove("card--loading");
      }
    }
  }

  return { load, clear };
}

// ---------- Helpers ----------

function makeInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
