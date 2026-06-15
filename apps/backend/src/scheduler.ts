import { VersionRepository } from "./repositories/VersionRepository.js";

export function startScheduler(): void {
  const maxPerNote = Number(process.env["VERSION_MAX_PER_NOTE"] ?? "50");
  const retentionDays = Number(process.env["VERSION_RETENTION_DAYS"] ?? "90");
  const intervalMs =
    Number(process.env["VERSION_PURGE_INTERVAL_HOURS"] ?? "24") * 60 * 60 * 1000;

  setInterval(async () => {
    try {
      await VersionRepository.purgeOldVersions(maxPerNote, retentionDays);
    } catch (err) {
      console.error("[scheduler] Version purge failed:", err);
    }
  }, intervalMs);
}
