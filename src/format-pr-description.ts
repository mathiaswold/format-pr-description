import { Clipboard, showHUD } from "@raycast/api";
import { formatPRDescription } from "./format";

export default async function Command() {
  const input = await Clipboard.readText();

  if (!input || input.trim() === "") {
    await showHUD("Clipboard is empty");
    return;
  }

  await Clipboard.copy(formatPRDescription(input));
  await showHUD("✓ Formatted PR description copied to clipboard");
}
