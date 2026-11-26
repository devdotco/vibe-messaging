/*
 * Shared by the Brigham page and the server routes. Pure module.
 *
 * Brigham is not a row in `users`: its messages live in `brigham_messages`,
 * and the page renders them under this fixed id so MessageList can show a name.
 */
export const BRIGHAM_USER_ID = '00000000-0000-4000-8000-0000b819a000';
export const BRIGHAM_EVENT = 'brigham.message';

export type BrighamRow = {
  id: string;
  orgId: string;
  userId: string;
  role: 'user' | 'brigham' | 'update';
  content: string;
  brighamConversationId: string | null;
  status: string | null;
  url: string | null;
  createdAt: string | Date | null;
};
