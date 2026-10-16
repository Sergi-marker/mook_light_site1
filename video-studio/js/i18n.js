// Textes de l'interface : français, allemand, anglais.

export const UI_LANGS = { fr: 0, de: 1, en: 2 };

const T = {
  appTitle: ["Animots", "Animots", "Animots"],
  tagline: ["Vos mots prennent vie : collez un texte, il devient une vidéo animée.", "Worte werden lebendig: Text einfügen – daraus wird ein animiertes Video.", "Your words come alive: paste a text, it becomes an animated video."],
  play: ["Lecture", "Abspielen", "Play"], pause: ["Pause", "Pause", "Pause"],
  tabText: ["Texte", "Text", "Text"], tabScenes: ["Scènes", "Szenen", "Scenes"], tabChars: ["Personnages", "Figuren", "Characters"],
  tabStyle: ["Style", "Stil", "Style"], tabSound: ["Voix & musique", "Stimme & Musik", "Voice & music"], tabExport: ["Exporter", "Exportieren", "Export"], tabAccount: ["Compte & offres", "Konto & Tarife", "Account & plans"],
  textLabel: ["Votre texte", "Dein Text", "Your text"],
  textHelp: [
    "Une phrase = une scène. # Titre en début de ligne = carton de titre. [rire], [triste], [pense], [court], [muscu]… en début de phrase = geste imposé. Dialogue : « Lui : … » / « Elle : … » (chaque personnage a sa voix), « Narrateur : … » pour la voix off. *mot* = mot en couleur. [pause] ou [pause 2] seul sur une ligne = silence.",
    "Ein Satz = eine Szene. # am Zeilenanfang = Titelkarte. [lachen], [traurig], [denken], [laufen], [sport]… am Satzanfang = feste Geste. Dialog: „Er: …“ / „Sie: …“ (jede Figur hat ihre Stimme), „Erzähler: …“ für die Off-Stimme. *Wort* = farbiges Wort. [pause] oder [pause 2] allein in einer Zeile = Stille.",
    "One sentence = one scene. # at line start = title card. [laugh], [sad], [think], [run], [lift]… at sentence start = forced gesture. Dialogue: “Him: …” / “Her: …” (each character has its own voice), “Narrator: …” for the voice-over. *word* = colored word. [pause] or [pause 2] alone on a line = silence.",
  ],
  build: ["Créer la vidéo", "Video erstellen", "Create the video"],
  examples: ["Exemples", "Beispiele", "Examples"],
  exDialogue: ["Dialogue", "Dialog", "Dialogue"],
  importScript: ["Importer un script", "Skript importieren", "Import a script"],
  importHelp: [".txt, Word (.docx) ou sous-titres (.srt)", ".txt, Word (.docx) oder Untertitel (.srt)", ".txt, Word (.docx) or subtitles (.srt)"],
  importError: ["Ce fichier n'a pas pu être lu.", "Diese Datei konnte nicht gelesen werden.", "This file could not be read."],
  imageError: ["Cette image n'a pas pu être lue.", "Dieses Bild konnte nicht gelesen werden.", "This image could not be read."],
  storageFull: ["Plus de place dans ce navigateur : supprimez un style ou un personnage enregistré.", "Kein Platz mehr im Browser: einen gespeicherten Stil oder eine Figur löschen.", "No space left in this browser: delete a saved style or character."],
  addPause: ["+ Ajouter une pause", "+ Pause hinzufügen", "+ Add pause"],
  speaker: ["Personnage", "Figur", "Character"], speakerNone: ["Narrateur", "Erzähler", "Narrator"],
  bgStyle: ["Décor du style", "Hintergrund des Stils", "Style background"], decor: ["Décor", "Kulisse", "Set"],
  myCharacters: ["Mes personnages", "Meine Figuren", "My characters"], saveCharacter: ["Enregistrer", "Speichern", "Save"],
  charName: ["Nom du personnage", "Name der Figur", "Character name"],
  skin: ["Peau", "Haut", "Skin"], top: ["Haut", "Oberteil", "Top"], bottom: ["Bas", "Unterteil", "Bottom"], none: ["Aucun", "Keins", "None"],
  tshirt: ["T-shirt", "T-Shirt", "T-shirt"], hoodie: ["Sweat à capuche", "Hoodie", "Hoodie"], shirt: ["Chemise", "Hemd", "Shirt"], dress: ["Robe", "Kleid", "Dress"],
  pants: ["Pantalon", "Hose", "Trousers"], shorts: ["Short", "Shorts", "Shorts"],
  hairCurly: ["Frisés / afro", "Lockig / Afro", "Curly / afro"], hairPonytail: ["Queue de cheval", "Pferdeschwanz", "Ponytail"], hairSpiky: ["En pics", "Stachelig", "Spiky"],
  eyes: ["Yeux", "Augen", "Eyes"], eyesDots: ["Points", "Punkte", "Dots"], eyesBig: ["Grands yeux", "Große Augen", "Big eyes"], eyesLashes: ["Avec cils", "Mit Wimpern", "Lashes"], eyesSleepy: ["Fatigués", "Müde", "Sleepy"],
  bodyShape: ["Silhouette (taille, corpulence…)", "Körperbau (Größe, Statur…)", "Body shape (height, build…)"],
  channelStyles: ["Styles de chaîne", "Kanal-Stile", "Channel styles"],
  channelStylesHelp: ["Un style regroupe décor, personnages, sous-titres, musique, voix et marque. Enregistrez le vôtre pour que toutes vos vidéos se ressemblent.", "Ein Stil umfasst Hintergrund, Figuren, Untertitel, Musik, Stimmen und Marke. Speichere deinen eigenen, damit alle Videos gleich aussehen.", "A style bundles background, characters, captions, music, voices and branding. Save yours so all your videos look alike."],
  readyStyles: ["Prêts à l'emploi", "Fertige Stile", "Ready-made"], myStyles: ["Mes styles", "Meine Stile", "My styles"], noStyles: ["aucun pour l'instant", "noch keiner", "none yet"],
  myStyle: ["Mon style", "Mein Stil", "My style"], styleName: ["Nom du style", "Name des Stils", "Style name"], saveStyle: ["Enregistrer ce style", "Diesen Stil speichern", "Save this style"], styleSaved: ["Style enregistré", "Stil gespeichert", "Style saved"],
  bgColors: ["Couleurs du fond", "Hintergrundfarben", "Background colors"],
  decorTitle: ["Image et décor", "Bild und Kulisse", "Picture and set"], bgImport: ["🖼 Mon image de fond", "🖼 Eigenes Hintergrundbild", "🖼 My background image"], bgRemove: ["Retirer l'image", "Bild entfernen", "Remove image"],
  captionsTitle: ["Sous-titres", "Untertitel", "Captions"], font: ["Police", "Schrift", "Font"], captionPos: ["Position", "Position", "Position"],
  posTop: ["En haut", "Oben", "Top"], posMiddle: ["Au milieu", "Mitte", "Middle"], posBottom: ["En bas", "Unten", "Bottom"],
  captionBox: ["Fond", "Hintergrund", "Background"], boxNone: ["Aucun", "Keiner", "None"], boxBand: ["Bandeau sombre", "Dunkles Band", "Dark band"], boxWord: ["Mot surligné (TikTok)", "Wort markiert (TikTok)", "Highlighted word (TikTok)"],
  textColor: ["Couleur du texte", "Textfarbe", "Text color"],
  highlightHelp: ["Astuce : écrivez *un mot* entre étoiles dans votre texte pour le mettre en couleur. Les emojis fonctionnent aussi 🔥.", "Tipp: Schreibe *ein Wort* zwischen Sternchen, um es farbig hervorzuheben. Emojis funktionieren auch 🔥.", "Tip: write *a word* between asterisks to color it. Emojis work too 🔥."],
  speakerLabels: ["Nom de celui qui parle", "Name des Sprechers", "Speaker name"],
  brandTitle: ["Marque", "Marke", "Branding"],
  hook: ["Accroche (1re seconde)", "Aufhänger (1. Sekunde)", "Hook (first second)"], hookPlaceholder: ["Ex. : Ne fais plus jamais cette erreur", "Z. B.: Mach nie wieder diesen Fehler", "E.g.: Never make this mistake again"],
  hookHelp: ["Gros texte qui frappe en ouverture, pour retenir les gens qui font défiler.", "Großer Text zum Start, damit Scrollende hängen bleiben.", "Big punchy opening text so scrollers stop."],
  outroText: ["Écran de fin", "Abspann", "End screen"], outroPlaceholder: ["Ex. : Abonne-toi pour la suite", "Z. B.: Abonniere für mehr", "E.g.: Follow for part 2"],
  outroHelp: ["Affiché à la fin avec votre @signature. Laissez vide pour ne pas en mettre.", "Am Ende mit deinem @Namen gezeigt. Leer lassen für keinen Abspann.", "Shown at the end with your @handle. Leave empty for none."],
  logoImport: ["Mon logo", "Mein Logo", "My logo"],
  cornerTL: ["Haut gauche", "Oben links", "Top left"], cornerTR: ["Haut droite", "Oben rechts", "Top right"], cornerBL: ["Bas gauche", "Unten links", "Bottom left"], cornerBR: ["Bas droite", "Unten rechts", "Bottom right"],
  exPsy: ["Psychologie", "Psychologie", "Psychology"], exSport: ["Sport", "Sport", "Sport"], exStory: ["Histoire", "Geschichte", "Story"],
  textLang: ["Langue du texte", "Sprache des Textes", "Text language"],
  translateTitle: ["Traduire la vidéo", "Video übersetzen", "Translate the video"],
  translateHelp: [
    "Traduit chaque scène en gardant les mêmes animations. Utilise Claude (Anthropic) avec votre clé API : le texte des scènes est envoyé à Anthropic.",
    "Übersetzt jede Szene und behält die Animationen. Nutzt Claude (Anthropic) mit deinem API-Schlüssel: Der Szenentext wird an Anthropic gesendet.",
    "Translates each scene and keeps the same animations. Uses Claude (Anthropic) with your API key: the scene text is sent to Anthropic.",
  ],
  apiKey: ["Clé API Anthropic", "Anthropic-API-Schlüssel", "Anthropic API key"],
  apiKeyHelp: ["Gardée seulement dans ce navigateur.", "Wird nur in diesem Browser gespeichert.", "Stored only in this browser."],
  target: ["Traduire en", "Übersetzen nach", "Translate to"],
  translate: ["Traduire", "Übersetzen", "Translate"],
  direct: ["✨ Mise en scène par l'IA", "✨ Regie durch KI", "✨ AI staging"],
  directHelp: ["Claude lit tout le texte et choisit l'animation de chaque scène.", "Claude liest den ganzen Text und wählt die Animation jeder Szene.", "Claude reads the whole text and picks each scene's animation."],
  working: ["En cours…", "Läuft…", "Working…"],
  done: ["Terminé", "Fertig", "Done"],
  errNoKey: ["Ajoutez d'abord votre clé API Anthropic.", "Bitte zuerst den Anthropic-API-Schlüssel eingeben.", "Add your Anthropic API key first."],
  errBadKey: ["Clé API refusée.", "API-Schlüssel abgelehnt.", "API key rejected."],
  errRate: ["Trop de demandes, réessayez dans une minute.", "Zu viele Anfragen, in einer Minute erneut versuchen.", "Too many requests, try again in a minute."],
  errRefused: ["La demande a été refusée par le service.", "Die Anfrage wurde vom Dienst abgelehnt.", "The request was declined by the service."],
  errNetwork: ["Pas de connexion au service (Internet ?).", "Keine Verbindung zum Dienst (Internet?).", "Cannot reach the service (Internet?)."],
  errGeneric: ["Erreur", "Fehler", "Error"],
  scenesEmpty: ["Aucune scène. Écrivez un texte dans l'onglet Texte.", "Keine Szenen. Schreibe einen Text im Tab Text.", "No scenes. Write a text in the Text tab."],
  scenesHelp: ["Modifiez le texte, l'animation ou la durée de chaque scène.", "Text, Animation oder Dauer jeder Szene ändern.", "Edit each scene's text, animation or duration."],
  title: ["Titre", "Titel", "Title"], scene: ["Scène", "Szene", "Scene"],
  auto: ["auto", "auto", "auto"], seconds: ["s", "s", "s"],
  figures: ["Personnages", "Figuren", "Characters"],
  fromHere: ["▶ d'ici", "▶ ab hier", "▶ from here"], remove: ["Supprimer", "Löschen", "Delete"], addScene: ["+ Ajouter une scène", "+ Szene hinzufügen", "+ Add scene"],
  other: ["Autre", "Andere", "Other"],
  charMain: ["Personnage principal", "Hauptfigur", "Main character"], charSecond: ["Second personnage", "Zweite Figur", "Second character"],
  presets: ["Modèles", "Vorlagen", "Presets"],
  height: ["Taille", "Größe", "Height"], bodyBuild: ["Corpulence", "Statur", "Build"], belly: ["Ventre", "Bauch", "Belly"], headSize: ["Tête", "Kopf", "Head"],
  legs: ["Jambes", "Beine", "Legs"], arms: ["Bras", "Arme", "Arms"], torso: ["Buste", "Oberkörper", "Torso"],
  color: ["Couleur", "Farbe", "Color"], detail: ["Accessoires", "Accessoires", "Accessories"],
  hair: ["Cheveux", "Haare", "Hair"], hairNone: ["Aucun", "Keine", "None"], hairShort: ["Courts", "Kurz", "Short"], hairLong: ["Longs", "Lang", "Long"], hairBun: ["Chignon", "Dutt", "Bun"],
  glasses: ["Lunettes", "Brille", "Glasses"], beard: ["Barbe", "Bart", "Beard"], cap: ["Casquette", "Kappe", "Cap"], headband: ["Bandeau", "Stirnband", "Headband"],
  skirt: ["Jupe", "Rock", "Skirt"], tie: ["Cravate", "Krawatte", "Tie"],
  format: ["Format", "Format", "Format"], theme: ["Décor", "Hintergrund", "Background"],
  captionStyle: ["Sous-titres", "Untertitel", "Captions"], capWords: ["Mot par mot", "Wort für Wort", "Word by word"], capKaraoke: ["Karaoké", "Karaoke", "Karaoke"], capFull: ["Phrase entière", "Ganzer Satz", "Full sentence"],
  uppercase: ["MAJUSCULES", "GROSSBUCHSTABEN", "UPPERCASE"], captionScale: ["Taille du texte", "Textgröße", "Text size"], accent: ["Couleur d'accent", "Akzentfarbe", "Accent color"],
  handle: ["Signature (@pseudo)", "Signatur (@name)", "Watermark (@handle)"], progressBar: ["Barre de progression", "Fortschrittsbalken", "Progress bar"],
  wps: ["Vitesse (mots / seconde)", "Tempo (Wörter / Sekunde)", "Pace (words / second)"],
  voiceTitle: ["Voix off", "Sprecherstimme", "Voice-over"],
  voiceMode: ["Type de voix", "Art der Stimme", "Voice type"],
  voiceModeNeural: ["Voix naturelle (dans la vidéo)", "Natürliche Stimme (im Video)", "Natural voice (in the video)"],
  voiceModeSystem: ["Voix du téléphone (aperçu seulement)", "Systemstimme (nur Vorschau)", "Device voice (preview only)"],
  voiceModeOff: ["Pas de voix", "Keine Stimme", "No voice"],
  voice: ["Voix", "Stimme", "Voice"], voiceLang: ["Langue de la voix", "Sprache der Stimme", "Voice language"], rate: ["Débit", "Sprechtempo", "Rate"], pitch: ["Hauteur", "Tonhöhe", "Pitch"],
  voiceNarrator: ["Voix du narrateur", "Erzählerstimme", "Narrator voice"],
  voiceOfChar: ["Voix du personnage", "Stimme der Figur", "Voice of character"],
  voiceSpeed: ["Vitesse de la voix", "Sprechtempo", "Voice speed"],
  voiceEffect: ["Effet de voix", "Stimmeffekt", "Voice effect"], voicePitch: ["Hauteur (grave ↔ aiguë)", "Tonhöhe (tief ↔ hoch)", "Pitch (deep ↔ high)"],
  voiceFxApplying: ["Effet de voix…", "Stimmeffekt…", "Voice effect…"],
  fps: ["Images par seconde", "Bilder pro Sekunde", "Frames per second"], fps30: ["30 images/s (recommandé)", "30 B/s (empfohlen)", "30 fps (recommended)"],
  fps60: ["60 images/s (ultra fluide, ordinateur rapide)", "60 B/s (sehr flüssig, schneller PC)", "60 fps (ultra smooth, fast computer)"],
  voiceGenerate: ["Générer la voix", "Stimme erzeugen", "Generate the voice"],
  voiceDownload: ["Téléchargement de la voix (une seule fois)…", "Stimme wird geladen (nur einmal)…", "Downloading the voice (only once)…"],
  voiceGenerating: ["Génération de la voix… scène", "Stimme wird erzeugt… Szene", "Generating the voice… scene"],
  voiceReady: ["Voix prête", "Stimme bereit", "Voice ready"],
  voiceScenesReady: ["scènes ont leur voix — touchez « Générer la voix »", "Szenen haben ihre Stimme – „Stimme erzeugen“ tippen", "scenes have their voice — tap “Generate the voice”"],
  voiceError: ["La voix n'a pas pu être générée. Vérifiez la connexion Internet pour le premier téléchargement.", "Die Stimme konnte nicht erzeugt werden. Für den ersten Download Internetverbindung prüfen.", "The voice could not be generated. Check the Internet connection for the first download."],
  voiceNoNeural: ["Pas de voix naturelle pour cette langue : choisissez « Voix du téléphone » ou importez votre propre audio.", "Keine natürliche Stimme für diese Sprache: „Systemstimme“ wählen oder eigenes Audio importieren.", "No natural voice for this language: choose “Device voice” or import your own audio."],
  voiceNeuralHelp: [
    "Une vraie voix lit chaque scène et elle est enregistrée dans la vidéo. Les voix ✦ HD (Kokoro, 2025) sont les plus naturelles : français (femme), anglais, espagnol, italien, portugais. Les autres sont des voix standard. Tout est créé sur votre appareil, gratuitement : le premier usage télécharge le modèle (environ 90 Mo, 300 Mo avec une carte graphique récente), ensuite tout marche sans Internet. Une carte graphique récente rend la génération beaucoup plus rapide.",
    "Eine echte Stimme liest jede Szene und wird im Video aufgenommen. Die ✦ HD-Stimmen (Kokoro, 2025) klingen am natürlichsten: Französisch (Frau), Englisch, Spanisch, Italienisch, Portugiesisch. Die anderen sind Standardstimmen. Alles entsteht kostenlos auf deinem Gerät: Beim ersten Mal wird das Modell geladen (ca. 90 MB, 300 MB mit moderner Grafikkarte), danach geht alles offline. Eine moderne Grafikkarte macht die Erzeugung viel schneller.",
    "A real voice reads each scene and is recorded in the video. ✦ HD voices (Kokoro, 2025) are the most natural: French (woman), English, Spanish, Italian, Portuguese. The others are standard voices. Everything is created for free on your device: the first use downloads the model (about 90 MB, 300 MB with a recent graphics card), then everything works offline. A recent graphics card makes generation much faster.",
  ],
  voiceNote: [
    "La voix du téléphone sert seulement à l'aperçu : les navigateurs ne permettent pas de l'enregistrer dans le fichier. Pour une vidéo qui parle, choisissez « Voix naturelle ».",
    "Die Systemstimme dient nur der Vorschau: Browser erlauben nicht, sie in die Datei aufzunehmen. Für ein sprechendes Video „Natürliche Stimme“ wählen.",
    "The device voice is for preview only: browsers do not allow recording it into the file. For a talking video, choose “Natural voice”.",
  ],
  trackTitle: ["Votre propre audio", "Eigenes Audio", "Your own audio"],
  trackHelp: [
    "Importez une voix off enregistrée ailleurs (dictaphone, ElevenLabs, CapCut…) ou une musique (MP3, WAV, M4A). Elle est lue depuis le début de la vidéo et enregistrée dans l'export.",
    "Importiere eine anderswo aufgenommene Sprecherstimme (Diktiergerät, ElevenLabs, CapCut…) oder Musik (MP3, WAV, M4A). Sie läuft ab Videobeginn und wird im Export aufgenommen.",
    "Import a voice-over recorded elsewhere (voice recorder, ElevenLabs, CapCut…) or music (MP3, WAV, M4A). It plays from the start of the video and is recorded in the export.",
  ],
  trackImport: ["Importer un fichier audio", "Audiodatei importieren", "Import an audio file"],
  trackNone: ["Aucun fichier", "Keine Datei", "No file"],
  trackError: ["Ce fichier audio n'a pas pu être lu.", "Diese Audiodatei konnte nicht gelesen werden.", "This audio file could not be read."],
  music: ["Musique d'ambiance", "Hintergrundmusik", "Background music"], volume: ["Volume", "Lautstärke", "Volume"],
  mic: ["Enregistrer ma voix (micro) pendant l'export", "Meine Stimme (Mikrofon) beim Export aufnehmen", "Record my voice (microphone) during export"],
  exportBtn: ["Exporter la vidéo", "Video exportieren", "Export the video"], cancel: ["Annuler", "Abbrechen", "Cancel"],
  exportHelp: [
    "L'export se fait en temps réel (une vidéo de 3 minutes prend 3 minutes). Gardez l'écran allumé et cette page ouverte.",
    "Der Export läuft in Echtzeit (ein 3-Minuten-Video dauert 3 Minuten). Bildschirm anlassen und diese Seite offen lassen.",
    "Export runs in real time (a 3-minute video takes 3 minutes). Keep the screen on and this page open.",
  ],
  download: ["Télécharger", "Herunterladen", "Download"], share: ["Partager", "Teilen", "Share"],
  noRecorder: ["Ce navigateur ne sait pas enregistrer de vidéo. Utilisez Chrome, Edge ou Firefox récent.", "Dieser Browser kann kein Video aufnehmen. Chrome, Edge oder aktuelles Firefox verwenden.", "This browser cannot record video. Use a recent Chrome, Edge or Firefox."],
  duration: ["Durée", "Dauer", "Duration"],
  saveProject: ["Enregistrer le projet", "Projekt speichern", "Save project"], openProject: ["Ouvrir un projet", "Projekt öffnen", "Open project"],
  langUi: ["Langue", "Sprache", "Language"],
};

