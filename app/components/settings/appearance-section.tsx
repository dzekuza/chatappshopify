import type { UpdateSettingFn } from "./widget-section";

const POSITIONS = [
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
];

export type AppearanceSectionProps = {
  primaryColor: string;
  iconUrl: string | null;
  position: string;
  isUploadingIcon: boolean;
  iconUploadError: string | null;
  onUploadIcon: (file: File) => void;
  onRemoveIcon: () => void;
  onChange: UpdateSettingFn;
};

export function AppearanceSection({
  primaryColor,
  iconUrl,
  position,
  isUploadingIcon,
  iconUploadError,
  onUploadIcon,
  onRemoveIcon,
  onChange,
}: AppearanceSectionProps) {
  return (
    <s-section heading="Appearance">
      <s-stack direction="block" gap="base">
        <s-color-field
          name="primaryColor"
          label="Brand color"
          value={primaryColor}
          onChange={(event: Event) =>
            onChange(
              "primaryColor",
              (event.currentTarget as HTMLInputElement).value,
            )
          }
        />
        <s-stack direction="block" gap="small-200">
          <s-text color="subdued">Launcher icon</s-text>
          {iconUrl ? (
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-thumbnail src={iconUrl} alt="Widget icon" size="small" />
              <s-button
                variant="tertiary"
                tone="critical"
                onClick={onRemoveIcon}
                {...(isUploadingIcon ? { disabled: true } : {})}
              >
                Remove icon
              </s-button>
            </s-stack>
          ) : (
            <s-drop-zone
              accept="image/*"
              label="Upload icon"
              accessibilityLabel="Upload a custom launcher icon"
              {...(isUploadingIcon ? { disabled: true } : {})}
              onChange={(event: Event) => {
                const file = (event.currentTarget as HTMLInputElement).files?.[0];
                if (file instanceof File) onUploadIcon(file);
              }}
            />
          )}
          {isUploadingIcon ? (
            <s-paragraph tone="neutral" color="subdued">
              Uploading…
            </s-paragraph>
          ) : null}
          {iconUploadError ? (
            <s-paragraph tone="critical">{iconUploadError}</s-paragraph>
          ) : (
            <s-paragraph tone="neutral" color="subdued">
              Replaces the default chat-bubble icon on the launcher button.
              PNG or SVG recommended, up to 2MB.
            </s-paragraph>
          )}
        </s-stack>
        <s-select
          name="position"
          label="Position"
          value={position}
          onChange={(event: Event) =>
            onChange("position", (event.currentTarget as HTMLSelectElement).value)
          }
        >
          {POSITIONS.map((p) => (
            <s-option key={p.value} value={p.value}>
              {p.label}
            </s-option>
          ))}
        </s-select>
      </s-stack>
    </s-section>
  );
}
