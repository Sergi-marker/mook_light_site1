// © la triche — Animots
// Lieu, météo, moment de la journée et expression du visage déduits du texte.
// Module pur (aucun accès au DOM) : testable sous Node.
//
// Les mots-clés sont sans accents et en minuscules (comme normalize() de script.js) ;
// les espaces autour d'un mot évitent les faux amis (« parce que » ≠ « parc », « je bois » ≠ « les bois »).

import { normalize, plainText } from "./script.js";

/** Lieu → mots-clés (FR, DE, EN, ES). Le premier qui correspond gagne, dans l'ordre du tableau. */
export const PLACE_KEYWORDS = [
  ["space", ["dans l'espace", "l'espace interstellaire", "astronaute", " fusee", "planete", "galaxie", "weltall", "weltraum", "astronaut", "rakete", "outer space", "in space", "into space", " rocket", " planet", "galaxy", "el espacio", "astronauta", "cohete", "planeta", "galaxia"]],
  ["sky", ["etoiles", "ciel etoile", "nuit etoilee", " sterne", "sternenhimmel", " stars ", "starry", "estrellas"]],
  ["cemetery", ["cimetiere", "tombeau", "sur la tombe", "sa tombe", "une tombe", "funerailles", "enterrement", "obseques", "friedhof", " am grab", "beerdigung", "cemetery", "graveyard", "his grave", "her grave", "the grave", "funeral", "cementerio", "tumba", "entierro"]],
  ["hospital", ["hopital", "clinique", "urgences", "chez le medecin", "le medecin", "le docteur", "infirmiere", "krankenhaus", "klinik", "beim arzt", "hospital", "clinic", "the doctor", " nurse", "clinica", "el medico", "enfermera"]],
  ["station", [" gare ", "la gare", "le train", "un train", "du train", "les trains", " le bus", "un bus", "en bus", "arret de bus", " metro ", " quai ", "bahnhof", "haltestelle", " zug ", " im bus", "the train", "a train", " trains", "the bus", "bus stop", "subway", "railway", "estacion", "autobus", "parada", " tren "]],
  ["stage", ["sur scene", "sur la scene", "spectacle", "concert", "theatre", "le rideau", "applaudi", "buhne", "konzert", "theater", "auftritt", "on stage", "the stage", "audience", "applause", "escenario", "concierto", "teatro"]],
  ["classroom", ["l'ecole", "a l'ecole", "en classe", "la classe", "salle de classe", "professeur", " la prof ", " le prof ", "maitresse", "eleves", "college", "lycee", "schule", "klasse", "lehrer", "unterricht", "school", "classroom", "teacher", " class ", "escuela", "colegio", " clase", "profesor", "maestra"]],
  ["library", ["bibliotheque", "librairie", "bibliothek", "bucherei", "library", "bookstore", "biblioteca", "libreria"]],
  ["office", ["au bureau", "le bureau", "mon bureau", "au travail", "mon travail", "au boulot", "mon boulot", "collegue", " patron", "reunion", "entreprise", " buro", "auf der arbeit", "zur arbeit", "kollege", " chef ", "meeting", "office", "at work", " boss", "coworker", "colleague", "oficina", "el trabajo", " jefe"]],
  ["kitchen", ["cuisine", "cuisin", " frigo", "casserole", " kuche", " kochen", " kocht", "kitchen", " cook ", " cooking", " cooks ", "fridge", "cocina", "nevera"]],
  ["cafe", [" au cafe", " le cafe ", " un cafe ", "bistrot", "terrasse", " bar ", "restaurant", " resto ", "serveur", "serveuse", " im cafe", "kneipe", "kellner", "coffee shop", " cafe ", "cafeteria", "waiter", "restaurante", "camarero"]],
  ["livingroom", [" salon", "canape", " sofa", " tele ", "television", "wohnzimmer", " couch", "fernseh", "living room", " tv ", "sala de estar", "television"]],
  ["room", ["chambre", "mon lit", "son lit", "ton lit", "au lit", "le lit", "schlafzimmer", "im bett", "bedroom", "my bed", "dormitorio", "habitacion", "mi cama"]],
  ["gym", ["salle de sport", "salle de muscu", " gym", "fitness", "gimnasio"]],
  ["beach", ["plage", "la mer ", " mer ", "ocean", "vagues", " sable", "strand", " meer", "beach", "the sea ", " sea ", "waves", "playa", " mar ", " olas"]],
  ["desert", [" desert ", "sahara", " dune", " wuste", "desierto"]],
  ["mountain", ["montagne", "randonnee", "les alpes", " berg ", " berge ", "bergen", "gebirge", "mountain", " hike", " hiking", " alps", "montana", "cordillera"]],
  ["forest", ["foret", "dans les bois", "au bois", "le bois ", "arbres", " wald", "forest", " woods", "jungle", "bosque", "selva"]],
  ["countryside", ["campagne", "la ferme", "une ferme", "a la ferme", " champ ", " champs ", "les vaches", "tracteur", "bauernhof", "auf dem land", " dorf", " feld ", "countryside", " farm", "village", " field", "el campo", "granja", " pueblo"]],
  ["park", [" parc ", " parcs ", " jardin", " park ", " garten", "garden", "parque"]],
  ["city", ["en ville", "la ville", " rue ", "la rue", "trottoir", "centre-ville", " stadt", "strasse", " city", "street", "downtown", "ciudad", " calle"]],
];

