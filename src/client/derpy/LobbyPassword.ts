// FRIENDS (r25): DerpyFront lobbies with a password.
//
// Every lobby is open to anyone on Derp Land; a host who wants theirs closed
// gives it a password (<derpy-lobby-password>, a card in the host's lobby
// settings). The password goes to the lobby's game server and stays there:
// nothing sent to anyone carries it, only whether there is one.
//
// Anyone else joining (a Join in who's online, a /game/<id> link, the
// join-by-id box) is asked for it before the join (unlockLobby), unless they
// came by an invite or their party's leader: those links carry a pass the
// server signed for them, which lets them in without typing anything.

import { html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { getPlayToken } from "../Auth";
import { ClientEnv } from "../ClientEnv";
import "../components/ToggleInputCard";
import { translateText } from "../Utils";

/** As long as the server takes (LobbyLock.PASSWORD_MAX). */
export const PASSWORD_MAX = 40;

type Unlock =
  | "ok"
  | "password_required"
  | "wrong_password"
  | "too_many_tries"
  | "error";

async function post(
  id: string,
  route: "unlock" | "password",
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `${ClientEnv.gameHttpBase(id)}/${ClientEnv.gameWorkerPath(id)}/api/game/${encodeURIComponent(id)}/${route}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getPlayToken()}`,
        },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => ({}))) as { error?: unknown };
    return {
      ok: res.ok,
      ...(typeof json.error === "string" ? { error: json.error } : {}),
    };
  } catch {
    return { ok: false };
  }
}

async function tryUnlock(
  id: string,
  body: { pass?: string; password?: string },
): Promise<Unlock> {
  const r = await post(id, "unlock", body);
  if (r.ok) return "ok";
  return r.error === "password_required" ||
    r.error === "wrong_password" ||
    r.error === "too_many_tries"
    ? r.error
    : "error";
}

/** The pass an invite's link brought (`?pass=`), taken out of the address. */
export function takePass(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const pass = params.get("pass");
  if (pass === null) return undefined;
  params.delete("pass");
  const q = params.toString();
  history.replaceState(
    history.state,
    "",
    window.location.pathname + (q ? `?${q}` : "") + window.location.hash,
  );
  return pass || undefined;
}

/**
 * Before joining lobby `id`, which has a password: let in by the invite's
 * pass, or by having given it already, or ask for it. True: join now.
 * False: they gave up (or it couldn't be checked; they were told).
 */
export async function unlockLobby(id: string): Promise<boolean> {
  const pass = takePass();
  const first = await tryUnlock(id, pass ? { pass } : {});
  if (first === "ok") return true;
  return askPassword(id);
}

/** What to tell someone whose password wasn't taken. */
export function unlockMessage(r: Exclude<Unlock, "ok">): string {
  switch (r) {
    case "password_required":
      return translateText("lobby_password.required");
    case "wrong_password":
      return translateText("lobby_password.wrong");
    case "too_many_tries":
      return translateText("lobby_password.too_many");
    case "error":
      return translateText("lobby_password.error");
  }
}

function askPassword(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    const prompt = document.createElement(
      "derpy-lobby-password-prompt",
    ) as LobbyPasswordPrompt;
    prompt.check = async (password) => {
      const r = await tryUnlock(id, { password });
      return r === "ok" ? null : unlockMessage(r);
    };
    prompt.done = (ok) => {
      prompt.remove();
      resolve(ok);
    };
    document.body.append(prompt);
  });
}

/** "This lobby has a password": a box to type it in, Join and Cancel. */
@customElement("derpy-lobby-password-prompt")
export class LobbyPasswordPrompt extends LitElement {
  /** Null: it's the password. Otherwise what to say. */
  check: (password: string) => Promise<string | null> = async () => null;
  done: (ok: boolean) => void = () => {};

  @state() private value = "";
  @state() private problem = "";
  @state() private busy = false;

  createRenderRoot() {
    return this;
  }

  protected firstUpdated(): void {
    this.querySelector("input")?.focus();
  }

  private async submit(): Promise<void> {
    const pw = this.value.trim();
    if (!pw || this.busy) return;
    this.busy = true;
    const problem = await this.check(pw);
    this.busy = false;
    if (problem === null) {
      this.done(true);
      return;
    }
    this.problem = problem;
    this.updateComplete.then(() => this.querySelector("input")?.select());
  }

