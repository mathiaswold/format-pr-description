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
 *
 * For a PR built from a single commit, `gh` emits no bold list headers — the
 * description is just the commit body verbatim, hard-wrapped and un-indented:
 *
 *     As described in owner/repo#123:
 *
 *     The first body line
 *     and its continuation.
 *
 * In that case there is nothing to turn into headers, so the whole input is
 * treated as one body and only the unwrapping is applied.
 */

const HEADER_RE = /^-\s+\*\*(.+?)\*\*\s*$/;
const FENCE_RE = /^```/;
const LIST_ITEM_RE = /^\s*([-*+]\s+|\d+[.)]\s+)/;

interface Section {
  title: string;
  body: string[];
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

  // No headers: a single-commit PR. The whole input is the body, and `gh`
  // does not indent it, so unwrap it as-is without stripping indentation.
  if (sections.length === 0) {
    return formatBody(splitLines(input), false);
  }

  return sections
    .map((section) => {
      const body = formatBody(section.body, true);
      return body ? `## ${section.title}\n\n${body}` : `## ${section.title}`;
    })
    .join("\n\n\n");
}

/** Optionally de-indent, unwrap prose, and preserve lists / fenced code blocks. */
function formatBody(rawLines: string[], deindent: boolean): string {
  const lines = rawLines.map((line) => {
    if (line.trim() === "") return "";
    const dedented = deindent ? line.replace(/^ {1,2}/, "") : line;
    return dedented.replace(/\s+$/, "");
  });

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
