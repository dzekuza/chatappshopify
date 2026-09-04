import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { action as improvePromptAction } from "../../routes/app.chat-widget.improve-prompt";
import { PromptPreview } from "./prompt-preview";

export const PROMPT_IMPROVE_MODAL_ID = "prompt-improve-modal";

const EXAMPLES = [
  "Make the tone friendlier and more casual",
  "Add a rule to always ask about size before recommending clothing",
  "Keep answers to one sentence",
];

export type PromptImproveModalProps = {
  systemPrompt: string;
  geminiModel: string;
  onApply: (prompt: string) => void;
};

export function PromptImproveModal({
  systemPrompt,
  geminiModel,
  onApply,
}: PromptImproveModalProps) {
  // @shopify/polaris-types doesn't export the s-modal element class, so
  // there's no non-`any` type to ref it against.
  const modalRef = useRef<{ hideOverlay: () => void }>(null);
  const fetcher = useFetcher<typeof improvePromptAction>();
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const isGenerating = fetcher.state !== "idle";
  const error =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "prompt" in fetcher.data) {
      setResult(fetcher.data.prompt ?? null);
    }
  }, [fetcher.state, fetcher.data]);

  const generate = () => {
    if (!instruction.trim()) return;
    setResult(null);
    fetcher.submit(
      JSON.stringify({ prompt: systemPrompt, instruction, geminiModel }),
      {
        method: "POST",
        action: "/app/chat-widget/improve-prompt",
        encType: "application/json",
      },
    );
  };

  const apply = () => {
    if (!result) return;
    onApply(result);
    setInstruction("");
    setResult(null);
    modalRef.current?.hideOverlay();
  };

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <s-modal ref={modalRef as any} id={PROMPT_IMPROVE_MODAL_ID} heading="Improve with AI">
      <s-stack direction="block" gap="base">
        <s-text-area
          label="What should change?"
          value={instruction}
          rows={3}
          details="Describe the change in your own words — the AI rewrites your persona instructions to match."
          onChange={(event: Event) =>
            setInstruction((event.currentTarget as HTMLTextAreaElement).value)
          }
        />
        <s-stack direction="inline" gap="small-200">
          {EXAMPLES.map((example) => (
            <s-clickable-chip
              key={example}
              onClick={() => setInstruction(example)}
            >
              {example}
            </s-clickable-chip>
          ))}
        </s-stack>

        {error ? (
          <s-banner tone="critical">
            <s-paragraph>{error}</s-paragraph>
          </s-banner>
        ) : null}

        {result ? (
          <s-stack direction="block" gap="small-200">
            <s-text type="strong">Suggested prompt</s-text>
            <PromptPreview prompt={result} />
          </s-stack>
        ) : null}
      </s-stack>

      <s-button
        slot="secondary-actions"
        commandFor={PROMPT_IMPROVE_MODAL_ID}
        command="--hide"
      >
        Cancel
      </s-button>
      {result ? (
        <s-button slot="primary-action" variant="primary" onClick={apply}>
          Apply
        </s-button>
      ) : (
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={generate}
          {...(isGenerating ? { loading: true } : {})}
          {...(instruction.trim() ? {} : { disabled: true })}
        >
          Generate
        </s-button>
      )}
    </s-modal>
  );
}
