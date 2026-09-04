-- Records which storefront the catalogue sync crawled and how it is built,
-- so a headless (Hydrogen/Oxygen) shop can be indexed with the permissive
-- URL rules instead of the Liquid Online Store's /pages//collections/ layout.
ALTER TABLE "chat_widget"."CatalogSync" ADD COLUMN "storeUrl" TEXT;
ALTER TABLE "chat_widget"."CatalogSync" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'unknown';
