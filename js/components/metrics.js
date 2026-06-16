// Metrics card.
//
// Five at-a-glance KPI tiles displayed at the top of the profile view:
//   0. Overall Rank     — composite rank (#X of N) + YoY places gained
//   1. Dues Rank        — percentile vs. other members on dues revenue
//   2. Non-Dues Rank    — same idea, for non-dues revenue
//   3. Loyalty          — tenure (years & months) + percentile by tenure
//   4. Profitability    — average margin per dollar spent
//
// ⚠️ EXAMPLE / PARTIAL DATA
// Most values are placeholders chosen to illustrate the visual design.
// Loyalty's tenure is the *real* MemberSince date from dbo_member; the
// rest will be wired to live aggregates once we agree on data sources.

import { fetchMemberSince } from "../sheets.js";

/**
 * @param {HTMLElement} mountEl  The card's .card-body div
 * @returns {{ load: (id: string) => void, clear: () => void }}
 */
export function mountMetrics(mountEl) {
  const cardEl = mountEl.closest(".card");

  // Every tile gets a .metric__sub slot; it's hidden via CSS :empty
  // when there's nothing to show, so adding it everywhere is free.
  mountEl.innerHTML = `
    <div class="metrics-grid">
      <div class="metric" data-kpi="overall-rank">
        <div class="metric__label">Overall Rank</div>
        <div class="metric__value">—</div>
        <div class="metric__sub"></div>
        <div class="metric__delta"></div>
      </div>
      <div class="metric" data-kpi="dues-rank">
        <div class="metric__label">Dues Rank</div>
        <div class="metric__value">—</div>
        <div class="metric__sub"></div>
        <div class="metric__delta"></div>
      </div>
      <div class="metric" data-kpi="nondues-rank">
        <div class="metric__label">Non-Dues Rank</div>
        <div class="metric__value">—</div>
        <div class="metric__sub"></div>
        <div class="metric__delta"></div>
      </div>
      <div class="metric" data-kpi="loyalty">
        <div class="metric__label">Loyalty</div>
        <div class="metric__value">—</div>
        <div class="metric__sub"></div>
        <div class="metric__delta"></div>
      </div>
      <div class="metric" data-kpi="profitability">
        <div class="metric__label">Profitability</div>
        <div class="metric__value">—</div>
        <div class="metric__sub"></div>
        <div class="metric__delta"></div>
      </div>
    </div>
    <p class="metrics-note">Sample metrics — placeholder data while we wire in real aggregates.</p>
  `;

  const tiles = {
    overall: mountEl.querySelector('[data-kpi="overall-rank"]'),
    dues: mountEl.querySelector('[data-kpi="dues-rank"]'),
    nondues: mountEl.querySelector('[data-kpi="nondues-rank"]'),
    loyalty: mountEl.querySelector('[data-kpi="loyalty"]'),
    profit: mountEl.querySelector('[data-kpi="profitability"]'),
  };

  let loadToken = 0;

  function clear() {
    if (cardEl) cardEl.hidden = true;
    for (const t of Object.values(tiles)) {
      t.querySelector(".metric__value").textContent = "—";
      const d = t.querySelector(".metric__delta");
      d.textContent = "";
      d.className = "metric__delta";
      const sub = t.querySelector(".metric__sub");
      if (sub) sub.textContent = "";
    }
  }

  async function load(profileId) {
    if (!profileId) {
      clear();
      return;
    }
    const myToken = ++loadToken;
    if (cardEl) cardEl.hidden = false;

    // 0) Overall Rank — static placeholder (#10 of 1,290, up from #25).
    //    Real source TBD: composite of dues/non-dues/profitability ranking.
    setOverallRankTile(tiles.overall, {
      rank: 10,
      totalMembers: 1290,
      lastYearRank: 25,
    });

    // 1) Dues Rank — placeholder. Real source: sum dues per ProfileID
    //    across dbo_InvoiceLineItem for the period, rank across all
    //    members, compute percentile.
    setStaticTile(tiles.dues, { value: "Bottom 3%" });

    // 2) Non-Dues Rank — placeholder; analogous to Dues for non-dues revenue.
    setStaticTile(tiles.nondues, { value: "Top 1%" });

    // 3) Loyalty — tenure from dbo_member.MemberSince (real). Percentile
    //    remains a placeholder until we wire tenure ranking.
    setLoyaltyTile(tiles.loyalty, null, 18); // value updates below
    try {
      const since = await fetchMemberSince(profileId);
      if (myToken !== loadToken) return;
      const realMonths =
        since instanceof Date ? monthsBetween(since, new Date()) : null;
      setLoyaltyTile(tiles.loyalty, realMonths, 18);
    } catch (err) {
      if (myToken !== loadToken) return;
      console.warn("MemberSince lookup failed:", err);
    }

    // 4) Profitability — placeholder margin metric. Real source TBD:
    //    revenue - cost per profile / total dollars spent.
    setStaticTile(tiles.profit, {
      value: "26%",
      sub: "Average Margin per Dollar Spent",
    });
  }

  return { load, clear };
}

