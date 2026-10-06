// Electron main process (Windows desktop shell).
// The UI is served from dist/ over a private app:// scheme: it gives the page a secure
// origin (needed for ES modules, AudioWorklet and the File System Access API).
const { app, BrowserWindow, protocol, net, dialog, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const DIST = path.join(__dirname, "..", "dist");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0b0d12",
    title: "Beatmaker Studio",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Audio starts on Play without waiting for an extra click.
      autoplayPolicy: "no-user-gesture-required",
      backgroundThrottling: false, // keep the audio scheduler awake when minimised
    },
  });

  // The page asks before closing when the project has unsaved changes.
  win.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Quitter sans sauvegarder", "Annuler"],
      defaultId: 1,
      cancelId: 1,
      title: "Modifications non sauvegardées",
      message: "Le projet contient des modifications non sauvegardées dans un fichier.",
      detail: "Elles restent disponibles via la sauvegarde automatique au prochain démarrage.",
    });
    if (choice === 0) event.preventDefault(); // ignore the page's veto → close
  });

  // Never navigate away from the app; open external links in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://")) e.preventDefault();
  });

  win.loadURL("app://studio/index.html");
  if (process.env.BS_DEVTOOLS) win.webContents.openDevTools({ mode: "detach" });
}

app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    if (!file.startsWith(DIST)) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("second-instance", () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
