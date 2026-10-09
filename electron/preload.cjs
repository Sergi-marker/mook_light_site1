// Preload (sandboxed): exposes a minimal, explicit API to the page. No Node access leaks.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("beatmakerDesktop", {
  /** Online song assistant (Claude). Only text is sent; called after explicit user consent. */
  askClaude: (req) => ipcRenderer.invoke("ai:ask", req),
  /** CPU / memory of the app processes (audio service included). */
  metrics: () => ipcRenderer.invoke("app:metrics"),
});
