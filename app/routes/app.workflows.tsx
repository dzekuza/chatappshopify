import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { parseQuestions } from "../workflows";

// List + enable/delete for guided-question workflows. Editing a workflow's
// name/topic/questions happens on its own page (app.workflows.$id.tsx) —
// unlike proactive rules, a workflow's ordered question list needs more room
// than a settings modal comfortably gives it.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const workflows = await prisma.workflow.findMany({
    where: { shop: session.shop },
    orderBy: { position: "asc" },
  });

  return {
    workflows: workflows.map((w) => ({
      id: w.id,
      title: w.title,
      topicLabel: w.topicLabel,
      enabled: w.enabled,
      questionCount: parseQuestions(w.questions).length,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const payload = await request.json();
  const intent = payload?.intent;

  if (intent === "toggle") {
    const id = String(payload?.id ?? "");
    const workflow = await prisma.workflow.findFirst({
      where: { id, shop: session.shop },
    });
    if (!workflow) return Response.json({ error: "Not found" }, { status: 404 });

    await prisma.workflow.update({
      where: { id },
      data: { enabled: Boolean(payload?.enabled) },
    });
    return Response.json({ ok: true });
  }

  if (intent === "delete") {
    const id = String(payload?.id ?? "");
    const workflow = await prisma.workflow.findFirst({
      where: { id, shop: session.shop },
    });
    if (!workflow) return Response.json({ error: "Not found" }, { status: 404 });

    await prisma.workflow.delete({ where: { id } });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
};

export default function Workflows() {
  const { workflows } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const toggle = (id: string, enabled: boolean) => {
    fetcher.submit(
      { intent: "toggle", id, enabled },
      { method: "post", encType: "application/json" },
    );
  };

  const remove = (id: string) => {
    fetcher.submit(
      { intent: "delete", id },
      { method: "post", encType: "application/json" },
    );
  };

  return (
    <s-page heading="Workflows">
      <s-button
        slot="primary-action"
        variant="primary"
        icon="plus"
        href="/app/workflows/new"
      >
        Create workflow
      </s-button>

      <s-section
        accessibilityLabel="Workflows"
        padding={workflows.length === 0 ? "base" : "none"}
      >
        <s-paragraph>
          A workflow offers shoppers a guided topic (e.g. &quot;Help me pick a
          product&quot;) in the chat widget. It asks your preconfigured
          questions one at a time, then has the AI recommend a product using
          their answers.
        </s-paragraph>

        {workflows.length === 0 ? (
          <s-box padding="base">
            <s-text color="subdued">
              No workflows yet. Create one to offer shoppers a guided path to
              a product recommendation.
            </s-text>
          </s-box>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Name</s-table-header>
              <s-table-header listSlot="inline">Topic shown to shoppers</s-table-header>
              <s-table-header listSlot="labeled" format="numeric">
                Questions
              </s-table-header>
              <s-table-header listSlot="labeled">Status</s-table-header>
              <s-table-header listSlot="labeled">Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {workflows.map((w) => {
                const linkId = `workflow-link-${w.id}`;
                return (
                  <s-table-row key={w.id} clickDelegate={linkId}>
                    <s-table-cell>
                      <s-link
                        id={linkId}
                        href={`/app/workflows/${w.id}`}
                        onClick={(event: Event) => {
                          event.preventDefault();
                          navigate(`/app/workflows/${w.id}`);
                        }}
                      >
                        {w.title}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>
                      <s-text>{w.topicLabel}</s-text>
                    </s-table-cell>
                    <s-table-cell>{w.questionCount}</s-table-cell>
                    <s-table-cell>
                      <s-switch
                        label="Enabled"
                        labelAccessibilityVisibility="exclusive"
                        {...(w.enabled ? { checked: true } : {})}
                        onChange={(event: Event) =>
                          toggle(
                            w.id,
                            (event.currentTarget as HTMLInputElement).checked,
                          )
                        }
                      />
                    </s-table-cell>
                    <s-table-cell>
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        onClick={() => remove(w.id)}
                      >
                        Delete
                      </s-button>
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
