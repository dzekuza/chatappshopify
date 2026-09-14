-- AlterTable
ALTER TABLE "chat_widget"."WidgetSettings" ADD COLUMN     "planOverride" TEXT,
ADD COLUMN     "planOverrideRedeemedAt" TIMESTAMP(3);
