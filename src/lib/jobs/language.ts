/**
 * Lightweight, zero-dependency language detection based on stopword scoring
 * and script analysis.
 */

export type DetectedLanguage =
  | "English"
  | "Dutch"
  | "German"
  | "French"
  | "Spanish"
  | "Portuguese"
  | "Italian"
  | "non-latin";

export interface LanguageDetectionResult {
  language: DetectedLanguage;
  confidence: number;
  reason?: string;
}

// ~25 common stopwords per language
const STOPWORDS: Record<Exclude<DetectedLanguage, "English" | "non-latin">, readonly string[]> = {
  Dutch: [
    "de", "het", "een", "van", "en", "voor", "met", "wij", "je", "ons",
    "bij", "naar", "werken", "op", "te", "zijn", "is", "dat", "die", "om",
    "als", "over", "door", "heeft", "worden", "ook", "niet", "aan",
  ],
  German: [
    "der", "die", "das", "und", "wir", "mit", "für", "ihr", "sie", "den",
    "dem", "des", "zu", "im", "von", "auf", "nicht", "eine", "einer", "einem",
    "einen", "sich", "auch", "bei", "nach", "aus",
  ],
  French: [
    "le", "la", "les", "des", "nous", "vous", "pour", "avec", "dans", "un",
    "une", "du", "qui", "sur", "est", "sont", "par", "au", "aux", "ce",
    "cette", "plus", "pas", "notre", "votre", "en",
  ],
  Spanish: [
    "el", "los", "las", "para", "con", "nosotros", "usted", "en", "de", "que",
    "un", "una", "por", "del", "al", "es", "son", "se", "como", "su",
    "sus", "mas", "más", "pero", "este", "esta", "nuestro",
  ],
  Portuguese: [
    "os", "as", "para", "com", "nós", "você", "de", "em", "um", "uma",
    "do", "da", "dos", "das", "no", "na", "nos", "nas", "por", "que",
    "se", "mais", "como", "seu", "sua", "nosso", "nossa",
  ],
  Italian: [
    "il", "gli", "per", "con", "noi", "che", "di", "del", "della", "delle",
    "dei", "degli", "nel", "nella", "un", "una", "uno", "sono", "come", "non",
    "anche", "più", "questo", "questa", "nostro", "nostra",
  ],
};

const ENGLISH_STOPWORDS = new Set([
    "the", "and", "to", "of", "a", "in", "is", "that", "for", "it",
    "as", "was", "with", "be", "by", "on", "not", "he", "i", "this",
    "are", "or", "from", "at", "an", "your", "all", "we", "can", "will",
    "our", "my", "one", "all", "about", "who", "which", "their", "has",
]);

/**
 * Detects whether the primary language of the title and description snippet is English.
 * Returns DetectedLanguage ("English", "Dutch", "German", "French", "Spanish", "Portuguese", "Italian", "non-latin").
 */
export function detectLanguage(
  title: string,
  description: string
): LanguageDetectionResult {
  const sample = `${title} ${description.slice(0, 800)}`;
  const trimmed = sample.trim();

  // 1. Check script first (before word token count): non-Latin scripts (CJK, Cyrillic, Arabic, Devanagari) > 30% of letters => "non-latin"
  let nonLatinLetterCount = 0;
  let totalLetterCount = 0;
  for (const char of sample) {
    if (/\p{L}/u.test(char)) {
      totalLetterCount++;
      // Latin letters: Basic Latin + Latin-1 Supplement + Latin Extended A/B
      if (!/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/i.test(char)) {
        nonLatinLetterCount++;
      }
    }
  }

  if (totalLetterCount > 20 && nonLatinLetterCount / totalLetterCount > 0.3) {
    return {
      language: "non-latin",
      confidence: nonLatinLetterCount / totalLetterCount,
      reason: "Significant non-Latin script detected",
    };
  }

  // If description is empty or very short (< 20 words), default to English
  const tokens = trimmed.toLowerCase().match(/\b[a-zà-ÿ0-9-]+\b/gi) || [];
  if (tokens.length < 20) {
    return { language: "English", confidence: 1 };
  }

  // Stopword scoring
  let englishMatches = 0;
  for (const token of tokens) {
    if (ENGLISH_STOPWORDS.has(token)) {
      englishMatches++;
    }
  }

  const scores: Record<string, number> = {};
  for (const [lang, words] of Object.entries(STOPWORDS)) {
    const wordSet = new Set(words);
    let count = 0;
    for (const token of tokens) {
      if (wordSet.has(token)) {
        count++;
      }
    }
    scores[lang] = count;
  }

  // Find best scoring non-English language
  let bestNonEnglishLang: Exclude<DetectedLanguage, "English" | "non-latin"> | null = null;
  let bestNonEnglishScore = 0;

  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestNonEnglishScore) {
      bestNonEnglishScore = score;
      bestNonEnglishLang = lang as Exclude<DetectedLanguage, "English" | "non-latin">;
    }
  }

  // If a non-English language scores clearly higher than English
  // (e.g. at least 5 matches and exceeds English matches)
  if (bestNonEnglishLang && bestNonEnglishScore >= 5 && bestNonEnglishScore > englishMatches) {
    return {
      language: bestNonEnglishLang,
      confidence: bestNonEnglishScore / (bestNonEnglishScore + englishMatches || 1),
      reason: `High frequency of ${bestNonEnglishLang} stopwords (${bestNonEnglishScore} vs ${englishMatches} English)`,
    };
  }

  return {
    language: "English",
    confidence: 1,
  };
}