/**
 * Whole months from `start` up to `end`. Treats the day-of-month as
 * an "anniversary": if end's day is earlier than start's day in the
 * current month, the month doesn't count yet.
 */
function monthsBetween(start, end) {
  let m =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) m -= 1;
  return Math.max(0, m);
}

// ---------- Tile renderers ----------

function setOverallRankTile(tileEl, { rank, totalMembers, lastYearRank }) {
  const value = tileEl.querySelector(".metric__value");
  const sub = tileEl.querySelector(".metric__sub");
  const delta = tileEl.querySelector(".metric__delta");

  value.textContent = `#${rank}`;
  sub.textContent = `${rank.toLocaleString()} of ${totalMembers.toLocaleString()}`;

  // Lower rank number is better; YoY improvement = lastYear - thisYear.
  const placesGained = lastYearRank - rank;
  delta.className = "metric__delta";
  if (placesGained > 0) {
    delta.classList.add("metric__delta--up");
    delta.innerHTML = `<span class="metric__delta-arrow">▲</span> ${placesGained} places YoY`;
  } else if (placesGained < 0) {
    delta.classList.add("metric__delta--down");
    delta.innerHTML = `<span class="metric__delta-arrow">▼</span> ${Math.abs(placesGained)} places YoY`;
  } else {
    delta.classList.add("metric__delta--flat");
    delta.innerHTML = `<span class="metric__delta-arrow">–</span> unchanged YoY`;
  }
}

/**
 * Generic static-content tile renderer. Use for placeholder values
 * while we still need them. Any of value/sub/delta can be omitted.
 *
 * @param {HTMLElement} tileEl
 * @param {{ value?: string, sub?: string, delta?: string, deltaTone?: "up"|"down"|"flat"|"neutral" }} opts
 */
function setStaticTile(tileEl, { value, sub, delta, deltaTone } = {}) {
  tileEl.querySelector(".metric__value").textContent = value || "—";

  const subEl = tileEl.querySelector(".metric__sub");
  if (subEl) subEl.textContent = sub || "";

  const deltaEl = tileEl.querySelector(".metric__delta");
  deltaEl.className = "metric__delta";
  if (delta) {
    if (deltaTone) deltaEl.classList.add(`metric__delta--${deltaTone}`);
    deltaEl.innerHTML = delta;
  } else {
    deltaEl.innerHTML = "";
  }
}

function setLoyaltyTile(tileEl, tenureMonths, percentileFromTop) {
  const value = tileEl.querySelector(".metric__value");
  const delta = tileEl.querySelector(".metric__delta");

  if (tenureMonths == null || !Number.isFinite(tenureMonths)) {
    value.textContent = "—";
    delta.textContent = "Member Since unavailable";
    delta.className = "metric__delta metric__delta--flat";
    return;
  }

  const years = Math.floor(tenureMonths / 12);
  const months = tenureMonths % 12;

  const parts = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0 || years === 0) parts.push(`${months}m`);
  value.textContent = parts.join(" ");

  // For loyalty, percentile from the top reflects rank by tenure
  // (older = higher rank). No YoY here — tenure is monotonic.
  delta.className = "metric__delta metric__delta--neutral";
  delta.textContent = `Top ${percentileFromTop}% by tenure`;
}
