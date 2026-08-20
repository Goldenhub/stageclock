import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";

export async function checkForUpdates() {
  try {
    const update = await check();
    if (update) {
      const yes = await ask(
        `A new version (v${update.version}) is available.\n\n${update.body ?? ""}`,
        {
          title: "Update Available",
          kind: "info",
          okLabel: "Update",
          cancelLabel: "Later",
        }
      );
      if (yes) {
        await update.downloadAndInstall();
        await relaunch();
      }
    }
  } catch {
    // Silently ignore — network errors, offline, etc.
  }
}
