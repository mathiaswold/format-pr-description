/**
 * Re-wraps a commit message so no line exceeds 72 characters.
 *
 * Each paragraph is re-filled from scratch: its lines are joined back into one
 * logical line, then greedily broken at 72 characters. Words pulled down from a
 * too-long line are followed by the words after them, so no line is left
 * unnaturally short:
 *
 *     Adds a retry helper around the client so transient failures are retried instead
 *     of surfacing an error to the caller.
 *
 * becomes
 *
 *     Adds a retry helper around the client so transient failures are retried
 *     instead of surfacing an error to the caller.
 *
 * Lines are only ever broken at whitespace, so a single long "word" is left
 * intact and allowed to overflow. That is what keeps URLs longer than 72
 * characters unwrapped — they get a line of their own instead of being split.
 *
 * Blank lines, the subject line, indentation, list items, headings, block
 * quotes and fenced code blocks all keep their own structure, and a trailing
 * block of git trailers (`Co-authored-by:` and friends) is left verbatim so its
 * one-trailer-per-line layout survives.
 */

const MAX_LINE_LENGTH = 72;

const FENCE_RE = /^\s*```/;
const LEADING_WS_RE = /^\s*/;
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;
const QUOTE_RE = /^\s*>+\s*/;
const HEADING_RE = /^\s*#{1,6}\s/;
const TRAILER_RE = /^([A-Za-z][A-Za-z0-9-]*):\s+\S/;

/** Trailer keys that git recognises without a hyphen to give them away. */
const TRAILER_KEYS = new Set(["cc", "fixes", "closes", "refs", "link", "bug"]);

interface Chunk {
  type: "blank" | "verbatim" | "paragraph";
  lines: string[];
}

export function wrapCommitMessage(input: string): string {
  const chunks = toChunks(splitLines(input));
  const subject = chunks.find((chunk) => chunk.type === "paragraph");
  const trailers = trailerChunk(chunks);

  const wrapped: string[] = [];

  for (const chunk of chunks) {
    if (chunk.type === "paragraph" && chunk !== trailers) {
      for (const line of toLogicalLines(chunk.lines, chunk === subject)) {
        wrapped.push(...wrapLine(line));
      }
    } else {
      wrapped.push(...chunk.lines);
    }
  }

  return wrapped.join("\n");
}

/** Split into paragraphs, blank lines and verbatim fenced code blocks. */
function toChunks(rawLines: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  let paragraph: string[] | undefined;
  let fence: string[] | undefined;

  const flush = () => {
    if (paragraph) {
      chunks.push({ type: "paragraph", lines: paragraph });
      paragraph = undefined;
    }
  };

  for (const rawLine of rawLines) {
    const line = trimEnd(rawLine);

    if (fence) {
      fence.push(line);
      if (FENCE_RE.test(line)) {
        chunks.push({ type: "verbatim", lines: fence });
        fence = undefined;
      }
      continue;
    }

    if (FENCE_RE.test(line)) {
      flush();
      fence = [line];
      continue;
    }

    if (line === "") {
      flush();
      chunks.push({ type: "blank", lines: [""] });
      continue;
    }

    (paragraph ??= []).push(line);
  }

  if (fence) chunks.push({ type: "verbatim", lines: fence });
  flush();

  return chunks;
}

/**
 * Join a paragraph's hard-wrapped lines back together, keeping anything that
 * owns its line — the subject, list items, headings, block quotes — separate.
 */
function toLogicalLines(lines: string[], isSubject: boolean): string[] {
  const logical: string[] = [];
  // Prose may continue a list item or a quote, but never a subject or heading.
  let previousIsClosed = false;

  lines.forEach((line, index) => {
    const isHeading = HEADING_RE.test(line);
    const isSubjectLine = isSubject && index === 0;
    const ownsItsLine =
      isHeading ||
      isSubjectLine ||
      LIST_ITEM_RE.test(line) ||
      QUOTE_RE.test(line);

    if (logical.length === 0 || ownsItsLine || previousIsClosed) {
      logical.push(line);
    } else {
      logical[logical.length - 1] += ` ${line.trim()}`;
    }

    previousIsClosed = isHeading || isSubjectLine;
  });

  return logical;
}

/** Greedily fill words up to `MAX_LINE_LENGTH`, breaking only at whitespace. */
function wrapLine(line: string): string[] {
  if (line.length <= MAX_LINE_LENGTH) return [line];

  const indent = line.match(LEADING_WS_RE)?.[0] ?? "";
  const words = line.slice(indent.length).split(/\s+/).filter(Boolean);
  const hangingIndent = continuationPrefix(line, indent);

  const wrapped: string[] = [];
  let current: string | undefined;

  for (const word of words) {
    if (current === undefined) {
      current = (wrapped.length === 0 ? indent : hangingIndent) + word;
    } else if (current.length + 1 + word.length <= MAX_LINE_LENGTH) {
      current = `${current} ${word}`;
    } else {
      wrapped.push(current);
      // An over-long word (e.g. a URL) starts a fresh line and overflows it.
      current = hangingIndent + word;
    }
  }

  if (current !== undefined) wrapped.push(current);

  return wrapped;
}

/** List items hang under their content; block quotes repeat their marker. */
function continuationPrefix(line: string, indent: string): string {
  const quote = line.match(QUOTE_RE);
  if (quote) return quote[0];

  const listItem = line.match(LIST_ITEM_RE);
  if (listItem) return " ".repeat(listItem[0].length);

  return indent;
}

/**
 * The trailing block of git trailers, if the message ends in one. Git only
 * reads trailers from the final paragraph, and only one per line, so it is left
 * exactly as written rather than re-filled.
 */
function trailerChunk(chunks: Chunk[]): Chunk | undefined {
  const paragraphs = chunks.filter((chunk) => chunk.type === "paragraph");
  const last = [...chunks].reverse().find((chunk) => chunk.type !== "blank");

  // A one-paragraph message is a subject, never a trailer block.
  if (paragraphs.length < 2 || last?.type !== "paragraph") return undefined;

  return last.lines.every(isTrailer) ? last : undefined;
}

function isTrailer(line: string): boolean {
  const key = line.match(TRAILER_RE)?.[1].toLowerCase();
  return key !== undefined && (key.includes("-") || TRAILER_KEYS.has(key));
}

function trimEnd(line: string): string {
  return line.replace(/\s+$/, "");
}

function splitLines(input: string): string[] {
  return input.split(/\r\n|\r|\n/);
}
