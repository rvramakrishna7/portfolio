// Turns one long block of email text into short paragraphs:
//   greeting, two body paragraphs, the closing question on its own line, then the link on its own line.
// Text that already has paragraph breaks (the owner edited it, or it was structured before) is left alone.

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z])/;
const GREETING = /^(Hi|Hello|Hey|Dear)\b[^,.!?\n]{0,40},\s*/;

export function structureEmailBody(text: string): string {
  const input = (text ?? "").trim();
  if (!input) return input;
  if (/\n\s*\n/.test(input)) return input;

  let rest = input.replace(/\s+/g, " ");

  // Link at the very end goes on its own line
  let link = "";
  const linkMatch = rest.match(/\s(https?:\/\/\S+)$/);
  if (linkMatch) {
    link = linkMatch[1];
    rest = rest.slice(0, rest.length - linkMatch[0].length).trim();
  }

  // Greeting on its own line
  let greeting = "";
  const greetMatch = rest.match(GREETING);
  if (greetMatch) {
    greeting = greetMatch[0].trim();
    rest = rest.slice(greetMatch[0].length).trim();
    if (rest) rest = rest[0].toUpperCase() + rest.slice(1);
  }

  const sentences = rest.split(SENTENCE_SPLIT).filter(Boolean);

  // Closing question on its own line
  let question = "";
  if (sentences.length > 1 && sentences[sentences.length - 1].trim().endsWith("?")) {
    question = sentences.pop() as string;
  }

  // Body into two paragraphs when there is enough to split
  const paragraphs: string[] = [];
  if (sentences.length >= 3) {
    const cut = Math.ceil(sentences.length / 2);
    paragraphs.push(sentences.slice(0, cut).join(" "), sentences.slice(cut).join(" "));
  } else if (sentences.length > 0) {
    paragraphs.push(sentences.join(" "));
  }

  return [greeting, ...paragraphs, question, link].filter((part) => part && part.trim()).join("\n\n");
}
