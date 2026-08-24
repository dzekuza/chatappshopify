import type { UpdateSettingFn } from "./widget-section";

// gemini-2.5-pro was removed from this list on 2026-08-24 — Google
// deprecated it for new API users ("This model models/gemini-2.5-pro is no
// longer available to new users"), which broke every shop that had it
// selected with a live 404 on every chat request. gemini-3.1-pro-preview is
// the model Google's own error message points to as the replacement.
const GEMINI_MODELS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (fast, low cost)" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (higher quality)" },
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
