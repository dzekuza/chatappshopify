// Guided-question workflows.
//
// A workflow is a merchant-defined topic (e.g. "Help me pick a product")
// backed by an ordered list of preconfigured questions. The storefront widget
// offers enabled workflows as topic buttons; picking one asks the questions
// one at a time, deterministically (no AI call), then hands the accumulated
// answers to the existing AI + searchProducts flow for one final
// recommendation turn — see apps.chat-widget.chat.tsx.
//
// Workflows live in their own table (see schema.prisma) rather than as JSON
// on WidgetSettings, unlike proactive rules — they're a full list resource
// with their own admin CRUD pages, not a handful of settings fetched on every
// page load.

// `options` are the preset answer choices shown to the shopper as buttons,
// e.g. ["Under $50", "$50-$100", "$100+"]. Empty means a plain free-text
// question — the shopper just types their answer, no buttons shown. When
// options exist, the widget always adds an "Other" button alongside them so
// the shopper can still type something that isn't listed.
export type WorkflowQuestion = { id: string; text: string; options: string[] };

export type WorkflowRecord = {
  id: string;
  title: string;
  topicLabel: string;
  description: string | null;
  enabled: boolean;
  position: number;
  questions: WorkflowQuestion[];
};

// What the storefront actually receives: no internal title, no enabled flag
// (only enabled workflows are ever sent — see publicWorkflow below).
export type PublicWorkflow = {
  id: string;
  topicLabel: string;
  description: string | null;
  questions: WorkflowQuestion[];
};

// Caps mirror MAX_PROACTIVE_RULES/MAX_PROACTIVE_MESSAGE_LENGTH in proactive.ts:
// enough for a real guided flow, small enough that a workflow can't be
// configured into something absurd.
export const MAX_WORKFLOWS = 10;
export const MAX_QUESTIONS_PER_WORKFLOW = 8;
export const MAX_QUESTION_LENGTH = 200;
export const MAX_OPTIONS_PER_QUESTION = 6;
export const MAX_OPTION_LENGTH = 60;
export const MAX_TITLE_LENGTH = 80;
export const MAX_TOPIC_LABEL_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Tolerant counterpart used by parseQuestions — drops junk entries rather
// than throwing, same reasoning as parseQuestions itself.
function parseOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const options: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const text = raw.trim();
    if (!text) continue;
    options.push(text.slice(0, MAX_OPTION_LENGTH));
    if (options.length >= MAX_OPTIONS_PER_QUESTION) break;
  }
  return options;
}

// Tolerant on purpose: this parses data that has already been written to the
// database, and a single malformed question must never take the storefront
// widget or the chat endpoint down with it. Unparseable entries are dropped,
// not thrown on. Validation of *incoming* merchant input belongs in
// validateQuestions, where an error can be shown.
export function parseQuestions(value: unknown): WorkflowQuestion[] {
  if (!Array.isArray(value)) return [];

  const questions: WorkflowQuestion[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    if (typeof raw.id !== "string" || raw.id.length === 0) continue;

    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    if (!text) continue;

    questions.push({
      id: raw.id,
      text: text.slice(0, MAX_QUESTION_LENGTH),
      options: parseOptions(raw.options),
    });
    if (questions.length >= MAX_QUESTIONS_PER_WORKFLOW) break;
  }
  return questions;
}

