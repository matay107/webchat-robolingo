export type MessageDirection = "inbound" | "outbound";

export interface ChatMessage {
  id: number;
  userId: string;
  direction: MessageDirection;
  /** LINE message type: `text`, `sticker`, `image`, ... */
  messageType: string;
  /** Present only for text messages. */
  text: string | null;
  /** Present only for sticker messages. */
  stickerId: string | null;
  sentAt: Date;
}

export interface Contact {
  userId: string;
  displayName: string;
  pictureUrl: string | null;
  isFollowing: boolean;
  profileSyncedAt: Date | null;
  lastMessage: { type: string; text: string | null; sentAt: Date } | null;
  /** Inbound messages the admin has not read yet. */
  unreadCount: number;
}
