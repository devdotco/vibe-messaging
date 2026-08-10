ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "has_here_mention" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "has_channel_mention" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "forwarded_from_message_id" uuid,
  ADD COLUMN IF NOT EXISTS "forwarded_from_channel_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_here_mention_idx" ON "messages" USING btree ("has_here_mention");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_channel_mention_idx" ON "messages" USING btree ("has_channel_mention");
