/** Common named HTML entities that show up in Anki field text. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const codePoint = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isNaN(codePoint)) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body]! : match;
  });
}

/**
 * Convert raw Anki field HTML into plain text suitable for a flashcard's text field.
 *
 * Strips tags (keeping their text content, with a space inserted at tag boundaries so
 * adjacent inline elements don't get glued together), decodes common entities, collapses
 * cloze deletion syntax down to just the answer text, drops [sound:...] references (the
 * caller resolves those separately via the media manifest), and normalizes whitespace.
 */
export function stripAnkiHtml(html: string): string {
  if (!html) return '';

  let text = html;

  // [sound:filename] references are not text content.
  text = text.replace(/\[sound:[^\]]*\]/g, ' ');

  // Cloze deletions: {{c1::answer::hint}} or {{c1::answer}} -> answer.
  text = text.replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, (_match, answer: string) => answer);

  // Tags -> a space, so "<b>Hello</b><i>World</i>" becomes "Hello World" not "HelloWorld".
  text = text.replace(/<[^>]*>/g, ' ');

  text = decodeEntities(text);

  // Collapse whitespace introduced by tag removal / originally present, then trim.
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}
