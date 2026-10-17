import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { g2p, syllablesOf, words } from "../../src/core/lyrics/phonetics.ts";
import { analyzeFlow, findRhymes, flowAdvice, gridPositions, parseLexicon } from "../../src/core/lyrics/writing.ts";

const lex = parseLexicon(readFileSync(new URL("../../assets/lexique/fr.tsv", import.meta.url), "utf8"));

test("word list: 65 000 frequent words with pronunciation and syllables", () => {
  assert.ok(lex.entries.length > 60000);
  assert.deepEqual(lex.byWord.get("moment"), { word: "moment", phon: "mom@", syll: 2, rank: lex.byWord.get("moment")!.rank });
  assert.ok(lex.byWord.get("de")!.rank < lex.byWord.get("banlieusard")!.rank, "most frequent first");
});

test("spelling rules agree with the list on common words, and handle slang", () => {
  const sample = ["chanson", "garçon", "nuit", "pluie", "maison", "bébé", "été", "frère", "moment", "chantent", "oseille", "tête", "montagne", "soleil", "famille", "quartier", "bonheur", "gamin", "grand", "charbon", "frérot", "rêve", "douleur", "liberté"];
  const same = sample.filter((w) => g2p(w) === lex.byWord.get(w)!.phon);
  assert.ok(same.length >= sample.length - 2, `only ${same.length}/${sample.length}: ${sample.filter((w) => !same.includes(w)).map((w) => `${w} ${g2p(w)}≠${lex.byWord.get(w)!.phon}`).join(", ")}`);
  assert.equal(g2p("téma"), "tema");
  assert.equal(g2p("seum"), "s9m");
  assert.equal(syllablesOf(g2p("bendo")).full, 2);
  assert.deepEqual(words("J'suis l'meilleur, p'tit-frère !"), ["j", "suis", "l", "meilleur", "p", "tit", "frère"]);
});

test("rhymes: rich and multi-syllable first, no repetitions of the word", () => {
  const names = (t: string, n = 20) => findRhymes(t, lex, { max: n }).map((r) => r.word);
  assert.ok(names("maison").includes("raison") && names("maison").includes("saison"));
  assert.ok(names("nuit").includes("pluie") || names("nuit", 40).includes("pluie"));
  const noir = findRhymes("dans le noir", lex, { max: 40 });
  assert.ok(noir.some((r) => r.word === "banlieusard" && r.multi >= 3), "dans le noir / banlieusard");
  assert.ok(!noir.some((r) => /noir/.test(r.word)), "noire, noirs… are not rhymes");
  const bebe = findRhymes("bébé", lex, { max: 10 });
  assert.ok(bebe.every((r) => r.multi >= 2), "bébé → two-syllable rhymes first");
  assert.ok(findRhymes("frérot", lex).some((r) => r.word === "numéro"));
  assert.ok(findRhymes("garçon", lex, { syllables: 1, max: 30 }).every((r) => r.syllables === 1));
});

test("flow: syllables per bar, density at the tempo, rhyme scheme and advice", () => {
  const text = "J'suis dans le bloc avec mes frères\nOn fait du sale pour la lumière\n\n[Refrain]\nTous les jours je pense à demain\nLe cœur lourd mais j'tiens dans mes mains\nIls parlent beaucoup trop mais ils ne savent pas vraiment ce qu'on a traversé dans la vie de tous les jours";
  const f = analyzeFlow(text, 140, lex);
  assert.equal(f.length, 5, "empty lines and [tags] skipped");
  assert.deepEqual(f.map((l) => l.scheme), ["A", "A", "B", "B", ""]);
  assert.equal(f[1].syllables, 8);
  assert.equal(f[4].density, "trop dense");
  assert.ok(f[0].min <= f[0].syllables);
  assert.ok(f[2].words.find((w) => w.word === "demain")!.rhymeVowel);
  const slow = analyzeFlow("On fait du sale pour la lumière", 70, lex)[0];
  assert.ok(slow.rate < f[1].rate, "same line, slower tempo → less dense");
  assert.deepEqual(gridPositions(4), [0, 4, 8, 12]);
  assert.ok(flowAdvice(f, 140).some((a) => /trop chargée/.test(a)));
});

test("conversation and producer tools ask for rhymes and flow", async () => {
  const { converse } = await import("../../src/core/ai/dialog.ts");
  const { runProducerTool, describeProject } = await import("../../src/core/ai/producerTools.ts");
  const { createDefaultProject } = await import("../../src/core/project.ts");
  const { reduce } = await import("../../src/core/reducer.ts");
  let p = createDefaultProject();
  assert.deepEqual(converse(p, "trouve-moi des rimes avec nuit", {}).reply.rhymes, { target: "nuit" });
  assert.deepEqual(converse(p, "qu'est-ce qui rime avec « dans le noir » ?", {}).reply.rhymes, { target: "dans le noir" });
  assert.equal(converse(p, "c'est quoi une rime riche ?", {}).reply.rhymes, undefined);
  assert.equal(converse(p, "analyse mon flow", {}).reply.flow, undefined, "no lyrics yet → explains");
  assert.deepEqual(converse(p, "combien de syllabes dans « j'suis dans le bloc »", {}).reply.flow, { text: "j'suis dans le bloc" });
  p = reduce(p, { type: "addVocalTrack", role: "lead", id: "voc_lead" });
  p = reduce(p, { type: "updateVocalTrack", trackId: "voc_lead", patch: { lyrics: "J'suis dans le bloc avec mes frères\nOn fait du sale pour la lumière" } });
  assert.match(converse(p, "analyse mon flow", {}).reply.flow!.text, /lumière/);
  assert.deepEqual(converse(p, "trouve des rimes", {}).reply.rhymes, { target: "la lumière" }, "end of the last line");
  assert.deepEqual(runProducerTool(p, "find_rhymes", { text: "frérot", syllables: 2 }).rhymes, { target: "frérot", syllables: 2 });
  assert.match(runProducerTool(p, "analyze_lyrics", {}).flow!.text, /bloc/);
  assert.ok(runProducerTool(createDefaultProject(), "analyze_lyrics", {}).isError);
  assert.match(describeProject(p), /Paroles de « .+ » :\nJ'suis dans le bloc/);
});