/** Météo → mots-clés. */
export const WEATHER_KEYWORDS = [
  ["storm", ["orage", "tempete", "tonnerre", "gewitter", " sturm", "donner", " storm", "thunder", "tormenta", "trueno", "relampago"]],
  ["rain", [" pleut", "pluie", "pleuvoir", "averse", "parapluie", " regen ", " regnet", " rain", "raining", "rainy", "umbrella", "lluvia", "llueve", "llover", "paraguas"]],
  ["snow", ["neige", "flocon", "schnee", "schneit", " snow", "nieve", "nevando", "nieva"]],
  ["fog", ["brouillard", "brume", " nebel", " fog", "foggy", " mist ", "misty", "niebla", "neblina"]],
  ["leaves", [" le vent", " du vent", "feuilles mortes", "les feuilles", "automne", " wind ", "windig", " herbst", "blatter", "autumn", " windy", "the wind", "leaves fall", "falling leaves", " viento", " otono", " hojas"]],
  ["confetti", [" fete", "anniversaire", "confetti", " party", "birthday", "geburtstag", " feier", " fiesta", "cumpleanos", "celebration"]],
  ["petals", ["petales", "cerisier", "mariage", " printemps", "bluten", "fruhling", "hochzeit", "petals", "cherry blossom", "wedding", " springtime", "petalos", "primavera", " boda"]],
];

/** Moment de la journée → mots-clés. */
export const TIME_KEYWORDS = [
  ["night", ["la nuit", "cette nuit", "ce soir", "minuit", " nacht", "heute abend", "mitternacht", " night", "tonight", "midnight", " noche", "medianoche"]],
  ["sunset", ["coucher de soleil", "crepuscule", "le soir", "sonnenuntergang", "dammerung", " abend", "sunset", " dusk", "evening", "atardecer", "puesta de sol"]],
  ["day", ["le matin", "ce matin", "en plein jour", " midi ", "grand soleil", "morgens", "mittag", "morning", " noon", "sunny", "por la manana", "mediodia"]],
];

