import type { RunRecord, Site, SiteFolder } from "./types.js";

export function resultKind(run: Pick<RunRecord, "status"> | null) {
  if (!run) return "idle" as const;
  return run.status;
}
export function effectiveSchedule(
  site: Pick<Site, "enabled" | "schedule" | "folderId">,
  folders: SiteFolder[],
) {
  if (!site.enabled || site.schedule.mode === "manual") return null;
  if (site.schedule.enabled)
    return { source: "custom" as const, cron: site.schedule.cron };
  const folder = folders.find(
    (item) => item.id === site.folderId && item.schedule.enabled,
  );
  return folder
    ? {
        source: "inherit" as const,
        cron: folder.schedule.cron,
        name: folder.name,
      }
    : null;
}
export function errorAdvice(error: string | null) {
  const message = error ?? "";
  if (/Close the profile browser/i.test(message))
    return "closeBrowser" as const;
  if (/recording|recorder|profile.*running|profile.*queued/i.test(message))
    return "profileBusy" as const;
  if (/security challenge|captcha|verify you are human/i.test(message))
    return "challenge" as const;
  if (
    /Expected page content|toBeVisible|locator|strict mode|Timeout|exceeded/i.test(
      message,
    )
  )
    return "check" as const;
  if (/HTTP|ERR_|net::/i.test(message)) return "connection" as const;
  return "generic" as const;
}
