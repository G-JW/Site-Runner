import type { NotificationService } from './notifications/service.js';
import type { DataService } from './services/data-service.js';
import type { AutomationRunner } from './automation/runner.js';
import { BatchRunner } from './automation/batch-runner.js';

export interface CliCommand {
  action: 'run-all' | 'run-site' | 'run-folder' | 'list-sites' | 'list-folders' | 'help';
  site: string | null;
  userData: string | null;
  headless: boolean;
}

export const cliHelp = `Site Runner — one-shot task runner
  --run-all                  Run all enabled sites serially, notify, and exit
  --run-site <id-or-name>     Run one site, notify, and exit (even if disabled)
  --run-folder <id-or-name>   Run enabled sites in one folder, notify, and exit
  --list-folders             Print folder IDs and names as JSON
  --list-sites               Print site IDs, names and enabled state as JSON
  --user-data <directory>    Use a specific data directory (default: GUI data)
  --headed                   Show the automation browser (default: headless)
  --headless                 Run without a browser window
  --help                     Show this help

No desktop window or internal cron scheduler is started in CLI mode.
Exit codes: 0 = success; 1 = run/delivery/startup failure;
            2 = invalid arguments/site; 3 = another instance is using this data.
Run under the same OS user as the GUI to reuse sites and login profiles.
`;

export function parseCliCommand(args: string[]): CliCommand | null {
  if (!args.some((arg) => /^--(run|list-sites|list-folders|help|user-data|headless|headed)/.test(arg))) return null;
  let action: CliCommand['action'] | null = null;
  let site: string | null = null;
  let userData: string | null = null;
  let headless = true;
  let browserMode: string | null = null;
  const valueAfter = (index: number): string => {
    const value = args[index + 1];
    if (!value?.trim() || value.startsWith('--')) throw new Error(`${args[index]} requires a value`);
    return value;
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--run-all' || arg === '--run-site' || arg === '--run-folder' || arg === '--list-folders' || arg === '--list-sites' || arg === '--help') {
      if (action) throw new Error('Choose exactly one command');
      action = arg.slice(2) as CliCommand['action'];
      if (action === 'run-site' || action === 'run-folder') site = valueAfter(index++);
    } else if (arg === '--user-data') {
      if (userData) throw new Error('--user-data can only be specified once');
      userData = valueAfter(index++);
    } else if (arg === '--headed' || arg === '--headless') {
      if (browserMode) throw new Error('Choose only one browser mode');
      browserMode = arg;
      headless = arg === '--headless';
    } else if (arg !== '--enable-logging') {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!action) throw new Error('Use --run-all, --run-site, --list-sites or --help');
  return { action, site, userData, headless };
}

export async function executeCliCommand(command: CliCommand, data: DataService, runner: Pick<AutomationRunner, 'runSite'>, notifications: Pick<NotificationService, 'notifyBatch'>) {
  if (command.action === 'list-folders') return { exitCode: 0, output: { folders: data.listFolders() } };
  if (command.action === 'list-sites') {
    return { exitCode: 0, output: { sites: data.listSites().map(({ id, name, enabled }) => ({ id, name, enabled })) } };
  }
  let siteIds: string[];
  if (command.action === 'run-site') {
    const sites = data.listSites();
    const byId = sites.find((site) => site.id === command.site);
    const matches = byId ? [byId] : sites.filter((site) => site.name === command.site);
    if (matches.length !== 1) return { exitCode: 2, output: { error: matches.length ? 'Ambiguous site name; use an ID from --list-sites' : 'Site not found; use --list-sites' } };
    siteIds = [matches[0]!.id];
  } else if (command.action === 'run-folder') {
    const folders = data.listFolders();
    const folder = folders.find((item) => item.id === command.site) ?? folders.find((item) => item.name === command.site);
    if (!folder) return { exitCode: 2, output: { error: 'Folder not found; use --list-folders' } };
    siteIds = data.listSites().filter((site) => site.enabled && site.folderId === folder.id).map((site) => site.id);
  } else {
    siteIds = data.listSites().filter((site) => site.enabled).map((site) => site.id);
  }
  let deliveries: Awaited<ReturnType<NotificationService['notifyBatch']>> = [];
  const batch = new BatchRunner(data, runner, async (result) => {
    if (result.total > 0) deliveries = await notifications.notifyBatch(result);
  });
  const result = await batch.runSites(siteIds, command.headless);
  return { exitCode: result.failed > 0 || deliveries.some((item) => !item.success) ? 1 : 0, output: { ...result, notifications: deliveries } };
}
