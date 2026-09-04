-- CreateTable
CREATE TABLE "chat_widget"."CatalogProduct" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT,
    "productType" TEXT,
    "vendor" TEXT,
    "status" TEXT,
    "description" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "options" JSONB NOT NULL DEFAULT '[]',
    "collectionTitles" JSONB NOT NULL DEFAULT '[]',
    "minPrice" TEXT,
    "maxPrice" TEXT,
    "currency" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_widget"."StorePage" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "type" TEXT NOT NULL DEFAULT 'page',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_widget"."CatalogSync" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogProduct_shop_idx" ON "chat_widget"."CatalogProduct"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_shop_productId_key" ON "chat_widget"."CatalogProduct"("shop", "productId");

-- CreateIndex
CREATE INDEX "StorePage_shop_idx" ON "chat_widget"."StorePage"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "StorePage_shop_url_key" ON "chat_widget"."StorePage"("shop", "url");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSync_shop_key" ON "chat_widget"."CatalogSync"("shop");
