import type { UpdateSettingFn } from "./widget-section";

// Every id here was verified against the shared key on 2026-09-04 by actually
// calling generateContent — Google's listModels still advertises models it
// will then refuse to run, so listing is not proof.
//
// gemini-2.5-pro was dropped on 2026-08-24 and gemini-2.5-flash on
// 2026-09-04: Google retires models for new API users ("no longer available
// to new users"), which turns into a live 404 on every chat for any shop
// still holding the old value. gemini-model.server.ts rewrites those ids at
// read time so existing rows heal themselves.
//
// The Pro option only works on a merchant's *own* key: the shared key is on
// Google's free tier, which has a zero quota for pro-tier models (429).
const GEMINI_MODELS = [
  {
    value: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite (latest, lowest cost)",
  },
  {
    value: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash (latest, balanced)",
  },
  {
    value: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro (highest quality — needs your own API key)",
  },
];

const LANGUAGES = [
  { value: "auto", label: "Match the shopper's language" },
  { value: "en", label: "English" },
  { value: "lt", label: "Lithuanian" },
  { value: "lv", label: "Latvian" },
  { value: "et", label: "Estonian" },
  { value: "pl", label: "Polish" },
  { value: "de", label: "German" },
  { value: "ru", label: "Russian" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "nl", label: "Dutch" },
  { value: "sv", label: "Swedish" },
  { value: "no", label: "Norwegian" },
  { value: "da", label: "Danish" },
  { value: "fi", label: "Finnish" },
];

export type AiModelSectionProps = {
  geminiModel: string;
  language: string;
  geminiApiKey: string | null;
  isProPlan: boolean;
  onChange: UpdateSettingFn;
};

export function AiModelSection({
  geminiModel,
  language,
  geminiApiKey,
  isProPlan,
  onChange,
}: AiModelSectionProps) {
  return (
    <s-section heading="AI model">
      <s-stack direction="block" gap="base">
        <s-select
          name="geminiModel"
          label="Gemini model"
          value={geminiModel}
          onChange={(event: Event) =>
            onChange(
              "geminiModel",
              (event.currentTarget as HTMLSelectElement).value,
            )
          }
        >
          {GEMINI_MODELS.map((m) => (
            <s-option key={m.value} value={m.value}>
              {m.label}
            </s-option>
          ))}
        </s-select>
        <s-select
          name="language"
          label="Reply language"
          value={language}
          details="Controls what language the assistant replies in, regardless of the storefront's default language."
          onChange={(event: Event) =>
            onChange("language", (event.currentTarget as HTMLSelectElement).value)
          }
        >
          {LANGUAGES.map((l) => (
            <s-option key={l.value} value={l.value}>
              {l.label}
            </s-option>
          ))}
        </s-select>
        {isProPlan ? (
          <s-text-field
            name="geminiApiKey"
            label="Your own Gemini API key (Pro plan)"
            details="Requests use your own Gemini quota instead of the app's shared key. Leave blank to fall back to the shared key."
            value={geminiApiKey ?? ""}
            onChange={(event: Event) =>
              onChange(
                "geminiApiKey",
                (event.currentTarget as HTMLInputElement).value,
              )
            }
          />
        ) : (
          <s-banner tone="info" heading="Bring your own Gemini API key">
            <s-paragraph>
              Upgrade to the Pro plan to use your own Gemini API key instead
              of the app&rsquo;s shared key.
            </s-paragraph>
            <s-button slot="secondary-actions" href="/app/plans">
              View plans
            </s-button>
          </s-banner>
        )}
      </s-stack>
    </s-section>
  );
}
