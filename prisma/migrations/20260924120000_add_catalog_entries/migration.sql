-- AlterTable
ALTER TABLE "chat_widget"."CatalogSync" ADD COLUMN     "entryCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "chat_widget"."CatalogEntry" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogEntry_shop_idx" ON "chat_widget"."CatalogEntry"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogEntry_shop_entryId_key" ON "chat_widget"."CatalogEntry"("shop", "entryId");
