import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const quoteShell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const quotePS = (value: string) => `'${value.replaceAll("'", "''")}'`;
export interface InstallPlan {
  platform: "darwin" | "win32";
  current: string;
  staged: string;
  pid: number;
  receipt: string;
  userData: string;
  version: string;
}

export function installerScript(
  plan: InstallPlan,
  nonce = randomUUID(),
): string {
  if (!Number.isInteger(plan.pid) || plan.pid <= 0)
    throw new Error("Invalid process ID");
  const backup = `${plan.current}.backup-${nonce}`;
  const next = `${plan.current}.update-${nonce}`;
  const pending = JSON.stringify({ pending: true, version: plan.version });
  const failed = JSON.stringify({ success: false, version: plan.version });
  if (plan.platform === "win32")
    return `$ErrorActionPreference = 'Stop'
$current = ${quotePS(plan.current)}
$next = ${quotePS(next)}
$backup = ${quotePS(backup)}
$receipt = ${quotePS(plan.receipt)}
$env:SITE_RUNNER_USER_DATA = ${quotePS(plan.userData)}
try {
  Copy-Item -LiteralPath ${quotePS(plan.staged)} -Destination $next
  $old = Get-Process -Id ${plan.pid} -ErrorAction SilentlyContinue
  if ($old) { $old | Wait-Process -Timeout 180 -ErrorAction Stop }
  $moved = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try { Move-Item -LiteralPath $current -Destination $backup; $moved = $true; break } catch { Start-Sleep -Seconds 1 }
  }
  if (-not $moved) { throw 'The portable launcher is still locking the executable' }
  try { Move-Item -LiteralPath $next -Destination $current } catch { Move-Item -LiteralPath $backup -Destination $current; throw }
  Set-Content -LiteralPath $receipt -Value ${quotePS(pending)} -Encoding utf8
  $new = Start-Process -FilePath $current -PassThru
  $confirmed = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 1
    try { $confirmed = (Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json).success -eq $true } catch {}
    if ($confirmed) { break }
  }
  if (-not $confirmed) { Stop-Process -Id $new.Id -Force -ErrorAction SilentlyContinue; throw 'Updated app did not start' }
} catch {
  if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $current -Force -ErrorAction SilentlyContinue; Move-Item -LiteralPath $backup -Destination $current }
  Set-Content -LiteralPath $receipt -Value ${quotePS(failed)} -Encoding utf8
  if (-not (Get-Process -Id ${plan.pid} -ErrorAction SilentlyContinue)) { Start-Process -FilePath $current }
} finally { Remove-Item -LiteralPath $next -Force -ErrorAction SilentlyContinue }
`;
  return `#!/bin/sh
set -eu
current=${quoteShell(plan.current)}
next=${quoteShell(next)}
backup=${quoteShell(backup)}
receipt=${quoteShell(plan.receipt)}
export SITE_RUNNER_USER_DATA=${quoteShell(plan.userData)}
relaunch() {
  "$current/Contents/MacOS/Site Runner" > /dev/null 2>&1 &
  new_pid=$!
}
rollback() {
  if [ -d "$backup" ]; then
    /bin/rm -rf "$current"
    /bin/mv "$backup" "$current"
  fi
  printf '%s' ${quoteShell(failed)} > "$receipt"
  /bin/rm -rf "$next"
  if ! kill -0 ${plan.pid} 2>/dev/null; then relaunch; fi
}
trap rollback EXIT
/usr/bin/ditto ${quoteShell(plan.staged)} "$next"
attempt=0
while kill -0 ${plan.pid} 2>/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 180 ] || exit 1
  /bin/sleep 1
done
/bin/mv "$current" "$backup"
/bin/mv "$next" "$current"
printf '%s' ${quoteShell(pending)} > "$receipt"
relaunch
attempt=0
while ! /usr/bin/grep -q '"success":true' "$receipt"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then kill "$new_pid" 2>/dev/null || true; exit 1; fi
  /bin/sleep 1
done
trap - EXIT
`;
}

export async function launchInstaller(
  plan: InstallPlan,
  directory: string,
): Promise<void> {
  const script = installerScript(plan);
  const scriptPath = path.join(
    directory,
    `install-${randomUUID()}.${plan.platform === "darwin" ? "sh" : "ps1"}`,
  );
  await writeFile(scriptPath, script, { mode: 0o700 });
  const command = plan.platform === "darwin" ? "/bin/sh" : "powershell.exe";
  // Inline PowerShell commands do not change the user's execution policy.
  const args =
    plan.platform === "darwin"
      ? [scriptPath]
      : [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
}
