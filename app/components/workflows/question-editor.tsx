import {
  MAX_OPTIONS_PER_QUESTION,
  MAX_OPTION_LENGTH,
  MAX_QUESTION_LENGTH,
  type WorkflowQuestion,
} from "../../workflows";

export type WorkflowQuestionEditorProps = {
  question: WorkflowQuestion;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  canRemove: boolean;
  onChange: (question: WorkflowQuestion) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

// One question in a workflow's editor: its text, reorder/remove controls,
// and an optional list of preset answers shown to the shopper as buttons
// (plus an always-added "Other" button on the widget side — see
// ai-chat-widget.js). Leaving the option list empty keeps the question
// free-text, same as before this existed.
export function WorkflowQuestionEditor({
  question,
  index,
  isFirst,
  isLast,
  canRemove,
  onChange,
  onMove,
  onRemove,
}: WorkflowQuestionEditorProps) {
  const options = question.options;

  const updateOption = (optionIndex: number, value: string) => {
    const next = [...options];
    next[optionIndex] = value;
    onChange({ ...question, options: next });
  };

  const removeOption = (optionIndex: number) => {
    onChange({ ...question, options: options.filter((_, i) => i !== optionIndex) });
  };

  return (
    <s-box
      border="base"
      borderRadius="base"
      padding="base"
      accessibilityLabel={`Question ${index + 1}`}
    >
      <s-stack direction="block" gap="small-300">
        <s-grid
          gridTemplateColumns="auto 1fr auto auto auto"
          gap="small-300"
          alignItems="center"
        >
          <s-text color="subdued">{index + 1}.</s-text>
          <s-text-field
            label={`Question ${index + 1}`}
            labelAccessibilityVisibility="exclusive"
            placeholder="e.g. What's it for?"
            value={question.text}
            maxLength={MAX_QUESTION_LENGTH}
            onChange={(event: Event) =>
              onChange({
                ...question,
                text: (event.currentTarget as HTMLInputElement).value,
              })
            }
          />
          <s-button
            variant="tertiary"
            icon="arrow-up"
            accessibilityLabel="Move question up"
            {...(isFirst ? { disabled: true } : {})}
            onClick={() => onMove(-1)}
          />
          <s-button
            variant="tertiary"
            icon="arrow-down"
            accessibilityLabel="Move question down"
            {...(isLast ? { disabled: true } : {})}
            onClick={() => onMove(1)}
          />
          <s-button
            variant="tertiary"
            tone="critical"
            icon="delete"
            accessibilityLabel="Remove question"
            {...(canRemove ? {} : { disabled: true })}
            onClick={onRemove}
          />
        </s-grid>

        <s-stack direction="block" gap="small-200">
          <s-text color="subdued">
            Answer options — optional, leave empty for a free-text answer
          </s-text>
          {options.map((option, optionIndex) => (
            <s-grid
              key={optionIndex}
              gridTemplateColumns="1fr auto"
              gap="small-300"
              alignItems="center"
            >
              <s-text-field
                label={`Option ${optionIndex + 1}`}
                labelAccessibilityVisibility="exclusive"
                placeholder="e.g. Under $50"
                value={option}
                maxLength={MAX_OPTION_LENGTH}
                onChange={(event: Event) =>
                  updateOption(
                    optionIndex,
                    (event.currentTarget as HTMLInputElement).value,
                  )
                }
              />
              <s-button
                variant="tertiary"
                tone="critical"
                icon="delete"
                accessibilityLabel="Remove option"
                onClick={() => removeOption(optionIndex)}
              />
            </s-grid>
          ))}
          <s-button
            variant="tertiary"
            icon="plus"
            {...(options.length >= MAX_OPTIONS_PER_QUESTION ? { disabled: true } : {})}
            onClick={() => onChange({ ...question, options: [...options, ""] })}
          >
            Add answer option
          </s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );
}
