import { TEMPLATES } from "../../core/templates.ts";
import { keyLabel } from "../../core/music.ts";
import { songLengthBars } from "../../core/project.ts";
import type { App, View } from "../app.ts";
import { h } from "../dom.ts";
import type { Route } from "../shell.ts";
import { setAiTab } from "./ai.ts";
import type { Project } from "../../core/types.ts";

export function createHomeView(app: App, navigate: (r: Route) => void): View {
  const current = h("p", { class: "muted" });
  const templates = h("div", { class: "template-grid" },
    ...TEMPLATES.map((t) => h("button", { class: "card template", "data-template": t.id, onclick: async () => {
      await app.newProject(t.id);
      navigate("beat");
    } }, h("h3", {}, t.name), h("p", {}, t.description))));
  const steps: [string, Route, string][] = [
    ["1. Beat", "beat", "Drums et 808 au step sequencer"],
    ["2. Mélodie", "melody", "Piano roll, instruments, gamme"],
    ["3. Arrangement", "arrangement", "Intro, couplets, refrains…"],
    ["4. Voix", "vocals", "Micro, prises, AUTO VOICE, pitch"],
    ["5. Mix", "mixer", "Volumes, effets, bus"],
    ["6. IA & Master", "ai", "Assistant, AI MIX, AI MASTER"],
    ["7. Export", "projects", "WAV / MP3, stems"],
  ];
  // GUIDED MODE: a first finished song in one session, for someone who has never made a beat.
  // Each step is ticked from the real state of the project, not by hand.
  const guide = h("div", { class: "card guide" });
  type GuideStep = { title: string; how: string; done: (p: Project) => boolean; go: () => void; button: string };
  const ai = (t: Parameters<typeof setAiTab>[0]) => () => { setAiTab(t); navigate("ai"); };
  const GUIDE: GuideStep[] = [
    { title: "Choisir un style et générer le beat", how: "Cliquez sur un style (trap, drill, afro, amapiano…), puis « ✨ 3 versions ». Écoutez le refrain de chacune, mettez 👍 à celles qui vous plaisent et « Appliquer au projet ».",
      done: (p) => p.arrangement.sections.length >= 3 && p.patterns.length >= 3, go: ai("beat"), button: "Générer mon beat" },
    { title: "Ajuster en parlant au producteur", how: "Écrivez ce que vous voulez entendre : « plus de basse », « change le piano en guitare », « kit afro », « plus d'énergie »… Ctrl+Z annule.",
      done: () => app.guideDone("adjust"), go: ai("producer"), button: "Parler au producteur" },
    { title: "Tester le micro (8 secondes)", how: "Branchez le micro, mettez un casque, puis « 🎚 Test du micro » : l'application mesure votre pièce et règle tout pour un son propre.",
      done: () => !!app.settings.micCheck, go: () => navigate("vocals"), button: "Tester mon micro" },
    { title: "Enregistrer sa voix", how: "Placez le curseur au début du couplet, appuyez sur ● REC (ou R), rappez / chantez, puis ■ STOP. Chaque prise est nettoyée automatiquement.",
      done: (p) => p.vocals.some((v) => v.takes.length > 0), go: () => navigate("vocals"), button: "Enregistrer" },
    { title: "Mix et master automatiques", how: "AI MASTER analyse le morceau et règle le volume final (niveau streaming, sans saturation). Comparez avant / après puis appliquez.",
      done: () => app.guideDone("master"), go: ai("master"), button: "Masteriser" },
    { title: "Exporter en MP3", how: "PROJECTS › Export : MP3 pour partager, WAV pour un studio. Le fichier est prêt à envoyer.",
      done: () => app.guideDone("export"), go: () => navigate("projects"), button: "Exporter" },
  ];
  function renderGuide(p: Project): void {
    guide.textContent = "";
    const states = GUIDE.map((g) => g.done(p));
    const next = states.indexOf(false);
    const doneCount = states.filter(Boolean).length;
    guide.append(
      h("div", { class: "guide-head" }, h("h3", {}, "🎓 Mode guidé — mon premier morceau"), h("span", { class: "hint" }, `${doneCount} / ${GUIDE.length} étapes`)),
      h("div", { class: "guide-bar" }, h("i", { style: `width:${(doneCount / GUIDE.length) * 100}%` })),
      h("ol", { class: "guide-steps" }, ...GUIDE.map((g, i) => h("li", { class: states[i] ? "done" : i === next ? "current" : "" },
        h("div", {}, h("strong", {}, `${states[i] ? "✓ " : ""}${g.title}`), i === next ? h("p", {}, g.how) : null),
        i === next ? h("button", { class: "btn btn-primary", onclick: g.go }, g.button) : states[i] ? h("button", { class: "btn btn-sm", onclick: g.go }, "Revoir") : null))),
    );
    if (next < 0) guide.append(h("p", { class: "ok" }, "Bravo, votre morceau est terminé et exporté ! Pour le suivant : HOME › template, ou l'onglet AI."));
  }

  const el = h("section", { class: "view home-view" },
    h("h1", {}, "HOME"),
    guide,
    h("div", { class: "home-actions" },
      h("button", { class: "card action", onclick: () => navigate("beat") }, h("h3", {}, "▶ Continuer le projet en cours"), current),
      h("button", { class: "card action", onclick: async () => { if (await app.openProject()) navigate("beat"); } }, h("h3", {}, "🗀 Ouvrir un projet"), h("p", { class: "muted" }, "Fichier .bsproj (Ctrl+O)")),
      h("button", { class: "card action", onclick: () => navigate("ai") }, h("h3", {}, "✦ Assistant IA"), h("p", { class: "muted" }, "Générer un beat, une mélodie, des drums, conseils, mix & master"))),
    h("h2", {}, "Nouveau projet depuis un template"),
    templates,
    h("h2", {}, "Du beat au morceau fini"),
    h("div", { class: "workflow" }, ...steps.map(([t, r, d]) => h("button", { class: "card step", onclick: () => navigate(r) }, h("strong", {}, t), h("span", { class: "muted" }, d)))),
    h("p", { class: "muted small" }, "Le dernier projet est rouvert automatiquement au démarrage (sauvegarde automatique)."),
  );
  return {
    el,
    update(p) {
      renderGuide(p);
      current.textContent = `« ${p.name} » — ${p.bpm} BPM · ${keyLabel(p.key)} · ${p.patterns.length} pattern(s) · ${songLengthBars(p)} mesure(s)${app.store.isDirty() ? " · non sauvegardé" : ""}`;
    },
  };
}
