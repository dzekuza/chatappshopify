import { useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
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
import { SuggestedKnowledgePanel } from "../components/knowledge/suggested-knowledge-panel";
import type {
  KnowledgeSuggestion,
  SuggestionsResult,
} from "../knowledge-suggestions.server";
import {
  KnowledgeSyncSection,
  type KnowledgeCollection,
} from "../components/settings/knowledge-sync-section";
import { StoreAuditSection } from "../components/settings/store-audit-section";
import { CatalogSyncSection } from "../components/knowledge/catalog-sync-section";

const PAGE_SIZE = 15;

// Page numbers arrive from the URL, so they can be anything a merchant types
// or a stale bookmark carries. Anything that isn't a positive integer falls
// back to the first page.
function pageParam(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const requestedLogPage = pageParam(url.searchParams.get("logPage"));
  const requestedUnansweredPage = pageParam(
    url.searchParams.get("unansweredPage"),
  );

  const [
    entries,
    widgetSettings,
    storeAudit,
    catalogSync,
    queryLogCount,
    unansweredCount,
  ] = await Promise.all([
      prisma.knowledgeEntry.findMany({
        where: { shop: session.shop },
        orderBy: { createdAt: "desc" },
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
      prisma.catalogSync.findUnique({
        where: { shop: session.shop },
        select: {
          status: true,
          productCount: true,
          pageCount: true,
          storeUrl: true,
          platform: true,
          lastRunAt: true,
          lastError: true,
        },
      }),
      prisma.knowledgeQuery.count({ where: { shop: session.shop } }),
      prisma.knowledgeQuery.count({
        where: { shop: session.shop, matched: false },
      }),
    ]);

  const queryLogPageCount = Math.max(1, Math.ceil(queryLogCount / PAGE_SIZE));
  const unansweredPageCount = Math.max(
    1,
    Math.ceil(unansweredCount / PAGE_SIZE),
  );
  // Clamp before querying so a hand-edited or stale page number lands on a
  // page that exists instead of an empty table.
  const logPage = Math.min(requestedLogPage, queryLogPageCount);
  const unansweredPage = Math.min(requestedUnansweredPage, unansweredPageCount);

  const [recentQueries, unansweredQueries] = await Promise.all([
    prisma.knowledgeQuery.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      skip: (logPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.knowledgeQuery.findMany({
      where: { shop: session.shop, matched: false },
      orderBy: { createdAt: "desc" },
      skip: (unansweredPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const knowledgeCollections = Array.isArray(widgetSettings.knowledgeCollections)
    ? (widgetSettings.knowledgeCollections as unknown as KnowledgeCollection[])
    : [];

  return {
    entries,
    recentQueries,
    unansweredQueries,
    knowledgeCollections,
    storeAudit,
    catalogSync,
    logPage,
    queryLogPageCount,
    unansweredPage,
    unansweredPageCount,
  };
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
  const {
    entries,
    recentQueries,
    unansweredQueries,
    knowledgeCollections,
    storeAudit,
    catalogSync,
    logPage,
    queryLogPageCount,
    unansweredPage,
    unansweredPageCount,
  } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();

  // Mutate the existing params rather than building a fresh set: Shopify
  // opens the app with shop/host/embedded on the URL and App Bridge reads
  // them off the document, so dropping them breaks the embedded frame.
  const goToPage = (param: string, page: number) => {
    setSearchParams(
      (previous) => {
        previous.set(param, String(page));
        return previous;
      },
      { preventScrollReset: true },
    );
  };
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
  const catalogFetcher = useFetcher<{
    catalogSync: {
      status: string;
      productCount: number;
      pageCount: number;
      storeUrl: string | null;
      platform: string;
      lastRunAt: string | Date | null;
      lastError: string | null;
    } | null;
  }>();
  const suggestionsFetcher = useFetcher<SuggestionsResult>();
  const modalRef = useRef<KnowledgeEntryModalHandle>(null);
  const shopify = useAppBridge();
  const [isSyncingCollections, setIsSyncingCollections] = useState(false);

  const currentCollections =
    collectionsFetcher.data?.knowledgeCollections ?? knowledgeCollections;
  const currentAudit = auditFetcher.data?.audit ?? storeAudit;
  const currentCatalogSync = catalogFetcher.data?.catalogSync ?? catalogSync;
  const isSyncingCatalog =
    catalogFetcher.state !== "idle" || currentCatalogSync?.status === "running";
  const isRunningAudit =
    auditFetcher.state !== "idle" || currentAudit?.status === "running";
  const isSaving = fetcher.state !== "idle";
  const isAnalyzing = suggestionsFetcher.state !== "idle";
  const suggestions = suggestionsFetcher.data?.suggestions ?? [];
  const suggestionsError = suggestionsFetcher.data?.error ?? null;

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

  const syncCatalog = () => {
    catalogFetcher.submit(null, { method: "POST", action: "/app/catalog-sync" });
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

  const analyzeConversations = () => {
    suggestionsFetcher.submit(null, {
      method: "POST",
      action: "/app/knowledge/suggestions",
    });
  };

  const addSuggestion = (suggestion: KnowledgeSuggestion) => {
    modalRef.current?.openFromSuggestion({
      question:
        suggestion.kind === "product" && suggestion.productTitle
          ? `${suggestion.productTitle}: ${suggestion.question}`
          : suggestion.question,
      answer: suggestion.answer,
    });
  };

  return (
    <s-page heading="Knowledge">
      <s-button
        slot="primary-action"
        icon="plus"
        commandFor="knowledge-modal"
        onClick={openNewEntry}
      >
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

      <CatalogSyncSection
        catalogSync={currentCatalogSync}
        isSyncing={isSyncingCatalog}
        onSync={syncCatalog}
      />

      <StoreAuditSection
        audit={currentAudit}
        isRunning={isRunningAudit}
        onRefresh={refreshAudit}
      />

      <KnowledgeEntriesTable
        entries={entries}
        isSaving={isSaving}
        onAddNew={openNewEntry}
        onEdit={openEditEntry}
        onDelete={handleDelete}
      />

      <SuggestedKnowledgePanel
        suggestions={suggestions}
        hasAnalyzed={suggestionsFetcher.data !== undefined}
        isAnalyzing={isAnalyzing}
        error={suggestionsError}
        onAnalyze={analyzeConversations}
        onAdd={addSuggestion}
      />

      <UnansweredQuestionsPanel
        questions={unansweredQueries}
        isConverting={isSaving}
        onConvert={convertQuestionToFaq}
        page={unansweredPage}
        pageCount={unansweredPageCount}
        onPageChange={(page) => goToPage("unansweredPage", page)}
      />

      <QueryLogPanel
        queries={recentQueries}
        page={logPage}
        pageCount={queryLogPageCount}
        onPageChange={(page) => goToPage("logPage", page)}
      />

      <KnowledgeEntryModal ref={modalRef} fetcher={fetcher} />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
