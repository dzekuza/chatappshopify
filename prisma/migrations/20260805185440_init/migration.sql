-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "chat_widget";

-- CreateTable
CREATE TABLE "chat_widget"."Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_widget"."WidgetSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Hi! How can I help you find what you''re looking for?',
    "systemPrompt" TEXT NOT NULL DEFAULT 'You are a friendly, concise shopping assistant for this store. Use the product lookup tool to answer questions about products, pricing, and availability. Never invent products or prices.',
    "primaryColor" TEXT NOT NULL DEFAULT '#1a1a1a',
    "position" TEXT NOT NULL DEFAULT 'bottom-right',
    "geminiModel" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WidgetSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_widget"."Conversation" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_widget"."ChatMessage" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WidgetSettings_shop_key" ON "chat_widget"."WidgetSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_shop_conversationId_key" ON "chat_widget"."Conversation"("shop", "conversationId");

-- CreateIndex
CREATE INDEX "ChatMessage_shop_conversationId_createdAt_idx" ON "chat_widget"."ChatMessage"("shop", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_shop_createdAt_idx" ON "chat_widget"."ChatMessage"("shop", "createdAt");