// Strict counterpart to parseQuestions, for merchant input arriving from the
// admin. Where the parser silently drops junk, this refuses the save and
// says why, so a typo surfaces in the UI instead of vanishing.
export function validateQuestions(
  input: unknown,
): { questions: WorkflowQuestion[] } | { error: string } {
  if (!Array.isArray(input)) return { error: "Questions must be a list." };
  if (input.length === 0) {
    return { error: "Add at least one question." };
  }
  if (input.length > MAX_QUESTIONS_PER_WORKFLOW) {
    return { error: `You can have at most ${MAX_QUESTIONS_PER_WORKFLOW} questions.` };
  }

  const seen = new Set<string>();
  const questions: WorkflowQuestion[] = [];

  for (const raw of input) {
    if (!isRecord(raw)) return { error: "A question is malformed." };

    if (typeof raw.id !== "string" || !raw.id) {
      return { error: "A question is missing its id." };
    }
    if (seen.has(raw.id)) return { error: "Two questions share the same id." };
    seen.add(raw.id);

    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    if (!text) return { error: "Every question needs text." };
    if (text.length > MAX_QUESTION_LENGTH) {
      return { error: `Questions must be ${MAX_QUESTION_LENGTH} characters or fewer.` };
    }

    const rawOptions = Array.isArray(raw.options) ? raw.options : [];
    if (rawOptions.length > MAX_OPTIONS_PER_QUESTION) {
      return {
        error: `A question can have at most ${MAX_OPTIONS_PER_QUESTION} answer options.`,
      };
    }
    const options: string[] = [];
    const seenOptions = new Set<string>();
    for (const rawOption of rawOptions) {
      const optionText = typeof rawOption === "string" ? rawOption.trim() : "";
      if (!optionText) return { error: "An answer option is empty." };
      if (optionText.length > MAX_OPTION_LENGTH) {
        return {
          error: `Answer options must be ${MAX_OPTION_LENGTH} characters or fewer.`,
        };
      }
      if (seenOptions.has(optionText)) {
        return { error: "Two answer options on the same question are identical." };
      }
      seenOptions.add(optionText);
      options.push(optionText);
    }

    questions.push({ id: raw.id, text, options });
  }

  return { questions };
}

export function validateWorkflowFields(input: {
  title: unknown;
  topicLabel: unknown;
  description: unknown;
}): { title: string; topicLabel: string; description: string | null } | { error: string } {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return { error: "Give the workflow a name." };
  if (title.length > MAX_TITLE_LENGTH) {
    return { error: `Name must be ${MAX_TITLE_LENGTH} characters or fewer.` };
  }

  const topicLabel = typeof input.topicLabel === "string" ? input.topicLabel.trim() : "";
  if (!topicLabel) return { error: "Give the workflow a topic label shoppers will see." };
  if (topicLabel.length > MAX_TOPIC_LABEL_LENGTH) {
    return { error: `Topic label must be ${MAX_TOPIC_LABEL_LENGTH} characters or fewer.` };
  }

  const descriptionRaw =
    typeof input.description === "string" ? input.description.trim() : "";
  if (descriptionRaw.length > MAX_DESCRIPTION_LENGTH) {
    return { error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.` };
  }

  return { title, topicLabel, description: descriptionRaw || null };
}

// Only enabled workflows are ever sent to the storefront; internal fields
// (title) are dropped since the shopper never sees them.
export function publicWorkflow(record: WorkflowRecord): PublicWorkflow {
  return {
    id: record.id,
    topicLabel: record.topicLabel,
    description: record.description,
    questions: record.questions,
  };
}

// One shopper answer accumulated while stepping through a workflow's
// questions, used to build the final AI recommendation turn. Shared by the
// real storefront chat endpoint (apps.chat-widget.chat.tsx, where it's
// persisted on Conversation.workflowAnswers) and the admin preview
// (app.chat-widget.preview.tsx, where the client tracks it entirely
// in-memory and only sends it once, for the final turn).
export type WorkflowAnswer = { questionId: string; question: string; answer: string };

// Tolerant, same reasoning as parseQuestions — never let a malformed answer
// break the recommendation turn.
export function parseWorkflowAnswers(value: unknown): WorkflowAnswer[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (a): a is WorkflowAnswer =>
      typeof a === "object" &&
      a !== null &&
      typeof (a as WorkflowAnswer).question === "string" &&
      typeof (a as WorkflowAnswer).answer === "string",
  );
}

// Only ever added for the one turn right after a workflow's last question is
// answered — this is what turns the shopper's answers into the "never invent
// products" searchProducts-backed recommendation the workflow promises.
export function workflowRecommendationPrompt(
  topicLabel: string,
  answers: WorkflowAnswer[],
) {
  const qa = answers
    .map((a, i) => `${i + 1}. ${a.question}\nShopper's answer: ${a.answer}`)
    .join("\n\n");
  return (
    `The shopper just finished the guided "${topicLabel}" flow, answering these ` +
    `preconfigured questions in order:\n\n${qa}\n\nUse their answers to call ` +
    `searchProducts and recommend the single best-fitting product (or a very ` +
    `short shortlist if nothing clearly stands out). Explain briefly why it fits ` +
    `their answers. Never invent a product or detail that didn't come from the tool.`
  );
}
