import { Clipboard, showHUD } from "@raycast/api";
import { wrapCommitMessage } from "./wrap";

export default async function Command() {
  const input = await Clipboard.readText();

  if (!input || input.trim() === "") {
    await showHUD("Clipboard is empty");
    return;
  }

  await Clipboard.copy(wrapCommitMessage(input));
  await showHUD("✓ Formatted commit message copied to clipboard");
}
