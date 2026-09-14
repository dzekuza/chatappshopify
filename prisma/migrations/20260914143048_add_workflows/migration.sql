-- AlterTable
ALTER TABLE "chat_widget"."Conversation" ADD COLUMN     "workflowAnswers" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "workflowCompletedAt" TIMESTAMP(3),
ADD COLUMN     "workflowId" TEXT,
ADD COLUMN     "workflowQuestionIndex" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "chat_widget"."Workflow" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topicLabel" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workflow_shop_idx" ON "chat_widget"."Workflow"("shop");

-- CreateIndex
CREATE INDEX "Workflow_shop_enabled_idx" ON "chat_widget"."Workflow"("shop", "enabled");
