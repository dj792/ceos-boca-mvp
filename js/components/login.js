// Lightweight login gate.
//
// Renders a full-screen overlay (Apple Stocks–styled) with a username +
// password form, validates against the demo login table via
// authenticate(), and calls onSuccess(user) once. Credentials are
// hardcoded in a Google Sheet for the MVP; this whole component goes
// away (or points at a real auth backend) when SQL lands.
//
// No browser storage: auth state lives in memory only, so a reload
// re-prompts. That matches the project's "no localStorage" rule.

import { authenticate } from "../sheets.js";

/**
 * @param {HTMLElement} mountEl   Container the overlay renders into
 * @param {(user: {name: string, username: string}) => void} onSuccess
 */
export function mountLogin(mountEl, onSuccess) {
  mountEl.innerHTML = `
    <div class="login__card">
      <img
        class="login__logo"
        src="brand-kit/ceo-operating-system-dark.svg"
        alt="CEO Operating System"
      />
      <h1 class="login__title">Sign In</h1>
      <p class="login__subtitle">CEOS Boca — Member Viewer</p>
      <form class="login__form" novalidate>
        <label class="login__field">
          <span class="login__label">Username</span>
          <input
            type="text"
            class="login__input"
            name="username"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            placeholder="you@example.com"
          />
        </label>
        <label class="login__field">
          <span class="login__label">Password</span>
          <input
            type="password"
            class="login__input"
            name="password"
            autocomplete="current-password"
            placeholder="••••••"
          />
        </label>
        <button type="submit" class="login__submit">Sign In</button>
        <p class="login__status" role="status" aria-live="polite"></p>
      </form>
    </div>
  `;

  const form = mountEl.querySelector(".login__form");
  const userInput = mountEl.querySelector('input[name="username"]');
  const pwInput = mountEl.querySelector('input[name="password"]');
  const submit = mountEl.querySelector(".login__submit");
  const status = mountEl.querySelector(".login__status");

  userInput.focus();

  const setStatus = (msg, isError = false) => {
    status.textContent = msg || "";
    status.classList.toggle("login__status--error", isError);
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = userInput.value.trim();
    const password = pwInput.value;

    if (!username || !password) {
      setStatus("Enter your username and password.", true);
      return;
    }

    submit.disabled = true;
    setStatus("Signing in…");

    try {
      const user = await authenticate(username, password);
      if (!user) {
        setStatus("Incorrect username or password.", true);
        submit.disabled = false;
        pwInput.select();
        return;
      }
      setStatus("");
      onSuccess?.(user);
    } catch (err) {
      console.error("Login lookup failed:", err);
      setStatus("Couldn't reach the login service. Try again.", true);
      submit.disabled = false;
    }
  });
}
