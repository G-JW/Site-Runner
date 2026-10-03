import type { BatchResult, NotificationChannel, NotificationMessage } from '../../shared/types.js';
import type { DataService } from '../services/data-service.js';
import { createNtfyProvider } from './providers/ntfy.js';
import { createWebhookProvider } from './providers/webhook.js';
import type { NotificationDelivery, NotificationProvider } from './types.js';

export type ProviderFactory = (config: Record<string, unknown>) => NotificationProvider;
const defaultRegistry: Record<string, ProviderFactory> = { ntfy: createNtfyProvider, webhook: createWebhookProvider };

function shortError(error: string | null): string {
  // Keep the message, excluding stack frames and verbose Playwright call logs.
  const message = ((error ?? '').split(/\r?\n\s*(?:at\s|Call log:|Locator:|Expected:|Received:)/)[0] ?? '')
    .replace(/^(?:\w*Error):\s*/, '').replace(/\s+/g, ' ').trim();
  if (!message) return 'Unknown error';
  return message.length > 180 ? `${message.slice(0, 179)}…` : message;
}

export function buildBatchNotification(batch: BatchResult): NotificationMessage {
  const failures = batch.results.filter((result) => result.status === 'failed');
  const failedSites = failures.map((result) => result.siteName);
  const level = batch.failed > 0 ? 'alert' : 'normal';
  const failed = failures.length ? `\n\nFailed:\n${failures.map((result) => `- ${result.siteName}: ${shortError(result.error)}`).join('\n')}` : '';
  return {
    title: batch.failed > 0 ? 'Site Runner · Attention needed' : 'Site Runner · All clear',
    body: `Completed: ${new Date(batch.finishedAt).toLocaleString()}\n\nTotal: ${batch.total}\nSuccess: ${batch.success}\nFailed: ${batch.failed}${failed}`,
    level, timestamp: batch.finishedAt,
    batch: { total: batch.total, success: batch.success, failed: batch.failed, failedSites },
  };
}

export class NotificationService {
  constructor(private readonly data: DataService, private readonly registry: Record<string, ProviderFactory> = defaultRegistry) {}

  async notifyBatch(batch: BatchResult): Promise<NotificationDelivery[]> {
    if (!this.data.getSettings().notificationEnabled) return [];
    const message = buildBatchNotification(batch);
    const channels = this.data.listChannels().filter((channel) => channel.enabled &&
      (channel.eventPolicy === 'all' || channel.eventPolicy === message.level));
    return this.deliver(message, channels);
  }

  async testChannel(id: string): Promise<void> {
    const channel = this.data.getChannel(id);
    const message: NotificationMessage = {
      title: 'Site Runner test', body: 'Your notification channel is working.', level: 'normal', timestamp: new Date().toISOString(),
    };
    const [delivery] = await this.deliver(message, [channel]);
    if (!delivery?.success) throw new Error(delivery?.error ?? 'Notification delivery failed');
  }

  private async deliver(message: NotificationMessage, channels: NotificationChannel[]): Promise<NotificationDelivery[]> {
    return Promise.all(channels.map(async (channel) => {
      try {
        const factory = this.registry[channel.providerType];
        if (!factory) throw new Error(`Unknown notification provider: ${channel.providerType}`);
        await factory(channel.config).send(message);
        return { channelId: channel.id, channelName: channel.name, success: true, error: null };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`Notification channel ${channel.name} failed: ${reason}`);
        return { channelId: channel.id, channelName: channel.name, success: false, error: reason };
      }
    }));
  }
}
