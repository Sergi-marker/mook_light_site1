import { test } from "node:test";
import assert from "node:assert/strict";
import { converse, type DialogState } from "../../src/core/ai/dialog.ts";
import { interpretCommand } from "../../src/core/ai/commands.ts";
import { generateSong } from "../../src/core/ai/beat.ts";
import { parseBeatPrompt } from "../../src/core/ai/prompt.ts";
import { createDefaultProject, getChannel } from "../../src/core/project.ts";
import { reduce } from "../../src/core/reducer.ts";
import type { Project } from "../../src/core/types.ts";

const afro = () => {
  const p = createDefaultProject();
  return reduce(p, { type: "patchProject", patch: generateSong(p, parseBeatPrompt("afrobeats", "afrobeats", p.key.root), 3).patch });
};

/** Plays a conversation: applies actions / generation / undo like the app does. */
function play(start: Project, msgs: string[]) {
  let p = start, st: DialogState = {};
  const undo: Project[] = [];
  const replies = [];
  for (const m of msgs) {
    const { reply, state } = converse(p, m, st);
    st = state;
    if (reply.generate) { undo.push(p); p = reduce(p, { type: "patchProject", patch: generateSong(p, parseBeatPrompt(reply.generate.prompt, reply.generate.style.id, p.key.root), 3).patch }); }
    if (reply.undo) p = undo.pop() ?? p;
    if (reply.actions.length) { undo.push(p); p = reply.actions.reduce((a, x) => reduce(a, x), p); }
    replies.push(reply);
  }
  return { p, replies };
}

test("conversation: asks the style back, then generates it", () => {
  const { p, replies } = play(createDefaultProject(), ["salut", "je veux un beat", "amapiano"]);
  assert.match(replies[1].text, /quel style/i);
  assert.equal(replies[2].generate?.style.id, "amapiano");
  assert.ok(p.instruments.some((i) => i.name === "Log Drum"));
});

test("conversation: context — « encore », « et pour la basse ? », « non plutôt une flûte », « annule »", () => {
  const start = afro();
  const v = start.vocals[0], bass = start.instruments.find((i) => i.name === "Bass")!;
  const { p, replies } = play(start, ["on entend pas la voix", "encore", "et pour la basse ?", "change la mélodie en guitare", "non plutôt une flûte"]);
  const once = play(start, ["on entend pas la voix"]).p;
  assert.ok(getChannel(p, v.id)!.volume > getChannel(once, v.id)!.volume * 1.05, "« encore » raises the voice again (capped at 1.5)");
  assert.ok(getChannel(p, bass.id)!.volume > getChannel(start, bass.id)!.volume * 1.3, "bass +3 dB");
  assert.equal(p.instruments.find((i) => i.name === "Melody")!.sample, "flute");
  for (const r of replies) assert.ok(r.text.length > 15 && !/pas sûr de comprendre/.test(r.text), r.text);
  const after = play(p, ["annule"]);
  assert.equal(after.replies[0].undo, 1);
});

test("conversation: feelings become changes, questions get explanations, unknown is said honestly", () => {
  const start = afro();
  let r = converse(start, "c'est trop vide").reply;
  assert.ok(r.actions.length > 2 && /énergie/.test(r.text));
  r = converse(start, "c'est quoi une 808 ?").reply;
  assert.match(r.text, /basse/);
  r = converse(start, "pourquoi mon refrain manque d'énergie ?").reply;
  assert.ok(r.offers && r.offers.length > 0, "offers the fix");
  r = converse(start, "plus joyeux").reply;
  assert.ok(r.actions.some((a) => a.type === "setKey"));
  r = converse(start, "fais moi un café").reply;
  assert.equal(r.actions.length, 0);
  assert.match(r.text, /pas sûr de comprendre/);
});

test("sound change on a track that plays nothing warns and names the tracks that play", () => {
  const p = afro();
  const r = interpretCommand(p, "change le piano en guitare");
  assert.match(r.done[0], /ne joue aucune note/);
  assert.match(r.done[0], /« Melody »/);
});