/** Expression du visage → mots-clés (les plus précises d'abord). */
export const EXPRESSION_KEYWORDS = [
  ["cry", ["pleure", "larmes", "sanglot", " weint", "tranen", " cry", "crying", " cries", " tears", " llora", "lagrimas"]],
  ["laugh", [" rire", " rit ", " rient", "rigol", " mdr", " lol ", " lacht ", " lachen", "laugh", "haha", " rie ", " risa", "carcajada"]],
  ["shocked", ["choque", "stupefait", "sidere", "abasourdi", "bouche bee", "schockiert", "fassungslos", "shocked", "stunned", "speechless", "conmocionado", "impactado", "atonito"]],
  ["surprised", ["etonne", "surpris", " wow", "waouh", "incroyable", "uberrascht", "erstaunt", "unglaublich", "surprised", "amazed", "incredible", "unbelievable", "sorprendid", "increible", "asombrado"]],
  ["fear", [" peur", "effraye", "terrifie", "terreur", " angst", " furcht", "erschrocken", "afraid", "scared", "terrified", " fear", " miedo", "asustad", "aterrad"]],
  ["disgust", ["degout", "beurk", " berk", "degueu", "ecoeur", " ekel", "igitt", "eklig", "disgust", "that's gross", "so gross", " yuck", " asco", " puaj"]],
  ["suspicious", ["intrigue", "mefiant", "louche", "soupcon", "suspect", "misstrau", "verdacht", "suspicious", "sospech", "desconfi"]],
  ["worried", ["inquiet", "angoiss", " stresse", "soucieux", "besorgt", " sorgen", "nervos", "worried", "anxious", "nervous", "preocupad", "nervios"]],
  ["angry", ["colere", "furieux", "furieuse", "enerve", " rage", "wutend", " wut ", " sauer", "angry", "furious", " mad ", "enojad", "furios", "rabia"]],
  ["dizzy", ["vertige", "etourdi", "la tete qui tourne", "schwindel", "dizzy", "mareado"]],
  ["pain", ["douleur", " aie ", "j'ai mal", "fait mal", " blesse ", " blessee", " blesses ", "schmerz", "autsch", " aua ", "in pain", "the pain", "painful", " hurts", " ouch", " dolor", " duele"]],
  ["love", ["amoureux", "amoureuse", "je t'aime", "verliebt", "ich liebe dich", "in love", "i love you", "enamorad", "te quiero", "te amo"]],
  ["shy", ["timide", " gene ", " genee", "rougi", "embarrass", "schuchtern", "verlegen", " shy", "blush", "timid", "verguenza"]],
  ["bored", ["ennui", "ennuy", "langweil", " bored", "boring", "aburrid", "aburre"]],
  ["determined", ["determine", "motive", "determination", "rien ne m'arretera", "entschlossen", "motiviert", "determined", "motivated", "determinad", "motivad"]],
  ["proud", [" fier ", " fiere", "fierte", " stolz", " proud", "orgullo"]],
  ["pensive", ["pensif", "pensive", "songeur", "songeuse", "reveur", "reveuse", "nachdenklich", "thoughtful", "lost in thought", "pensativ"]],
  ["sad", ["triste", "chagrin", "malheureu", "traurig", " sad ", " sadness", "unhappy", " sadly"]],
  ["joy", [" joie", "heureux", "heureuse", "bonheur", " ravi ", " ravie", " freude", "glucklich", " happy", " joy ", " feliz", "alegria"]],
  ["happy", ["sourit", "sourire", "souriant", "lachelt", "lacheln", " smile", " smiling", "sonrie", "sonrisa"]],
];

/** Réaction de celui qui écoute (dialogue) à l'émotion de celui qui parle. Plusieurs choix : varie selon la scène. */
export const REACTIONS = {
  joy: ["happy"], happy: ["happy"], laugh: ["happy", "laugh"], proud: ["happy", "proud"], love: ["shy", "love"], shy: ["happy"],
  sad: ["worried"], cry: ["worried", "sad"], angry: ["fear", "worried"], surprised: ["shocked", "surprised"], shocked: ["surprised", "shocked"],
  suspicious: ["worried"], fear: ["worried"], disgust: ["suspicious", "disgust"], worried: ["pensive", "worried"], bored: ["bored", "suspicious"],
  determined: ["determined", "proud"], dizzy: ["worried"], pain: ["worried", "shocked"], pensive: ["pensive"],
};

function firstMatch(table, text) {
  const n = normalize(plainText(text));
  for (const [id, words] of table) {
    if (words.some((w) => n.includes(w))) return id;
  }
  return null;
}

/** Lieu (id de décor du rendu) déduit d'une phrase, ou null. */
export function detectPlace(text) {
  return firstMatch(PLACE_KEYWORDS, text);
}

/** Météo (rain, snow, storm, fog, leaves, confetti, petals) déduite d'une phrase, ou null. */
export function detectWeather(text) {
  return firstMatch(WEATHER_KEYWORDS, text);
}

/** Moment de la journée (day, sunset, night) déduit d'une phrase, ou null. */
export function detectTimeOfDay(text) {
  return firstMatch(TIME_KEYWORDS, text);
}

/** Expression du visage déduite d'une phrase, ou null. */
export function detectExpression(text) {
  return firstMatch(EXPRESSION_KEYWORDS, text);
}

/** Expression de réaction de l'autre personnage (seed : pour varier d'une scène à l'autre), ou null. */
export function reactionTo(expr, seed = 0) {
  const list = REACTIONS[expr];
  if (!list) return null;
  return list[Math.abs(Math.floor(seed)) % list.length];
}
