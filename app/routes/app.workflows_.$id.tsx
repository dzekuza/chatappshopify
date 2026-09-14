import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_QUESTIONS_PER_WORKFLOW,
  MAX_TITLE_LENGTH,
  MAX_TOPIC_LABEL_LENGTH,
  parseQuestions,
  validateQuestions,
  validateWorkflowFields,
  type WorkflowQuestion,
} from "../workflows";
import { WorkflowQuestionEditor } from "../components/workflows/question-editor";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const id = params.id as string;

  if (id === "new") {
    return { workflow: null };
  }

  const workflow = await prisma.workflow.findFirst({
    where: { id, shop: session.shop },
  });
  if (!workflow) {
    throw new Response("Workflow not found", { status: 404 });
  }

  return {
    workflow: {
      id: workflow.id,
      title: workflow.title,
      topicLabel: workflow.topicLabel,
      description: workflow.description,
      enabled: workflow.enabled,
      questions: parseQuestions(workflow.questions),
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const id = params.id as string;
  const payload = await request.json();

  const fields = validateWorkflowFields({
    title: payload?.title,
    topicLabel: payload?.topicLabel,
    description: payload?.description,
  });
  if ("error" in fields) {
    return Response.json({ ok: false, error: fields.error }, { status: 400 });
  }

  const questionsResult = validateQuestions(payload?.questions);
  if ("error" in questionsResult) {
    return Response.json({ ok: false, error: questionsResult.error }, { status: 400 });
  }

  const enabled = Boolean(payload?.enabled);

  if (id === "new") {
    const count = await prisma.workflow.count({ where: { shop: session.shop } });
    const created = await prisma.workflow.create({
      data: {
        shop: session.shop,
        title: fields.title,
        topicLabel: fields.topicLabel,
        description: fields.description,
        enabled,
        position: count,
        questions: questionsResult.questions,
      },
    });
    return Response.json({ ok: true, id: created.id });
  }

  const existing = await prisma.workflow.findFirst({
    where: { id, shop: session.shop },
  });
  if (!existing) {
    return Response.json({ ok: false, error: "Workflow not found" }, { status: 404 });
  }

  await prisma.workflow.update({
    where: { id },
    data: {
      title: fields.title,
      topicLabel: fields.topicLabel,
      description: fields.description,
      enabled,
      questions: questionsResult.questions,
    },
  });

  return Response.json({ ok: true, id });
};

function newQuestion(): WorkflowQuestion {
  return { id: crypto.randomUUID(), text: "", options: [] };
}

export default function WorkflowEdit() {
  const { workflow } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok: boolean; error?: string; id?: string }>();

  const isNew = !workflow;
  const [title, setTitle] = useState(workflow?.title ?? "");
  const [topicLabel, setTopicLabel] = useState(workflow?.topicLabel ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [enabled, setEnabled] = useState(workflow?.enabled ?? true);
  const [questions, setQuestions] = useState<WorkflowQuestion[]>(
    workflow?.questions.length ? workflow.questions : [newQuestion()],
  );

  const isSaving = fetcher.state !== "idle";
  const saveError = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  useEffect(() => {
    if (fetcher.data?.ok && isNew && fetcher.data.id) {
      navigate(`/app/workflows/${fetcher.data.id}`, { replace: true });
    }
  }, [fetcher.data, isNew, navigate]);

  const updateQuestion = (id: string, next: WorkflowQuestion) => {
    setQuestions((qs) => qs.map((q) => (q.id === id ? next : q)));
  };

  const removeQuestion = (id: string) => {
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    setQuestions((qs) => {
      const target = index + direction;
      if (target < 0 || target >= qs.length) return qs;
      const next = [...qs];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = () => {
    fetcher.submit(
      { title, topicLabel, description, enabled, questions },
      { method: "post", encType: "application/json" },
    );
  };

  return (
    <s-page heading={isNew ? "Create workflow" : "Edit workflow"}>
      <s-link slot="breadcrumb-actions" href="/app/workflows">
        Workflows
      </s-link>

      {saveError ? <s-banner tone="critical">{saveError}</s-banner> : null}

      <s-section heading="Details">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Name"
            details="Internal label — shoppers never see this."
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(event: Event) =>
              setTitle((event.currentTarget as HTMLInputElement).value)
            }
          />
          <s-text-field
            label="Topic label"
            details="The button text shoppers see in the chat widget, e.g. &quot;Help me pick a product&quot;."
            value={topicLabel}
            maxLength={MAX_TOPIC_LABEL_LENGTH}
            onChange={(event: Event) =>
              setTopicLabel((event.currentTarget as HTMLInputElement).value)
            }
          />
          <s-text-area
            label="Description"
            details="Optional helper text shown under the topic button."
            value={description}
            maxLength={MAX_DESCRIPTION_LENGTH}
            rows={2}
            onChange={(event: Event) =>
              setDescription((event.currentTarget as HTMLTextAreaElement).value)
            }
          />
          <s-switch
            label="Enabled"
            {...(enabled ? { checked: true } : {})}
            onChange={(event: Event) =>
              setEnabled((event.currentTarget as HTMLInputElement).checked)
            }
          />
        </s-stack>
      </s-section>

      <s-section heading="Questions">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Asked in order, one at a time. Once every question is answered,
            the AI recommends a product using the shopper&apos;s answers.
          </s-paragraph>

          <s-stack direction="block" gap="small-300">
            {questions.map((q, index) => (
              <WorkflowQuestionEditor
                key={q.id}
                question={q}
                index={index}
                isFirst={index === 0}
                isLast={index === questions.length - 1}
                canRemove={questions.length > 1}
                onChange={(next) => updateQuestion(q.id, next)}
                onMove={(direction) => moveQuestion(index, direction)}
                onRemove={() => removeQuestion(q.id)}
              />
            ))}
          </s-stack>

          <s-button
            variant="secondary"
            {...(questions.length >= MAX_QUESTIONS_PER_WORKFLOW
              ? { disabled: true }
              : {})}
            onClick={() => setQuestions((qs) => [...qs, newQuestion()])}
          >
            Add question
          </s-button>
        </s-stack>
      </s-section>

      <s-stack direction="inline" gap="base">
        <s-button
          variant="primary"
          {...(isSaving ? { loading: true, disabled: true } : {})}
          onClick={save}
        >
          {isSaving ? "Saving…" : "Save workflow"}
        </s-button>
        <s-button variant="secondary" onClick={() => navigate("/app/workflows")}>
          Cancel
        </s-button>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
