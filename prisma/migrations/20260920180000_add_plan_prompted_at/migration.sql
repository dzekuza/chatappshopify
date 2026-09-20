-- AlterTable
ALTER TABLE "chat_widget"."WidgetSettings" ADD COLUMN     "planPromptedAt" TIMESTAMP(3);

-- Shops that already exist have long since seen the app; only new installs
-- should be sent to the Plans page on first open.
UPDATE "chat_widget"."WidgetSettings" SET "planPromptedAt" = NOW();
