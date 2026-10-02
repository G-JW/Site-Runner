import type { NotificationMessage } from '../../../shared/types.js';
import type { NotificationProvider } from '../types.js';

interface NtfyConfig { serverUrl: string; topic: string; token?: string }

export function createNtfyProvider(config: Record<string, unknown>): NotificationProvider {
  const value = config as Partial<NtfyConfig>;
  if (!value.serverUrl || !value.topic) throw new Error('NTFY server URL and topic are required');
  const endpoint = `${value.serverUrl.replace(/\/$/, '')}/${encodeURIComponent(value.topic)}`;
  return {
    async send(message: NotificationMessage) {
      const headers: Record<string, string> = {
        Title: message.title,
        Priority: message.level === 'alert' ? 'high' : 'default',
        Tags: message.level === 'alert' ? 'warning' : 'white_check_mark',
      };
      if (value.token) headers.Authorization = `Bearer ${value.token}`;
      const response = await fetch(endpoint, { method: 'POST', headers, body: message.body, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`NTFY returned HTTP ${response.status}`);
    },
  };
}
