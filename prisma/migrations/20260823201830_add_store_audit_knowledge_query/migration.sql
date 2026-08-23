-- AlterTable
ALTER TABLE "chat_widget"."KnowledgeEntry" ADD COLUMN     "createdByEmail" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "chat_widget"."StoreAudit" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "storeContext" TEXT,
    "sourceUrls" JSONB NOT NULL DEFAULT '[]',
    "policies" JSONB NOT NULL DEFAULT '{}',
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_widget"."KnowledgeQuery" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "matchedEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreAudit_shop_key" ON "chat_widget"."StoreAudit"("shop");

-- CreateIndex
CREATE INDEX "KnowledgeQuery_shop_createdAt_idx" ON "chat_widget"."KnowledgeQuery"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeQuery_shop_matched_createdAt_idx" ON "chat_widget"."KnowledgeQuery"("shop", "matched", "createdAt");
