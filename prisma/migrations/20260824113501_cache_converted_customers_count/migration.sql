-- AlterTable
ALTER TABLE "chat_widget"."WidgetSettings" ADD COLUMN     "convertedCustomersCheckedAt" TIMESTAMP(3),
ADD COLUMN     "convertedCustomersCount" INTEGER;
