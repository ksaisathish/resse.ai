/**
 * Turns the agent's markdown reply into something a speech engine should
 * actually say.
 *
 * The agent writes for a chat bubble (see assistant-markdown.tsx, which
 * renders it properly), so replies arrive with **bold**, bullet lists,
 * `code`, headings and links in them. Handed straight to TTS, every one of
 * those is read out literally — "asterisk asterisk Riverside asterisk
 * asterisk" — which is the single most jarring thing a voice kiosk can do.
 *
 * Deliberately a small, dependency-free transform rather than a real
 * markdown parser: this only needs to strip decoration from short spoken
 * answers, and a parser would mean shipping one to the device for the sake
 * of removing a handful of characters.
 */
export function toSpeechText(markdown: string): string {
  return (
    markdown
      // Fenced code blocks: read the code, not the fence/language tag.
      .replace(/```[a-zA-Z0-9]*\n?/g, "")
      // Images: the alt text is the only speakable part.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Links: say the label, not the URL.
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // Bold/italic/strikethrough wrappers, including the ***both*** form.
      .replace(/(\*{1,3}|_{1,3})(\S(?:[\s\S]*?\S)?)\1/g, "$2")
      .replace(/~~([\s\S]*?)~~/g, "$1")
      // Inline code ticks.
      .replace(/`([^`]*)`/g, "$1")
      // Headings: "## Hours" -> "Hours".
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      // Blockquote markers.
      .replace(/^\s{0,3}>\s?/gm, "")
      // Bullets: "- Cleaning" -> "Cleaning". Numbered lists keep their
      // number, since "1. Cleaning" is natural to hear read out.
      .replace(/^\s*[-*+]\s+/gm, "")
      // Horizontal rules are silent, but leaving the dashes in makes some
      // engines pause oddly or spell them.
      .replace(/^\s*([-*_])\s*\1\s*\1[\s\S]*?$/gm, "")
      // Any stray emphasis characters the paired rules above didn't catch
      // (an unmatched "*" from a truncated stream, most often).
      .replace(/[*_`]/g, "")
      // Collapse the whitespace all of the above leaves behind.
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(". ")
      // The join above can produce ".." where a line already ended in
      // punctuation.
      .replace(/([.!?:])\s*\.\s*/g, "$1 ")
      .trim()
  );
}