let current = 0;
export function setUiLang(l) { current = UI_LANGS[l] ?? 0; }
export function uiIndex() { return current; }
export function t(key) { return T[key]?.[current] ?? T[key]?.[0] ?? key; }
export function pick(arr) { return arr?.[current] ?? arr?.[0] ?? ""; }

export const EXAMPLES = {
  psy: {
    fr: `# Pourquoi tu ne montres plus rien
Tu souris à tout le monde.
[rire] Pourtant tu rigoles, même quand ça ne va pas.
Parce que certains soirs, le silence fait plus de bruit que les mots.
Tu as appris à ne plus rien attendre des autres.
Ce n'est pas de la froideur, c'est de la fatigue.
Les gens te jugent sans savoir ce que tu portes.
Mais un jour, tu comprends une chose.
Ton calme n'est pas une faiblesse, c'est ta force.
Alors tu respires, et tu avances.`,
    de: `# Warum du nichts mehr zeigst
Du lächelst alle an.
[lachen] Trotzdem lachst du, auch wenn es dir nicht gut geht.
Weil an manchen Abenden die Stille lauter ist als Worte.
Du hast gelernt, nichts mehr von anderen zu erwarten.
Das ist keine Kälte, das ist Müdigkeit.
Die Leute urteilen über dich, ohne zu wissen, was du trägst.
Aber eines Tages verstehst du etwas.
Deine Ruhe ist keine Schwäche, sie ist deine Stärke.
Also atmest du durch und gehst weiter.`,
    en: `# Why you don't show anything anymore
You smile at everyone.
[laugh] Yet you laugh, even when you're not okay.
Because some nights, the silence is louder than words.
You've learned to expect nothing from others.
It's not coldness, it's tiredness.
People judge you without knowing what you carry.
But one day, you understand something.
Your calm is not a weakness, it's your strength.
So you breathe, and you move on.`,
  },
  sport: {
    fr: `# 3 règles pour ne jamais abandonner
Tout le monde veut des résultats, personne ne veut la routine.
Règle numéro un : échauffe-toi, toujours.
Règle numéro deux : la force vient de la régularité, pas de la motivation.
Tu vas tomber, tu vas rater des séances.
Ce n'est pas grave, recommence le lendemain.
Règle numéro trois : cours ta propre course.
Et le jour où tu gagnes, souviens-toi de tous ces matins difficiles.`,
    de: `# 3 Regeln, um nie aufzugeben
Jeder will Ergebnisse, niemand will die Routine.
Regel Nummer eins: Wärm dich immer auf.
Regel Nummer zwei: Kraft kommt von Regelmäßigkeit, nicht von Motivation.
Du wirst fallen, du wirst Trainings verpassen.
Das ist nicht schlimm, fang am nächsten Tag wieder an.
Regel Nummer drei: Lauf dein eigenes Rennen.
Und an dem Tag, an dem du gewinnst, denk an all die schweren Morgen.`,
    en: `# 3 rules to never give up
Everyone wants results, nobody wants the routine.
Rule number one: always warm up.
Rule number two: strength comes from consistency, not motivation.
You will fall, you will miss workouts.
It doesn't matter, start again the next day.
Rule number three: run your own race.
And the day you win, remember all those hard mornings.`,
  },
  story: {
    fr: `# L'homme qui attendait sur le banc
Il était une fois un homme qui attendait chaque soir sur le même banc.
Les passants se moquaient de lui.
Lui ne disait rien, il regardait la route.
Un jour, une petite fille lui demanda ce qu'il attendait.
Il répondit : j'attends le courage de partir.
Le lendemain, le banc était vide.
Il avait enfin commencé à marcher.`,
    de: `# Der Mann, der auf der Bank wartete
Es war einmal ein Mann, der jeden Abend auf derselben Bank wartete.
Die Passanten lachten ihn aus.
Er sagte nichts, er schaute auf die Straße.
Eines Tages fragte ihn ein kleines Mädchen, worauf er warte.
Er antwortete: Ich warte auf den Mut zu gehen.
Am nächsten Tag war die Bank leer.
Er hatte endlich angefangen zu gehen.`,
    en: `# The man who waited on the bench
Once upon a time, a man waited every evening on the same bench.
People passing by made fun of him.
He said nothing, he watched the road.
One day, a little girl asked him what he was waiting for.
He answered: I'm waiting for the courage to leave.
The next day, the bench was empty.
He had finally started to walk.`,
  },
  dialogue: {
    fr: `# Le silence entre nous
Lui : Pourquoi tu ne dis plus rien ?
Elle : Parce que tu n'*écoutes* jamais vraiment.
Lui : [surpris] Moi ? Je suis toujours là pour toi.
Elle : Être là, ce n'est pas la même chose qu'*écouter*.
[pause]
Narrateur : Parfois, le plus grand *silence* vient de ceux qui parlent le plus.
Lui : [pense] Alors apprends-moi.
Elle : [joie] Commence par te taire, et regarde-moi.`,
    de: `# Die Stille zwischen uns
Er : Warum sagst du nichts mehr?
Sie : Weil du nie wirklich *zuhörst*.
Er : [überrascht] Ich? Ich bin doch immer für dich da.
Sie : Da sein ist nicht dasselbe wie *zuhören*.
[pause]
Erzähler : Manchmal kommt die größte *Stille* von denen, die am meisten reden.
Er : [denken] Dann bring es mir bei.
Sie : [freude] Fang an zu schweigen, und sieh mich an.`,
    en: `# The silence between us
Him : Why don't you say anything anymore?
Her : Because you never really *listen*.
Him : [surprised] Me? I'm always there for you.
Her : Being there isn't the same as *listening*.
[pause]
Narrator : Sometimes the biggest *silence* comes from those who talk the most.
Him : [think] Then teach me.
Her : [celebrate] Start by being quiet, and look at me.`,
  },
};
