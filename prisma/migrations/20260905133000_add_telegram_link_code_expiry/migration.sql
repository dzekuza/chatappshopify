-- Link codes are bearer credentials: whoever sends one to the bot receives the
-- shop's chat activity and can reply as the merchant. Give them a window, so a
-- code can't sit valid indefinitely and can't be replayed against a shop that
-- has already connected.
ALTER TABLE "chat_widget"."TelegramLink" ADD COLUMN "linkCodeExpiresAt" TIMESTAMP(3);
