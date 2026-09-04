-- Google retired gemini-2.5-flash for new API users ("no longer available to
-- new users"), so the old column default handed every newly-installed shop a
-- model that 404s on the first chat. Existing rows are deliberately left
-- alone: gemini-model.server.ts rewrites retired ids at read time, which
-- keeps working for whatever Google retires next without another backfill.
ALTER TABLE "chat_widget"."WidgetSettings"
  ALTER COLUMN "geminiModel" SET DEFAULT 'gemini-3.5-flash-lite';
