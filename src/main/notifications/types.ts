import type { NotificationMessage } from '../../shared/types.js';

export interface NotificationProvider {
  send(message: NotificationMessage): Promise<void>;
}

export interface NotificationDelivery {
  channelId: string;
  channelName: string;
  success: boolean;
  error: string | null;
}
