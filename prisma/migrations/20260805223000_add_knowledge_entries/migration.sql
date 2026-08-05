-- CreateTable
CREATE TABLE "chat_widget"."KnowledgeEntry" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "videoId" TEXT,
    "videoUrl" TEXT,
    "videoName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeEntry_shop_idx" ON "chat_widget"."KnowledgeEntry"("shop");
