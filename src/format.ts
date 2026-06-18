/**
 * Reformats a PR description produced by `gh pr create --fill-verbose`.
 *
 * `gh` renders each commit as a bold list item whose body is indented by two
 * spaces and hard-wrapped:
 *
 *     - **Subject**
 *       Body line one
 *       body line two.
 *
 *       Second paragraph.
 *
 * This turns every such block into:
 *
 *     ## Subject
 *
 *     Body line one body line two.
 *
 *     Second paragraph.
 *
 * i.e. list item -> `##` header, indentation stripped, wrapped lines unwrapped
 * into a single line per paragraph, and two blank lines between sections.
 */

const HEADER_RE = /^-\s+\*\*(.+?)\*\*\s*$/;
const FENCE_RE = /^```/;
const LIST_ITEM_RE = /^\s*([-*+]\s+|\d+[.)]\s+)/;

interface Section {
  title: string;
  body: string[];
}

/** True if the text contains at least one `- **...**` section header. */
export function hasPRSections(input: string): boolean {
  return splitLines(input).some((line) => HEADER_RE.test(line));
}

export function formatPRDescription(input: string): string {
  const sections: Section[] = [];
  let current: Section | undefined;

  for (const line of splitLines(input)) {
    const header = line.match(HEADER_RE);
    if (header) {
      current = { title: header[1].trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
    // Lines before the first header (a preamble) are dropped.
  }

  // Nothing recognizable — leave the text untouched.
  if (sections.length === 0) {
    return input;
  }

  return sections
    .map((section) => {
      const body = formatBody(section.body);
      return body ? `## ${section.title}\n\n${body}` : `## ${section.title}`;
    })
    .join("\n\n\n");
}

/** De-indent, unwrap prose, and preserve lists / fenced code blocks. */
function formatBody(rawLines: string[]): string {
  const lines = rawLines.map((line) =>
    line.trim() === "" ? "" : line.replace(/^ {1,2}/, "").replace(/\s+$/, ""),
  );

  const blocks: string[] = [];
  let buffer: string[] = [];
  let bufferIsList = false;
  let fence: string[] | undefined;

  const flush = () => {
    if (buffer.length > 0) {
      blocks.push(buffer.join("\n"));
      buffer = [];
      bufferIsList = false;
    }
  };

  for (const line of lines) {
    // Inside a fenced code block: copy lines verbatim until the closing fence.
    if (fence) {
      fence.push(line);
      if (FENCE_RE.test(line)) {
        blocks.push(fence.join("\n"));
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
      continue;
    }

    if (LIST_ITEM_RE.test(line)) {
      if (!bufferIsList) flush();
      bufferIsList = true;
      buffer.push(line);
      continue;
    }

    // Plain prose: unwrap by appending onto the current logical line (or, in a
    // list, onto the current item as a continuation line).
    if (buffer.length === 0) {
      buffer.push(line);
    } else {
      buffer[buffer.length - 1] = `${buffer[buffer.length - 1]} ${line}`;
    }
  }

  if (fence) blocks.push(fence.join("\n"));
  flush();

  return blocks.join("\n\n");
}

function splitLines(input: string): string[] {
  return input.split(/\r\n|\r|\n/);
}
