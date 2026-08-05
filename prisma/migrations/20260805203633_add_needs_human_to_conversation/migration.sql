-- AlterTable
ALTER TABLE "chat_widget"."Conversation" ADD COLUMN     "needsHuman" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "needsHumanRequestedAt" TIMESTAMP(3);
