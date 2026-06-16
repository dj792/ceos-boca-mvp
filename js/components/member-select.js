// Searchable dropdown of members.
//
// Reads MemberProfiles (column A = ProfileID, column B = Name),
// renders a combobox keyed on Name, and fires `onChange({id, name})`
// when the user picks one.

import { CONFIG } from "../config.js";
import { fetchSheetRows } from "../sheets.js";

/**
 * @param {HTMLElement} mountEl  Container the combobox renders into
 * @param {(selection: {id: string, name: string} | null) => void} onChange
 */
export async function mountMemberSelect(mountEl, onChange) {
  // ---------- Markup ----------
  mountEl.innerHTML = `
    <div class="combobox" role="combobox" aria-haspopup="listbox" aria-expanded="false">
      <input
        type="text"
        class="combobox__input"
        placeholder="Search members…"
        autocomplete="off"
        spellcheck="false"
        aria-autocomplete="list"
      />
      <span class="combobox__caret">▾</span>
      <ul class="combobox__menu" role="listbox"></ul>
    </div>
    <div class="combobox__status" role="status" aria-live="polite">Loading members…</div>
  `;

  const root = mountEl.querySelector(".combobox");
  const input = mountEl.querySelector(".combobox__input");
  const menu = mountEl.querySelector(".combobox__menu");
  const status = mountEl.querySelector(".combobox__status");

  // ---------- Data ----------
  /** @type {{id: string, name: string}[]} */
  let members = [];
  let activeIndex = -1;
  let selection = null;

  try {
    const rows = await fetchSheetRows(CONFIG.tabs.memberProfiles);
    members = rowsToMembers(rows);
    status.textContent = `${members.length} members loaded`;
  } catch (err) {
    status.textContent = err.message;
    status.classList.add("combobox__status--error");
    input.disabled = true;
    return;
  }

  // ---------- Behavior ----------
  const open = () => {
    menu.dataset.open = "true";
    root.setAttribute("aria-expanded", "true");
  };
  const close = () => {
    menu.dataset.open = "false";
    root.setAttribute("aria-expanded", "false");
    activeIndex = -1;
  };

  const render = (filter = "") => {
    const q = filter.trim().toLowerCase();
    const matches = q
      ? members.filter((m) => m.name.toLowerCase().includes(q))
      : members;

    if (matches.length === 0) {
      menu.innerHTML = `<li class="combobox__empty">No members match “${escapeHtml(filter)}”.</li>`;
      return;
    }

    menu.innerHTML = matches
      .map(
        (m, i) => `
          <li class="combobox__option"
              role="option"
              data-id="${escapeHtml(m.id)}"
              data-name="${escapeHtml(m.name)}"
              aria-selected="${i === activeIndex}">
            <span>${highlight(m.name, q)}</span>
            <span class="combobox__option-meta">${escapeHtml(m.id)}</span>
          </li>`
      )
      .join("");
  };

  // Don't show any list until the user has typed at least 2 chars —
  // the full list of 1,290+ names is overwhelming on first focus, and
  // single-letter prefixes match too many entries to be useful.
  const MIN_QUERY = 2;
  const meetsMin = (v) => v.trim().length >= MIN_QUERY;

  // Show or hide the dropdown based on the current input length.
  // Clears the menu when below the threshold so keyboard navigation
  // (ArrowDown / Enter) doesn't pick up stale options.
  const applyFilter = () => {
    if (meetsMin(input.value)) {
      render(input.value);
      open();
    } else {
      menu.innerHTML = "";
      close();
    }
  };

  // Start with no options rendered; user must type to see results.
  input.addEventListener("focus", applyFilter);

  input.addEventListener("input", () => {
    activeIndex = -1;
    applyFilter();
    // Typing invalidates any prior selection
    if (selection) {
      selection = null;
      onChange?.(null);
    }
  });

  input.addEventListener("keydown", (e) => {
    const opts = [...menu.querySelectorAll(".combobox__option")];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!opts.length) return;
      open();
      activeIndex = (activeIndex + 1) % opts.length;
      updateActive(opts);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!opts.length) return;
      activeIndex = (activeIndex - 1 + opts.length) % opts.length;
      updateActive(opts);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && opts[activeIndex]) {
        e.preventDefault();
        choose(opts[activeIndex]);
      }
    } else if (e.key === "Escape") {
      close();
      input.blur();
    }
  });

  menu.addEventListener("mousedown", (e) => {
    // mousedown beats the input's blur, so the click survives
    const li = e.target.closest(".combobox__option");
    if (li) {
      e.preventDefault();
      choose(li);
    }
  });

  document.addEventListener("click", (e) => {
    if (!mountEl.contains(e.target)) close();
  });

  function updateActive(opts) {
    opts.forEach((o, i) => o.setAttribute("aria-selected", i === activeIndex));
    const el = opts[activeIndex];
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  function choose(li) {
    selection = { id: li.dataset.id, name: li.dataset.name };
    input.value = selection.name;
    close();
    onChange?.(selection);
  }
}

// ---------- Helpers ----------

function rowsToMembers(rows) {
  if (!rows.length) return [];

  // Drop header row if column-B header doesn't look like a name
  const first = rows[0];
  const looksLikeHeader =
    first.length >= 2 &&
    /id|profile/i.test(first[0]) &&
    /name/i.test(first[1]);
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;

  return dataRows
    .map((r) => ({ id: (r[0] || "").trim(), name: (r[1] || "").trim() }))
    .filter((m) => m.id && m.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function highlight(text, q) {
  if (!q) return escapeHtml(text);
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return escapeHtml(text);
  return (
    escapeHtml(text.slice(0, i)) +
    "<strong>" +
    escapeHtml(text.slice(i, i + q.length)) +
    "</strong>" +
    escapeHtml(text.slice(i + q.length))
  );
}
