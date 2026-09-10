/**
 * Curated closed-class / function-word lemmas per target language.
 *
 * Used by the /targets coverage assessment: these lemmas are reported as their own
 * band (total count + bridge coverage %), and are excluded from the subsequent
 * 500-lemma content bands. Lists are compact inventories of articles, pronouns,
 * prepositions, conjunctions, and common auxiliaries/particles — not full POS tags
 * from the spoken-frequency lists (which have none).
 */

const ES = [
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo',
  'yo', 'tú', 'tu', 'él', 'ella', 'usted', 'nosotros', 'nosotras', 'vosotros', 'vosotras',
  'ellos', 'ellas', 'ustedes', 'me', 'te', 'le', 'les', 'nos', 'os', 'se', 'mí', 'ti', 'sí',
  'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'nuestro', 'nuestra', 'nuestros', 'nuestras',
  'vuestro', 'vuestra', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
  'aquel', 'aquella', 'aquellos', 'aquellas', 'esto', 'eso', 'aquello',
  'qué', 'que', 'quién', 'quien', 'cuál', 'cual', 'cuáles', 'dónde', 'donde', 'cuándo',
  'cuando', 'cómo', 'como', 'por qué', 'porque',
  'y', 'e', 'o', 'u', 'pero', 'sino', 'aunque', 'si', 'ni',
  'a', 'ante', 'bajo', 'con', 'contra', 'de', 'desde', 'durante', 'en', 'entre', 'hacia',
  'hasta', 'para', 'por', 'según', 'sin', 'sobre', 'tras',
  'no', 'sí', 'también', 'tampoco', 'ya', 'aún', 'aun', 'solo', 'sólo', 'muy', 'más', 'menos',
  'aquí', 'ahí', 'allí', 'allá',
  'ser', 'soy', 'eres', 'es', 'somos', 'sois', 'son', 'era', 'fue', 'fueron', 'será',
  'estar', 'estoy', 'está', 'están', 'estaba', 'estuvo',
  'haber', 'he', 'ha', 'han', 'había', 'hubo', 'hay',
  'tener', 'tengo', 'tiene', 'tienen', 'tener',
  'poder', 'puedo', 'puede', 'pueden', 'deber', 'debe', 'querer', 'quiere', 'ir', 'va', 'van',
  'todo', 'toda', 'todos', 'todas', 'nada', 'algo', 'alguien', 'nadie', 'cada', 'otro', 'otra',
];

const FR = [
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'l',
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'lui',
  'leur', 'y', 'en', 'moi', 'toi', 'soi', 'eux',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos',
  'leur', 'leurs', 'ce', 'cet', 'cette', 'ces', 'ceci', 'cela', 'ça',
  'qui', 'que', 'quoi', 'dont', 'où', 'quel', 'quelle', 'quels', 'quelles', 'comment',
  'quand', 'pourquoi', 'combien',
  'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'si', 'que', 'parce',
  'à', 'au', 'aux', 'avec', 'chez', 'dans', 'de', 'des', 'du', 'en', 'entre', 'par', 'pour',
  'sans', 'sous', 'sur', 'vers', 'chez', 'pendant', 'depuis', 'avant', 'après', 'contre',
  'ne', 'pas', 'plus', 'jamais', 'rien', 'personne', 'aussi', 'encore', 'déjà', 'très',
  'ici', 'là', 'oui', 'non',
  'être', 'suis', 'es', 'est', 'sommes', 'êtes', 'sont', 'étais', 'était', 'été', 'sera',
  'avoir', 'ai', 'as', 'a', 'avons', 'avez', 'ont', 'avais', 'avait', 'eu',
  'faire', 'fais', 'fait', 'aller', 'vais', 'va', 'vont', 'pouvoir', 'peux', 'peut', 'peuvent',
  'devoir', 'dois', 'doit', 'vouloir', 'veux', 'veut', 'savoir', 'sais', 'sait',
  'tout', 'toute', 'tous', 'toutes', 'chaque', 'autre', 'autres', 'même', 'quelque', 'quelques',
];

const IT = [
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'dei', 'degli', 'delle',
  'io', 'tu', 'lui', 'lei', 'egli', 'ella', 'noi', 'voi', 'loro', 'mi', 'ti', 'si', 'ci', 'vi',
  'me', 'te', 'sé', 'gli', 'le', 'loro',
  'mio', 'mia', 'miei', 'mie', 'tuo', 'tua', 'tuoi', 'tue', 'suo', 'sua', 'suoi', 'sue',
  'nostro', 'nostra', 'nostri', 'nostre', 'vostro', 'vostra', 'vostri', 'vostre',
  'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'quelli', 'quelle', 'ciò',
  'chi', 'che', 'cosa', 'dove', 'quando', 'come', 'perché', 'quale', 'quali', 'quanto',
  'e', 'ed', 'o', 'od', 'ma', 'però', 'anzi', 'se', 'né', 'perché', 'mentre', 'quando',
  'a', 'ad', 'di', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'sopra', 'sotto', 'tra',
  'verso', 'senza', 'durante', 'dopo', 'prima', 'contro',
  'non', 'anche', 'ancora', 'già', 'solo', 'molto', 'più', 'meno', 'qui', 'qua', 'lì', 'là',
  'sì', 'no',
  'essere', 'sono', 'sei', 'è', 'siamo', 'siete', 'ero', 'era', 'stato', 'sarà',
  'avere', 'ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno', 'avevo', 'aveva', 'avuto',
  'fare', 'faccio', 'fa', 'andare', 'vado', 'va', 'potere', 'posso', 'può', 'dovere', 'devo',
  'deve', 'volere', 'voglio', 'vuole', 'sapere', 'so', 'sa',
  'tutto', 'tutta', 'tutti', 'tutte', 'ogni', 'altro', 'altra', 'niente', 'nulla', 'qualcosa',
  'qualcuno', 'nessuno',
];

