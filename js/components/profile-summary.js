// Profile Summary card.
//
// Shows standard profile info (org name, address, ...) for the
// currently selected member. Hidden until a profile is loaded.
//
// Owns its own data fetch via sheets.js — the host (app.js) just
// calls `.load(profileId)` / `.clear()` on selection changes.

import { fetchProfileSummary } from "../sheets.js";

/**
 * @param {HTMLElement} mountEl  The card's .card-body div
 * @returns {{ load: (id: string) => Promise<void>, clear: () => void }}
 */
export function mountProfileSummary(mountEl) {
  // The whole card lives in index.html; we only own the body slot here.
  // We also need to toggle the surrounding <article> visibility, so the
  // card element is looked up from the mount's parent.
  const cardEl = mountEl.closest(".card");

  mountEl.innerHTML = `
    <dl class="summary-list">
      <div class="summary-row">
        <dt class="summary-label">Organization</dt>
        <dd class="summary-value" data-field="orgName">—</dd>
      </div>
      <div class="summary-row">
        <dt class="summary-label">Address</dt>
        <dd class="summary-value" data-field="address1">—</dd>
      </div>
      <div class="summary-row">
        <dt class="summary-label">Member Since</dt>
        <dd class="summary-value" data-field="memberSince">—</dd>
      </div>
    </dl>
    <p class="summary-status" role="status" aria-live="polite" hidden></p>
  `;

  const fields = {
    orgName: mountEl.querySelector('[data-field="orgName"]'),
    address1: mountEl.querySelector('[data-field="address1"]'),
    memberSince: mountEl.querySelector('[data-field="memberSince"]'),
  };
  const statusEl = mountEl.querySelector(".summary-status");

  let loadToken = 0;

  const setStatus = (msg, isError = false) => {
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.classList.remove("summary-status--error");
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle("summary-status--error", isError);
  };

  const setFields = (data) => {
    fields.orgName.textContent = data?.orgName || "—";
    fields.address1.textContent = data?.address1 || "—";
    fields.memberSince.textContent = data?.memberSince || "—";
  };

  function clear() {
    if (cardEl) {
      cardEl.hidden = true;
      cardEl.classList.remove("card--loading");
    }
    setFields(null);
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
    setFields(null);
    setStatus("Loading profile…");

    try {
      const data = await fetchProfileSummary(profileId);
      // Bail if a newer load has started in the meantime.
      if (myToken !== loadToken) return;

      if (!data) {
        setStatus(`No profile found for ${profileId}.`, true);
        setFields(null);
        return;
      }
      setFields(data);
      setStatus("");
    } catch (err) {
      if (myToken !== loadToken) return;
      setStatus(err.message || "Failed to load profile.", true);
    } finally {
      // Only the most recent load owns the loading state.
      if (myToken === loadToken && cardEl) {
        cardEl.classList.remove("card--loading");
      }
    }
  }

  return { load, clear };
}
