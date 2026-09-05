-- Telegram push channel: one linked chat per shop, plus a map from posted
-- bot messages back to conversations so swipe-replies can be routed.
CREATE TABLE "chat_widget"."TelegramLink" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "linkCode" TEXT NOT NULL,
    "chatId" TEXT,
    "chatTitle" TEXT,
    "linkedAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "feedScope" TEXT NOT NULL DEFAULT 'all',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramLink_shop_key" ON "chat_widget"."TelegramLink"("shop");
CREATE UNIQUE INDEX "TelegramLink_linkCode_key" ON "chat_widget"."TelegramLink"("linkCode");

CREATE TABLE "chat_widget"."TelegramMessageRef" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "telegramMessageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramMessageRef_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramMessageRef_chatId_telegramMessageId_key" ON "chat_widget"."TelegramMessageRef"("chatId", "telegramMessageId");
CREATE INDEX "TelegramMessageRef_shop_conversationId_idx" ON "chat_widget"."TelegramMessageRef"("shop", "conversationId");