const PT = [
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'eu', 'tu', 'você', 'ele', 'ela', 'nós', 'vós', 'vocês', 'eles', 'elas', 'me', 'te', 'lhe',
  'lhes', 'nos', 'vos', 'se', 'mim', 'ti', 'si',
  'meu', 'minha', 'meus', 'minhas', 'teu', 'tua', 'teus', 'tuas', 'seu', 'sua', 'seus', 'suas',
  'nosso', 'nossa', 'nossos', 'nossas', 'vosso', 'vossa',
  'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas', 'aquele', 'aquela',
  'aqueles', 'aquelas', 'isto', 'isso', 'aquilo',
  'que', 'quem', 'onde', 'quando', 'como', 'porque', 'porquê', 'qual', 'quais', 'quanto',
  'e', 'ou', 'mas', 'porém', 'todavia', 'se', 'nem', 'embora', 'enquanto',
  'a', 'ante', 'após', 'até', 'com', 'contra', 'de', 'desde', 'em', 'entre', 'para', 'per',
  'perante', 'por', 'sem', 'sob', 'sobre', 'trás',
  'não', 'sim', 'também', 'ainda', 'já', 'só', 'muito', 'mais', 'menos', 'aqui', 'ali', 'lá',
  'ser', 'sou', 'és', 'é', 'somos', 'sois', 'são', 'era', 'foi', 'foram', 'será',
  'estar', 'estou', 'está', 'estão', 'estava', 'esteve',
  'haver', 'há', 'ter', 'tenho', 'tem', 'têm', 'tinha', 'teve',
  'poder', 'posso', 'pode', 'podem', 'dever', 'deve', 'querer', 'quero', 'quer', 'ir', 'vou',
  'vai', 'vão', 'saber', 'sei', 'sabe',
  'todo', 'toda', 'todos', 'todas', 'cada', 'outro', 'outra', 'nada', 'algo', 'alguém',
  'ninguém',
];

const RO = [
  'un', 'o', 'ului', 'unei', 'niște', 'al', 'a', 'ai', 'ale',
  'eu', 'tu', 'el', 'ea', 'noi', 'voi', 'ei', 'ele', 'mă', 'te', 'îl', 'o', 'ne', 'vă', 'îi', 'le',
  'îmi', 'îți', 'își', 'meu', 'mea', 'mei', 'mele', 'tău', 'ta', 'tăi', 'tale', 'său', 'sa',
  'săi', 'sale', 'nostru', 'noastră', 'vostru', 'voastră',
  'acest', 'această', 'acești', 'aceste', 'acel', 'acea', 'acei', 'acele', 'asta', 'aia',
  'ce', 'cine', 'unde', 'când', 'cum', 'de ce', 'care', 'cât',
  'și', 'sau', 'dar', 'însă', 'că', 'dacă', 'deși', 'când', 'pentru',
  'în', 'pe', 'la', 'de', 'din', 'cu', 'fără', 'peste', 'sub', 'după', 'înainte', 'lângă',
  'despre', 'prin', 'către', 'între',
  'nu', 'da', 'și', 'doar', 'deja', 'foarte', 'mai', 'aici', 'acolo',
  'fi', 'sunt', 'ești', 'este', 'e', 'suntem', 'sunteți', 'sunt', 'era', 'a fost',
  'avea', 'am', 'ai', 'are', 'avem', 'aveți', 'au', 'avea',
  'putea', 'pot', 'poți', 'poate', 'trebui', 'trebuie', 'vrea', 'vreau', 'vrei', 'vrea',
  'face', 'fac', 'faci', 'face', 'merge', 'merg',
  'tot', 'toată', 'toți', 'toate', 'fiecare', 'alt', 'altă', 'nimic', 'ceva', 'cineva', 'nimeni',
];

/** Lowercased lemma lists keyed by ISO-ish target code. */
export const CLOSED_CLASS_LEMMAS: Record<string, readonly string[]> = {
  es: ES,
  fr: FR,
  it: IT,
  pt: PT,
  ro: RO,
};

export function closedClassSet(targetCode: string): Set<string> | null {
  const list = CLOSED_CLASS_LEMMAS[targetCode];
  if (!list) return null;
  return new Set(list.map((lemma) => lemma.toLowerCase()));
}
