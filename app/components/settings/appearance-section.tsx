import type { UpdateSettingFn } from "./widget-section";

const POSITIONS = [
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
];

const CORNER_STYLES = [
  { value: "rounded", label: "Rounded" },
  { value: "square", label: "Square" },
];

export type AppearanceSectionProps = {
  primaryColor: string;
  iconUrl: string | null;
  position: string;
  headerTitle: string;
  cornerStyle: string;
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
  headerTitle,
  cornerStyle,
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
        <s-text-field
          name="headerTitle"
          label="Header title"
          value={headerTitle}
          details="Shown at the top of the chat panel, above the welcome message."
          onChange={(event: Event) =>
            onChange(
              "headerTitle",
              (event.currentTarget as HTMLInputElement).value,
            )
          }
        />
        <s-select
          name="cornerStyle"
          label="Corner style"
          value={cornerStyle}
          details="Controls how rounded the chat panel's corners are."
          onChange={(event: Event) =>
            onChange(
              "cornerStyle",
              (event.currentTarget as HTMLSelectElement).value,
            )
          }
        >
          {CORNER_STYLES.map((c) => (
            <s-option key={c.value} value={c.value}>
              {c.label}
            </s-option>
          ))}
        </s-select>
      </s-stack>
    </s-section>
  );
}
