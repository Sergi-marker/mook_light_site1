// Tiny DOM helpers. The UI is plain TypeScript (no framework) for now — see docs/ARCHITECTURE.md.

type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "class") {
      el.className = String(v);
    } else if (k in el && k !== "list" && typeof v !== "boolean") {
      (el as unknown as Record<string, unknown>)[k] = v;
    } else {
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}

/** Read a File as bytes. */
export async function readFileBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

let toastHost: HTMLElement | null = null;

export function toast(message: string, kind: "info" | "error" | "ok" = "info", ms = 3500): void {
  if (!toastHost) {
    toastHost = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
    document.body.append(toastHost);
  }
  const el = h("div", { class: `toast toast-${kind}` }, message);
  toastHost.append(el);
  setTimeout(() => el.remove(), ms);
}

/** Non-blocking modal. Resolves true for the confirm button, false otherwise (incl. Escape). */
export function confirmDialog(
  title: string,
  message: string,
  confirmLabel = "OK",
  cancelLabel = "Annuler",
  danger = false,
): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        done(false);
      }
    };
    const ok = h("button", { class: danger ? "btn btn-danger" : "btn btn-primary", onclick: () => done(true) }, confirmLabel);
    const overlay = h(
      "div",
      { class: "modal-overlay", role: "dialog", "aria-modal": "true", "aria-label": title },
      h(
        "div",
        { class: "modal" },
        h("h2", {}, title),
        h("p", {}, message),
        h("div", { class: "modal-actions" }, h("button", { class: "btn", onclick: () => done(false) }, cancelLabel), ok),
      ),
    );
    document.addEventListener("keydown", onKey, true);
    document.body.append(overlay);
    ok.focus();
  });
}
