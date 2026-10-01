import type { NotificationMessage } from '../../../shared/types.js';
import type { NotificationProvider } from '../types.js';

interface WebhookConfig { url: string; method?: string; headers?: Record<string, string> }

export function createWebhookProvider(config: Record<string, unknown>): NotificationProvider {
  const value = config as Partial<WebhookConfig>;
  if (!value.url) throw new Error('Webhook URL is required');
  const parsed = new URL(value.url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Webhook URL must use HTTP or HTTPS');
  return {
    async send(message: NotificationMessage) {
      const response = await fetch(parsed, {
        method: value.method?.toUpperCase() || 'POST',
        headers: { 'content-type': 'application/json', ...value.headers },
        body: JSON.stringify(message),
      });
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
    },
  };
}
