import { useRef, useState } from "react";
import { PROMPT_TEMPLATES, type PromptTemplate } from "../../prompt-templates";
import { PromptPreview } from "./prompt-preview";

export const PROMPT_TEMPLATE_MODAL_ID = "prompt-template-modal";

export type PromptTemplateModalProps = {
  onApply: (prompt: string) => void;
};

export function PromptTemplateModal({ onApply }: PromptTemplateModalProps) {
  // @shopify/polaris-types doesn't export the s-modal element class, so
  // there's no non-`any` type to ref it against.
  const modalRef = useRef<{ hideOverlay: () => void }>(null);
  const [selected, setSelected] = useState<PromptTemplate | null>(null);

  const apply = (template: PromptTemplate) => {
    onApply(template.prompt);
    setSelected(null);
    modalRef.current?.hideOverlay();
  };

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <s-modal ref={modalRef as any} id={PROMPT_TEMPLATE_MODAL_ID} heading="Prompt templates">
      {selected ? (
        <s-stack direction="block" gap="base">
          <s-heading>{selected.name}</s-heading>
          <s-text color="subdued">{selected.description}</s-text>
          <PromptPreview prompt={selected.prompt} />
          <s-banner tone="warning">
            <s-paragraph>
              Applying a template replaces whatever is currently in the
              persona field. Nothing is saved until you hit Save.
            </s-paragraph>
          </s-banner>
        </s-stack>
      ) : (
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Pick a starting point for your assistant&rsquo;s persona. You can
            edit it afterwards.
          </s-paragraph>
          {PROMPT_TEMPLATES.map((template) => (
            <s-clickable
              key={template.id}
              padding="base"
              background="subdued"
              borderRadius="base"
              onClick={() => setSelected(template)}
            >
              <s-stack direction="block" gap="small-200">
                <s-text type="strong">{template.name}</s-text>
                <s-text color="subdued">{template.description}</s-text>
              </s-stack>
            </s-clickable>
          ))}
        </s-stack>
      )}

      {selected ? (
        <>
          <s-button slot="secondary-actions" onClick={() => setSelected(null)}>
            Back
          </s-button>
          <s-button
            slot="primary-action"
            variant="primary"
            onClick={() => apply(selected)}
          >
            Use this template
          </s-button>
        </>
      ) : (
        <s-button
          slot="secondary-actions"
          commandFor={PROMPT_TEMPLATE_MODAL_ID}
          command="--hide"
        >
          Cancel
        </s-button>
      )}
    </s-modal>
  );
}
