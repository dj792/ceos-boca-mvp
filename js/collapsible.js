// Tiny helper that turns a card into a click-to-expand "summary bar"
// and defers the data fetch until the user opens it.
//
// app.js wires lazy cards with:
//   const c = makeCollapsible(cardEl, componentControls);
//   c.armForId(member.id);   // when a member is selected
//   c.reset();               // when selection is cleared
//
// Components keep the same { load, clear } shape they already export;
// this helper just decides *when* to call them.

/**
 * @param {HTMLElement} cardEl  The <article class="card"> element
 * @param {{ load: (id: string) => any, clear: () => any }} controls
 * @returns {{ armForId: (id: string) => void, reset: () => void }}
 */
export function makeCollapsible(cardEl, controls) {
  const header = cardEl.querySelector(".card-header");
  if (!header) {
    throw new Error("makeCollapsible: card is missing a .card-header");
  }

  cardEl.classList.add("card--collapsible", "card--collapsed");

  // Make the whole header keyboard/click activatable.
  header.setAttribute("role", "button");
  header.setAttribute("tabindex", "0");
  header.setAttribute("aria-expanded", "false");

  // Chevron marker on the right side of the header. The header's
  // existing flex layout positions it automatically.
  const chevron = document.createElement("span");
  chevron.className = "card-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "›";
  header.appendChild(chevron);

  let currentId = null;
  let loadedForId = null;
  let expanded = false;

  function setExpanded(next) {
    expanded = next;
    cardEl.classList.toggle("card--collapsed", !next);
    cardEl.classList.toggle("card--expanded", next);
    header.setAttribute("aria-expanded", next ? "true" : "false");
  }

  function expand() {
    if (expanded) return;
    setExpanded(true);
    if (currentId && loadedForId !== currentId) {
      controls.load?.(currentId);
      loadedForId = currentId;
    }
  }

  function collapse() {
    if (!expanded) return;
    setExpanded(false);
  }

  function toggle() {
    expanded ? collapse() : expand();
  }

  header.addEventListener("click", toggle);
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });

  return {
    /**
     * Called by app.js when a new member is selected. Wipes any prior
     * data, reveals the card in its collapsed state, and waits for a
     * click before fetching.
     */
    armForId(id) {
      currentId = id;
      loadedForId = null;
      controls.clear?.();      // empties body + (re)hides card
      cardEl.hidden = false;    // make it visible again, but collapsed
      setExpanded(false);
    },
    /**
     * Called when the user clears their selection. Hides + empties.
     */
    reset() {
      currentId = null;
      loadedForId = null;
      controls.clear?.();
      cardEl.hidden = true;
      setExpanded(false);
    },
    /**
     * Programmatically expand and trigger load() for the armed ID.
     * Used by drill-down interactions (e.g. clicking a year in the
     * Financial Summary chart).
     */
    expand,
    /** Get the card element (e.g. for scrollIntoView). */
    getCardEl() {
      return cardEl;
    },
  };
}
