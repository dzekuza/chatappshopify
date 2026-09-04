-- Tracks whether a shop's AI backend is currently working, so an exhausted or
-- invalid Gemini key surfaces on the Plans page instead of failing silently.
CREATE TABLE "chat_widget"."AiStatus" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "lastErrorKind" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "usedOwnKey" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiStatus_shop_key" ON "chat_widget"."AiStatus"("shop");
