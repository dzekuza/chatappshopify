-- Add question types (freeform / product) and generalize the "video"
-- attachment into a typed media attachment (video or image), preserving
-- existing video data.

ALTER TABLE "chat_widget"."KnowledgeEntry"
  ADD COLUMN "type" TEXT NOT NULL DEFAULT 'freeform',
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "productTitle" TEXT,
  ADD COLUMN "productHandle" TEXT,
  ADD COLUMN "mediaType" TEXT;

ALTER TABLE "chat_widget"."KnowledgeEntry"
  ALTER COLUMN "question" DROP NOT NULL;

ALTER TABLE "chat_widget"."KnowledgeEntry" RENAME COLUMN "videoId" TO "mediaId";
ALTER TABLE "chat_widget"."KnowledgeEntry" RENAME COLUMN "videoUrl" TO "mediaUrl";
ALTER TABLE "chat_widget"."KnowledgeEntry" RENAME COLUMN "videoName" TO "mediaName";

UPDATE "chat_widget"."KnowledgeEntry" SET "mediaType" = 'video' WHERE "mediaUrl" IS NOT NULL;
