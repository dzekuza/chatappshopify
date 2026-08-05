-- AlterTable
ALTER TABLE "chat_widget"."WidgetSettings"
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'auto',
ADD COLUMN     "knowledgeCollections" JSONB NOT NULL DEFAULT '[]';
