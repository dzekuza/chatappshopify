import { useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  deleteKnowledgeEntry,
  saveKnowledgeEntry,
  syncKnowledgeCollections,
  type SaveKnowledgeEntryPayload,
} from "../knowledge-entries.server";
import {
  KnowledgeEntriesTable,
} from "../components/knowledge/knowledge-entries-table";
import {
  KnowledgeEntryModal,
  type KnowledgeEntryModalHandle,
} from "../components/knowledge/knowledge-entry-modal";
import {
  UnansweredQuestionsPanel,
} from "../components/knowledge/unanswered-questions-panel";
import { QueryLogPanel } from "../components/knowledge/query-log-panel";
import {
  KnowledgeSyncSection,
  type KnowledgeCollection,
} from "../components/settings/knowledge-sync-section";
import { StoreAuditSection } from "../components/settings/store-audit-section";

const RECENT_QUERY_LIMIT = 50;
const UNANSWERED_QUESTION_LIMIT = 20;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [entries, recentQueries, unansweredQueries, widgetSettings, storeAudit] =
    await Promise.all([
      prisma.knowledgeEntry.findMany({
        where: { shop: session.shop },
        orderBy: { createdAt: "desc" },
      }),
      prisma.knowledgeQuery.findMany({
        where: { shop: session.shop },
        orderBy: { createdAt: "desc" },
        take: RECENT_QUERY_LIMIT,
      }),
      prisma.knowledgeQuery.findMany({
        where: { shop: session.shop, matched: false },
        orderBy: { createdAt: "desc" },
        take: UNANSWERED_QUESTION_LIMIT,
      }),
      prisma.widgetSettings.upsert({
        where: { shop: session.shop },
        update: {},
        create: { shop: session.shop },
        select: { knowledgeCollections: true },
      }),
      prisma.storeAudit.findUnique({
        where: { shop: session.shop },
        select: { status: true, lastRunAt: true, lastError: true, storeContext: true },
      }),
    ]);

  const knowledgeCollections = Array.isArray(widgetSettings.knowledgeCollections)
    ? (widgetSettings.knowledgeCollections as unknown as KnowledgeCollection[])
    : [];

  return { entries, recentQueries, unansweredQueries, knowledgeCollections, storeAudit };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const payload = await request.json();
  const intent = String(payload.intent ?? "save");

  if (intent === "sync-collections") {
    return syncKnowledgeCollections(session.shop, payload.knowledgeCollections);
  }

  if (intent === "delete") {
    return deleteKnowledgeEntry(session.shop, String(payload.id ?? ""));
  }

  return saveKnowledgeEntry(
    session.shop,
    session.id,
    payload as SaveKnowledgeEntryPayload,
  );
};

export default function Knowledge() {
  const { entries, recentQueries, unansweredQueries, knowledgeCollections, storeAudit } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const collectionsFetcher = useFetcher<{
    ok: boolean;
    knowledgeCollections: KnowledgeCollection[];
  }>();
  const auditFetcher = useFetcher<{
    audit: {
      status: string;
      lastRunAt: string | Date | null;
      lastError: string | null;
      storeContext: string | null;
    } | null;
  }>();
  const modalRef = useRef<KnowledgeEntryModalHandle>(null);
  const shopify = useAppBridge();
  const [isSyncingCollections, setIsSyncingCollections] = useState(false);

  const currentCollections =
    collectionsFetcher.data?.knowledgeCollections ?? knowledgeCollections;
  const currentAudit = auditFetcher.data?.audit ?? storeAudit;
  const isRunningAudit =
    auditFetcher.state !== "idle" || currentAudit?.status === "running";
  const isSaving = fetcher.state !== "idle";

  const saveCollections = (next: KnowledgeCollection[]) => {
    collectionsFetcher.submit(
      JSON.stringify({ intent: "sync-collections", knowledgeCollections: next }),
      { method: "POST", encType: "application/json" },
    );
  };

  const syncCollections = async () => {
    setIsSyncingCollections(true);
    try {
      const selected = await shopify.resourcePicker({
        type: "collection",
        action: "select",
        multiple: true,
        selectionIds: currentCollections.map((c) => ({ id: c.id })),
      });
      if (!selected) return;
      const next: KnowledgeCollection[] = selected.map((c) => ({
        id: c.id,
        title: c.title,
        handle: c.handle,
      }));
      saveCollections(next);
    } finally {
      setIsSyncingCollections(false);
    }
  };

  const removeCollection = (id: string) => {
    saveCollections(currentCollections.filter((c) => c.id !== id));
  };

  const refreshAudit = () => {
    auditFetcher.submit(null, { method: "POST", action: "/app/store-audit" });
  };

  const handleDelete = (id: string) => {
    fetcher.submit(JSON.stringify({ intent: "delete", id }), {
      method: "POST",
      encType: "application/json",
    });
  };

  const openNewEntry = () => modalRef.current?.openNew();

  const openEditEntry = (entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (entry) modalRef.current?.openEdit(entry);
  };

  const convertQuestionToFaq = (question: string) => {
    modalRef.current?.openFromQuery(question);
  };

  return (
    <s-page heading="Knowledge">
      <s-button slot="primary-action" commandFor="knowledge-modal" onClick={openNewEntry}>
        Add question
      </s-button>

      <s-section heading="Custom questions & answers">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Give the assistant exact answers for questions you want handled a
            specific way, or attach extra info to a specific product — with
            an optional video or image, e.g. a how-to clip or size chart.
            When a shopper asks something close to one of these (or the
            assistant discusses that product), it uses your answer instead
            of guessing.
          </s-paragraph>
        </s-stack>
      </s-section>

      <KnowledgeSyncSection
        knowledgeCollections={currentCollections}
        isSyncingCollections={isSyncingCollections}
        onSync={syncCollections}
        onRemove={removeCollection}
      />

      <StoreAuditSection
        audit={currentAudit}
        isRunning={isRunningAudit}
        onRefresh={refreshAudit}
      />

      <UnansweredQuestionsPanel
        questions={unansweredQueries}
        isConverting={isSaving}
        onConvert={convertQuestionToFaq}
      />

      <QueryLogPanel queries={recentQueries} />

      <KnowledgeEntriesTable
        entries={entries}
        isSaving={isSaving}
        onAddNew={openNewEntry}
        onEdit={openEditEntry}
        onDelete={handleDelete}
      />

      <KnowledgeEntryModal ref={modalRef} fetcher={fetcher} />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
