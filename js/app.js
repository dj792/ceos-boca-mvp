// App entry point. Wires up cards and brokers the "selected member"
// signal between them. Each card lives in js/components/*.js and
// mounts into its own <article class="card"> in index.html.
//
// Card policy:
//   - Metrics + Financial Summary load immediately on selection.
//   - Profile Summary, Related Profiles, Paid Invoices are click-to-open
//     (collapsible); they only fetch when the user expands their header
//     bar — OR when the user drills in from a year click in Financial
//     Summary (Paid Invoices only).

import { mountLogin } from "./components/login.js";
import { mountMemberSelect } from "./components/member-select.js";
import { mountMetrics } from "./components/metrics.js";
import { mountProfileSummary } from "./components/profile-summary.js";
import { mountFinancialSummary } from "./components/financial-summary.js";
import { mountRelatedProfiles } from "./components/related-profiles.js";
import { mountPaidInvoices } from "./components/paid-invoices.js";
import { makeCollapsible } from "./collapsible.js";

// ---------- Login gate ----------
// Nothing in the app fetches member data until the user signs in.
// On success we tear down the overlay and reveal the app, then boot
// the cards. Auth state is in-memory only (a reload re-prompts).
const overlay = document.getElementById("login-overlay");
const appMain = document.querySelector("main.app");

mountLogin(overlay, () => {
  overlay.remove();
  appMain.hidden = false;
  startApp();
});

function startApp() {
// ---------- Header date (Apple Stocks–style) ----------
const dateEl = document.getElementById("app-date");
if (dateEl) {
  dateEl.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// ---------- Mount points ----------
const selectMount = document.getElementById("member-select-mount");
const metricsMount = document.getElementById("metrics-mount");
const summaryMount = document.getElementById("profile-summary-mount");
const summaryIdPill = document.getElementById("profile-summary-id");
const finSummaryMount = document.getElementById("financial-summary-mount");
const relatedMount = document.getElementById("related-profiles-mount");
const invoicesMount = document.getElementById("paid-invoices-mount");

// ---------- Components ----------
const metrics = mountMetrics(metricsMount);
const profileSummary = mountProfileSummary(summaryMount);
const relatedProfiles = mountRelatedProfiles(relatedMount);
const paidInvoices = mountPaidInvoices(invoicesMount);

// Financial Summary wires its year drill-down through this callback —
// declared up here so it can reach `paidInvoices` and `invoicesCollapsible`.
const financialSummary = mountFinancialSummary(finSummaryMount, (year) => {
  drillIntoYear(year);
});

// ---------- Lazy cards (click-to-open) ----------
const profileCollapsible = makeCollapsible(
  document.getElementById("profile-summary-card"),
  profileSummary
);
const relatedCollapsible = makeCollapsible(
  document.getElementById("related-profiles-card"),
  relatedProfiles
);
const invoicesCollapsible = makeCollapsible(
  document.getElementById("paid-invoices-card"),
  paidInvoices
);

// ---------- Selection plumbing ----------
mountMemberSelect(selectMount, (member) => {
  if (!member) {
    metrics.clear();
    financialSummary.clear();
    profileCollapsible.reset();
    relatedCollapsible.reset();
    invoicesCollapsible.reset();
    return;
  }
  summaryIdPill.textContent = member.id;
  // Eager cards
  metrics.load(member.id);
  financialSummary.load(member.id);
  // Lazy cards — appear collapsed; fetch happens when the user opens
  // the header bar (or drills in from a year click).
  profileCollapsible.armForId(member.id);
  relatedCollapsible.armForId(member.id);
  invoicesCollapsible.armForId(member.id);
});

// ---------- Drill-down: Financial Summary year → Paid Invoices ----------
function drillIntoYear(year) {
  // Set the filter first so when load() resolves it renders the
  // year-only view; if data is already cached, the filter takes effect
  // on the next render triggered by expand().
  paidInvoices.setYearFilter(year);
  invoicesCollapsible.expand();

  // Scroll the card into view after the layout has updated.
  const cardEl = invoicesCollapsible.getCardEl();
  if (cardEl) {
    requestAnimationFrame(() => {
      cardEl.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

} // end startApp
