-- AlterTable
ALTER TABLE "chat_widget"."WidgetSettings" ADD COLUMN     "cornerStyle" TEXT NOT NULL DEFAULT 'rounded',
ADD COLUMN     "headerTitle" TEXT NOT NULL DEFAULT 'Chat with us';