  render() {
    return html`
      <div
        class="fixed inset-0 z-[10020] flex items-center justify-center bg-black/80"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.done(false);
        }}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Escape") this.done(false);
        }}
      >
        <form
          class="relative mx-4 w-full max-w-sm p-6 rounded-2xl border border-amber-500/50 bg-surface shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="derpy-lobby-password-title"
          @submit=${(e: Event) => {
            e.preventDefault();
            void this.submit();
          }}
        >
          <h2
            id="derpy-lobby-password-title"
            class="text-lg font-bold text-white mb-1 flex items-center gap-2"
          >
            ${lockIcon("w-4 h-4 text-amber-300")}
            ${translateText("lobby_password.prompt_title")}
          </h2>
          <p class="text-sm text-white/70 mb-4">
            ${translateText("lobby_password.prompt_body")}
          </p>
          <input
            type="password"
            autocomplete="off"
            maxlength=${PASSWORD_MAX}
            .value=${this.value}
            @input=${(e: Event) => {
              this.value = (e.target as HTMLInputElement).value;
              this.problem = "";
            }}
            aria-label=${translateText("lobby_password.label")}
            placeholder=${translateText("lobby_password.label")}
            class="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
          />
          <p
            class="min-h-5 mt-2 mb-3 text-sm font-medium text-red-300"
            role="alert"
          >
            ${this.problem || nothing}
          </p>
          <div class="flex gap-3">
            <button
              type="button"
              @click=${() => this.done(false)}
              class="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80 transition-all"
            >
              ${translateText("common.cancel")}
            </button>
            <button
              type="submit"
              ?disabled=${this.busy || !this.value.trim()}
              class="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-all disabled:opacity-50 disabled:pointer-events-none border-0"
            >
              ${translateText("lobby_password.join")}
            </button>
          </div>
        </form>
      </div>
    `;
  }
}

function lockIcon(cls: string) {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>`;
}

// ------------------------------------------------------------ the host's

/** What this tab's host gave each lobby, so a redrawn card keeps it. */
const given = new Map<string, string>();

/**
 * The host's card: tick it and type a password, and only those who give it
 * (or come by an invite) may join. Sent to the lobby's server as it's typed;
 * untick it (or empty it) to open the lobby again.
 */
@customElement("derpy-lobby-password")
export class LobbyPasswordCard extends LitElement {
  @property({ attribute: false }) lobbyId = "";
  @state() private on = false;
  @state() private value = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** What the lobby's server last took (null: none). */
  private sent: string | null = null;

  createRenderRoot() {
    // A card in the settings grid like its neighbours, not a box around one.
    this.style.display = "contents";
    return this;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("lobbyId")) {
      const pw = given.get(this.lobbyId);
      this.on = pw !== undefined;
      this.value = pw ?? "";
      this.sent = pw ?? null;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
      void this.send();
    }
  }

  private readonly toggle = (checked: boolean) => {
    this.on = checked;
    if (!checked) this.value = "";
    this.soon(0);
  };

  private readonly input = (e: Event) => {
    this.value = (e.target as HTMLInputElement).value.slice(0, PASSWORD_MAX);
    this.soon(700);
  };

  private readonly change = () => this.soon(0);

  private soon(ms: number): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.send();
    }, ms);
  }

  private async send(): Promise<void> {
    const id = this.lobbyId;
    if (!id) return;
    const pw = this.on ? this.value.trim() || null : null;
    if (pw === this.sent) return;
    const r = await post(id, "password", { password: pw });
    if (!r.ok) {
      window.dispatchEvent(
        new CustomEvent("show-message", {
          detail: {
            message: translateText("lobby_password.set_failed"),
            duration: 3000,
            color: "red",
          },
        }),
      );
      return;
    }
    this.sent = pw;
    if (pw === null) given.delete(id);
    else given.set(id, pw);
  }

  render() {
    return html`<toggle-input-card
      .labelKey=${"lobby_password.label"}
      .checked=${this.on}
      .inputType=${"text"}
      .inputValue=${this.value}
      .inputAriaLabel=${translateText("lobby_password.label")}
      .inputPlaceholder=${translateText("lobby_password.placeholder")}
      .defaultInputValue=${""}
      .onToggle=${this.toggle}
      .onInput=${this.input}
      .onChange=${this.change}
    ></toggle-input-card>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "derpy-lobby-password": LobbyPasswordCard;
    "derpy-lobby-password-prompt": LobbyPasswordPrompt;
  }
}
