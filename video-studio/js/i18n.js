// Textes de l'interface : français, allemand, anglais.

export const UI_LANGS = { fr: 0, de: 1, en: 2 };

const T = {
  appTitle: ["Vidéo Studio", "Video Studio", "Video Studio"],
  tagline: ["Collez un texte, il devient une vidéo animée.", "Text einfügen – daraus wird ein animiertes Video.", "Paste a text, it becomes an animated video."],
  play: ["Lecture", "Abspielen", "Play"], pause: ["Pause", "Pause", "Pause"],
  tabText: ["Texte", "Text", "Text"], tabScenes: ["Scènes", "Szenen", "Scenes"], tabChars: ["Personnages", "Figuren", "Characters"],
  tabStyle: ["Style", "Stil", "Style"], tabSound: ["Voix & musique", "Stimme & Musik", "Voice & music"], tabExport: ["Exporter", "Exportieren", "Export"], tabAccount: ["Compte & offres", "Konto & Tarife", "Account & plans"],
  textLabel: ["Votre texte", "Dein Text", "Your text"],
  textHelp: [
    "Une phrase = une scène. Une ligne qui commence par # devient un titre. Pour imposer une animation : [rire], [triste], [pense], [court], [muscu], [parle]… en début de phrase.",
    "Ein Satz = eine Szene. Eine Zeile mit # am Anfang wird ein Titel. Animation erzwingen: [lachen], [traurig], [denken], [laufen], [sport], [reden]… am Satzanfang.",
    "One sentence = one scene. A line starting with # becomes a title. To force an animation: [laugh], [sad], [think], [run], [lift], [talk]… at the start of a sentence.",
  ],
  build: ["Créer la vidéo", "Video erstellen", "Create the video"],
  examples: ["Exemples", "Beispiele", "Examples"],
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
  voiceGenerate: ["Générer la voix", "Stimme erzeugen", "Generate the voice"],
  voiceDownload: ["Téléchargement de la voix (une seule fois)…", "Stimme wird geladen (nur einmal)…", "Downloading the voice (only once)…"],
  voiceGenerating: ["Génération de la voix… scène", "Stimme wird erzeugt… Szene", "Generating the voice… scene"],
  voiceReady: ["Voix prête", "Stimme bereit", "Voice ready"],
  voiceScenesReady: ["scènes ont leur voix — touchez « Générer la voix »", "Szenen haben ihre Stimme – „Stimme erzeugen“ tippen", "scenes have their voice — tap “Generate the voice”"],
  voiceError: ["La voix n'a pas pu être générée. Vérifiez la connexion Internet pour le premier téléchargement.", "Die Stimme konnte nicht erzeugt werden. Für den ersten Download Internetverbindung prüfen.", "The voice could not be generated. Check the Internet connection for the first download."],
  voiceNoNeural: ["Pas de voix naturelle pour cette langue : choisissez « Voix du téléphone » ou importez votre propre audio.", "Keine natürliche Stimme für diese Sprache: „Systemstimme“ wählen oder eigenes Audio importieren.", "No natural voice for this language: choose “Device voice” or import your own audio."],
  voiceNeuralHelp: [
    "Une vraie voix lit chaque scène, et elle est enregistrée dans la vidéo exportée. Chaque scène dure le temps de sa phrase et les sous-titres suivent la voix. La voix est créée sur votre appareil : le premier usage télécharge le modèle de voix (20 à 75 Mo), ensuite tout marche sans Internet. Après une modification du texte, touchez à nouveau « Générer la voix » (c'est aussi fait automatiquement à l'export).",
    "Eine echte Stimme liest jede Szene und wird im exportierten Video aufgenommen. Jede Szene dauert so lange wie ihr Satz, die Untertitel folgen der Stimme. Die Stimme entsteht auf deinem Gerät: Beim ersten Mal wird das Stimmmodell geladen (20 bis 75 MB), danach geht alles offline. Nach Textänderungen erneut „Stimme erzeugen“ tippen (beim Export passiert das automatisch).",
    "A real voice reads each scene and is recorded in the exported video. Each scene lasts as long as its sentence and the captions follow the voice. The voice is created on your device: the first use downloads the voice model (20 to 75 MB), then everything works offline. After editing the text, tap “Generate the voice” again (export also does it automatically).",
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
};
