import { useEffect, useRef, useState } from "react";
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
import type { VideoFile } from "./app.knowledge_.videos";
import type { ImageFile } from "./app.knowledge_.images";
import type { ProductOption } from "./app.knowledge_.products";
import {
  UnansweredQuestionsPanel,
} from "../components/knowledge/unanswered-questions-panel";
import { QueryLogPanel } from "../components/knowledge/query-log-panel";
import { VideoTimestampFields } from "../components/knowledge/video-timestamp-fields";
import {
  KnowledgeSyncSection,
  type KnowledgeCollection,
} from "../components/settings/knowledge-sync-section";
import { StoreAuditSection } from "../components/settings/store-audit-section";
import {
  describeRange,
  formatTimestamp,
  parseTimeInput,
} from "../media-timestamp";

type EntryType = "freeform" | "product";
type MediaType = "" | "video" | "image";
type PickerMode = null | "video" | "image" | "product";

const EMPTY_FORM = {
  id: "",
  type: "freeform" as EntryType,
  question: "",
  productId: "",
  productTitle: "",
  productHandle: "",
  answer: "",
  mediaType: "" as MediaType,
  mediaId: "",
  mediaUrl: "",
  mediaName: "",
  mediaStart: "",
  mediaEnd: "",
  fromQueryLog: false,
};

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
    const knowledgeCollections: KnowledgeCollection[] = Array.isArray(
      payload.knowledgeCollections,
    )
      ? payload.knowledgeCollections
          .filter(
            (c: unknown): c is KnowledgeCollection =>
              typeof c === "object" &&
              c !== null &&
              typeof (c as Record<string, unknown>).id === "string",
          )
          .map((c: KnowledgeCollection) => ({
            id: c.id,
            title: String(c.title ?? ""),
            handle: String(c.handle ?? ""),
          }))
      : [];

    await prisma.widgetSettings.upsert({
      where: { shop: session.shop },
      update: { knowledgeCollections },
      create: { shop: session.shop, knowledgeCollections },
    });
    return { ok: true, knowledgeCollections };
  }

  if (intent === "delete") {
    const id = String(payload.id ?? "");
    await prisma.knowledgeEntry.deleteMany({
      where: { id, shop: session.shop },
    });
    return { ok: true };
  }

  const type = payload.type === "product" ? "product" : "freeform";
  const answer = String(payload.answer ?? "").trim();
  const mediaType = String(payload.mediaType ?? "").trim() || null;
  const mediaId = String(payload.mediaId ?? "").trim() || null;
  const mediaUrl = String(payload.mediaUrl ?? "").trim() || null;
  const mediaName = String(payload.mediaName ?? "").trim() || null;
  const mediaStartInput = String(payload.mediaStart ?? "").trim();
  const mediaEndInput = String(payload.mediaEnd ?? "").trim();

  if (!answer) {
    return { error: "Answer is required." };
  }

  // Timestamps only mean anything for a video — an image entry never carries
  // them, even if a stale form value came along for the ride.
  let mediaStartSeconds: number | null = null;
  let mediaEndSeconds: number | null = null;

  if (mediaType === "video") {
    if (mediaStartInput) {
      mediaStartSeconds = parseTimeInput(mediaStartInput);
      if (mediaStartSeconds === null) {
        return { error: "Start time must be seconds (10) or mm:ss (0:10)." };
      }
    }
    if (mediaEndInput) {
      mediaEndSeconds = parseTimeInput(mediaEndInput);
      if (mediaEndSeconds === null) {
        return { error: "End time must be seconds (15) or mm:ss (0:15)." };
      }
    }
    if (
      mediaStartSeconds !== null &&
      mediaEndSeconds !== null &&
      mediaEndSeconds <= mediaStartSeconds
    ) {
      return { error: "End time must be after the start time." };
    }
  }

  let question: string | null = null;
  let productId: string | null = null;
  let productTitle: string | null = null;
  let productHandle: string | null = null;

  if (type === "freeform") {
    question = String(payload.question ?? "").trim();
    if (!question) {
      return { error: "Question is required for a free-form entry." };
    }
  } else {
    productId = String(payload.productId ?? "").trim();
    productTitle = String(payload.productTitle ?? "").trim();
    productHandle = String(payload.productHandle ?? "").trim() || null;
    if (!productId || !productTitle) {
      return { error: "Select a product for this entry." };
    }
  }

  const data = {
    type,
    question,
    answer,
    productId,
    productTitle,
    productHandle,
    mediaType,
    mediaId,
    mediaUrl,
    mediaName,
    mediaStartSeconds,
    mediaEndSeconds,
  };

  const id = String(payload.id ?? "").trim();

  if (id) {
    const existing = await prisma.knowledgeEntry.findUnique({
      where: { id },
    });
    if (!existing || existing.shop !== session.shop) {
      return { error: "That entry no longer exists." };
    }
    const entry = await prisma.knowledgeEntry.update({
      where: { id },
      data,
    });
    return { entry };
  }

  const source = payload.fromQueryLog ? "query-log" : "manual";
  const dbSession = await prisma.session.findUnique({
    where: { id: session.id },
    select: { email: true },
  });
  const entry = await prisma.knowledgeEntry.create({
    data: {
      shop: session.shop,
      ...data,
      source,
      createdByEmail: dbSession?.email ?? null,
    },
  });
  return { entry };
};

function mediaBadgeLabel(
  mediaType: string | null,
  startSeconds: number | null,
  endSeconds: number | null,
) {
  if (mediaType === "video") {
    const range = describeRange(startSeconds, endSeconds);
    return range ? `Video ${range}` : "Video attached";
  }
  if (mediaType === "image") return "Image attached";
  return null;
}

export default function Knowledge() {
  const { entries, recentQueries, unansweredQueries, knowledgeCollections, storeAudit } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const videoFetcher = useFetcher<{ videos: VideoFile[] }>();
  const imageFetcher = useFetcher<{ images: ImageFile[] }>();
  const productFetcher = useFetcher<{ products: ProductOption[] }>();
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
  const shopify = useAppBridge();

  const [form, setForm] = useState(EMPTY_FORM);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [productQuery, setProductQuery] = useState("");
  const [isSyncingCollections, setIsSyncingCollections] = useState(false);
  const modalRef = useRef<{ hideOverlay: () => void; showOverlay: () => void }>(
    null,
  );

  const currentCollections =
    collectionsFetcher.data?.knowledgeCollections ?? knowledgeCollections;
  const currentAudit = auditFetcher.data?.audit ?? storeAudit;
  const isRunningAudit =
    auditFetcher.state !== "idle" || currentAudit?.status === "running";

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

  const isSaving = fetcher.state !== "idle";
  const videos = videoFetcher.data?.videos ?? [];
  const isLoadingVideos = videoFetcher.state !== "idle";
  const images = imageFetcher.data?.images ?? [];
  const isLoadingImages = imageFetcher.state !== "idle";
  const products = productFetcher.data?.products ?? [];
  const isLoadingProducts = productFetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "entry" in fetcher.data) {
      shopify.toast.show("Question saved");
      modalRef.current?.hideOverlay();
      setForm(EMPTY_FORM);
    }
    if (fetcher.state === "idle" && fetcher.data && "error" in fetcher.data) {
      shopify.toast.show(fetcher.data.error as string, { isError: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data, fetcher.state]);

  const openNewEntry = () => {
    setForm(EMPTY_FORM);
    setPickerMode(null);
  };

  const openEditEntry = (entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    setForm({
      id: entry.id,
      type: entry.type === "product" ? "product" : "freeform",
      question: entry.question ?? "",
      productId: entry.productId ?? "",
      productTitle: entry.productTitle ?? "",
      productHandle: entry.productHandle ?? "",
      answer: entry.answer,
      mediaType: (entry.mediaType as MediaType) ?? "",
      mediaId: entry.mediaId ?? "",
      mediaUrl: entry.mediaUrl ?? "",
      mediaName: entry.mediaName ?? "",
      mediaStart:
        entry.mediaStartSeconds === null
          ? ""
          : formatTimestamp(entry.mediaStartSeconds),
      mediaEnd:
        entry.mediaEndSeconds === null
          ? ""
          : formatTimestamp(entry.mediaEndSeconds),
      fromQueryLog: false,
    });
    setPickerMode(null);
  };

  const convertQuestionToFaq = (question: string) => {
    setForm({ ...EMPTY_FORM, question, fromQueryLog: true });
    setPickerMode(null);
    modalRef.current?.showOverlay();
  };

  const handleSave = () => {
    fetcher.submit(JSON.stringify({ intent: "save", ...form }), {
      method: "POST",
      encType: "application/json",
    });
  };

  const handleDelete = (id: string) => {
    fetcher.submit(JSON.stringify({ intent: "delete", id }), {
      method: "POST",
      encType: "application/json",
    });
  };

  const openVideoPicker = () => {
    videoFetcher.load("/app/knowledge/videos");
    setPickerMode("video");
  };

  const openImagePicker = () => {
    imageFetcher.load("/app/knowledge/images");
    setPickerMode("image");
  };

  const openProductPicker = () => {
    setProductQuery("");
    productFetcher.load("/app/knowledge/products?query=");
    setPickerMode("product");
  };

  const closePicker = () => {
    setPickerMode(null);
  };

  const selectVideo = (video: VideoFile) => {
    setForm((prev) => ({
      ...prev,
      mediaType: "video",
      mediaId: video.id,
      mediaUrl: video.url,
      mediaName: video.filename,
    }));
    setPickerMode(null);
  };

  const selectImage = (image: ImageFile) => {
    setForm((prev) => ({
      ...prev,
      mediaType: "image",
      mediaId: image.id,
      mediaUrl: image.url,
      mediaName: image.filename,
      mediaStart: "",
      mediaEnd: "",
    }));
    setPickerMode(null);
  };

  const selectProduct = (product: ProductOption) => {
    setForm((prev) => ({
      ...prev,
      productId: product.id,
      productTitle: product.title,
      productHandle: product.handle,
    }));
    setPickerMode(null);
  };

  const removeMedia = () => {
    setForm((prev) => ({
      ...prev,
      mediaType: "",
      mediaId: "",
      mediaUrl: "",
      mediaName: "",
      mediaStart: "",
      mediaEnd: "",
    }));
  };

  const runProductSearch = (value: string) => {
    setProductQuery(value);
    productFetcher.load(`/app/knowledge/products?query=${encodeURIComponent(value)}`);
  };

  const modalHeading =
    pickerMode === "video"
      ? "Select a video"
      : pickerMode === "image"
        ? "Select an image"
        : pickerMode === "product"
          ? "Select a product"
          : "Custom question";

  return (
    <s-page heading="Knowledge">
      <s-button
        slot="primary-action"
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

      {entries.length === 0 ? (
        <s-section>
          <s-grid gap="base" justifyItems="center">
            <s-heading>No custom questions yet</s-heading>
            <s-paragraph>
              Add exact answers for questions you want handled a specific
              way, or attach extra info to a product.
            </s-paragraph>
            <s-button
              variant="primary"
              commandFor="knowledge-modal"
              onClick={openNewEntry}
            >
              Add a question
            </s-button>
          </s-grid>
        </s-section>
      ) : null}

      {entries.length > 0 ? (
        <s-section heading="Store FAQs" padding="none">
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Question</s-table-header>
              <s-table-header listSlot="secondary">Answer</s-table-header>
              <s-table-header listSlot="inline">Media</s-table-header>
              <s-table-header listSlot="inline">Source</s-table-header>
              <s-table-header listSlot="inline">Created by</s-table-header>
              <s-table-header listSlot="labeled" />
            </s-table-header-row>
            <s-table-body>
              {entries.map((entry) => {
                const editLinkId = `edit-${entry.id}`;
                const mediaLabel = mediaBadgeLabel(
                  entry.mediaType,
                  entry.mediaStartSeconds,
                  entry.mediaEndSeconds,
                );
                return (
                  <s-table-row key={entry.id} clickDelegate={editLinkId}>
                    <s-table-cell>
                      <s-link
                        id={editLinkId}
                        commandFor="knowledge-modal"
                        command="--show"
                        onClick={() => openEditEntry(entry.id)}
                      >
                        {entry.type === "product"
                          ? `Product: ${entry.productTitle}`
                          : entry.question}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>
                      {entry.answer.length > 100
                        ? `${entry.answer.slice(0, 100)}…`
                        : entry.answer}
                    </s-table-cell>
                    <s-table-cell>
                      {mediaLabel ? (
                        <s-badge tone="info">{mediaLabel}</s-badge>
                      ) : (
                        <s-text color="subdued">None</s-text>
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge tone={entry.source === "query-log" ? "info" : "auto"}>
                        {entry.source === "query-log" ? "Query log" : "Manual"}
                      </s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      <s-text color="subdued">
                        {entry.createdByEmail ?? "—"}
                      </s-text>
                    </s-table-cell>
                    <s-table-cell>
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        icon="delete"
                        accessibilityLabel={`Delete "${
                          entry.type === "product"
                            ? entry.productTitle
                            : entry.question
                        }"`}
                        {...(isSaving ? { loading: true } : {})}
                        onClick={() => handleDelete(entry.id)}
                      />
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        </s-section>
      ) : null}

      {/* @shopify/polaris-types doesn't export the s-modal element class, so
          there's no non-`any` type to ref it against. */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <s-modal ref={modalRef as any} id="knowledge-modal" heading={modalHeading}>
        {pickerMode === "video" ? (
          isLoadingVideos ? (
            <s-paragraph>Loading videos…</s-paragraph>
          ) : videos.length === 0 ? (
            <s-stack direction="block" gap="base">
              <s-paragraph>
                No videos found in your store&apos;s media library.
              </s-paragraph>
              <s-paragraph tone="neutral" color="subdued">
                Upload one under Content → Files in Shopify admin, then come
                back here.
              </s-paragraph>
            </s-stack>
          ) : (
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              {videos.map((video) => (
                <s-clickable
                  key={video.id}
                  padding="base"
                  background="subdued"
                  onClick={() => selectVideo(video)}
                >
                  <s-stack direction="block" gap="small-200">
                    {video.thumbnailUrl ? (
                      <s-image
                        src={video.thumbnailUrl}
                        alt={video.filename}
                        aspectRatio="16/9"
                        objectFit="cover"
                      />
                    ) : null}
                    <s-text>{video.filename}</s-text>
                  </s-stack>
                </s-clickable>
              ))}
            </s-grid>
          )
        ) : pickerMode === "image" ? (
          isLoadingImages ? (
            <s-paragraph>Loading images…</s-paragraph>
          ) : images.length === 0 ? (
            <s-stack direction="block" gap="base">
              <s-paragraph>
                No images found in your store&apos;s media library.
              </s-paragraph>
              <s-paragraph tone="neutral" color="subdued">
                Upload one under Content → Files in Shopify admin, then come
                back here.
              </s-paragraph>
            </s-stack>
          ) : (
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              {images.map((image) => (
                <s-clickable
                  key={image.id}
                  padding="base"
                  background="subdued"
                  onClick={() => selectImage(image)}
                >
                  <s-stack direction="block" gap="small-200">
                    <s-image
                      src={image.url}
                      alt={image.filename}
                      aspectRatio="16/9"
                      objectFit="cover"
                    />
                    <s-text>{image.filename}</s-text>
                  </s-stack>
                </s-clickable>
              ))}
            </s-grid>
          )
        ) : pickerMode === "product" ? (
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Search products"
              labelAccessibilityVisibility="exclusive"
              placeholder="Search by product title…"
              value={productQuery}
              onChange={(event: Event) =>
                runProductSearch((event.currentTarget as HTMLInputElement).value)
              }
            />
            {isLoadingProducts ? (
              <s-paragraph>Loading products…</s-paragraph>
            ) : products.length === 0 ? (
              <s-paragraph tone="neutral" color="subdued">
                No products found.
              </s-paragraph>
            ) : (
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                {products.map((product) => {
                  const isOnSale =
                    product.compareAtPrice !== null &&
                    product.price !== null &&
                    parseFloat(product.compareAtPrice.replace(/[^0-9.]/g, "")) >
                      parseFloat(product.price.replace(/[^0-9.]/g, ""));
                  return (
                    <s-clickable
                      key={product.id}
                      padding="base"
                      background="subdued"
                      onClick={() => selectProduct(product)}
                    >
                      <s-stack direction="block" gap="small-200">
                        {product.imageUrl ? (
                          <s-image
                            src={product.imageUrl}
                            alt={product.title}
                            aspectRatio="1/1"
                            objectFit="cover"
                          />
                        ) : null}
                        <s-text>{product.title}</s-text>
                        {product.price ? (
                          <s-stack direction="inline" gap="small-200" alignItems="center">
                            <s-text>{product.price}</s-text>
                            {isOnSale ? (
                              <s-badge tone="critical">Sale</s-badge>
                            ) : null}
                          </s-stack>
                        ) : null}
                      </s-stack>
                    </s-clickable>
                  );
                })}
              </s-grid>
            )}
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            <s-stack direction="block" gap="small-200">
              <s-text color="subdued">Question type</s-text>
              <s-stack direction="inline" gap="small-200">
                <s-button
                  variant={form.type === "freeform" ? "primary" : "secondary"}
                  onClick={() => setForm((prev) => ({ ...prev, type: "freeform" }))}
                >
                  Free-form question
                </s-button>
                <s-button
                  variant={form.type === "product" ? "primary" : "secondary"}
                  onClick={() => setForm((prev) => ({ ...prev, type: "product" }))}
                >
                  Specific product
                </s-button>
              </s-stack>
            </s-stack>

            {form.type === "freeform" ? (
              <s-text-field
                label="Question"
                value={form.question}
                details="How a shopper might phrase it — the assistant matches similar wording too."
                onChange={(event: Event) => {
                  const value = (event.currentTarget as HTMLInputElement).value;
                  setForm((prev) => ({ ...prev, question: value }));
                }}
              />
            ) : form.productTitle ? (
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-badge tone="info">{form.productTitle}</s-badge>
                <s-button variant="tertiary" onClick={openProductPicker}>
                  Change product
                </s-button>
              </s-stack>
            ) : (
              <s-button variant="secondary" onClick={openProductPicker}>
                Select product
              </s-button>
            )}

            <s-text-area
              label="Answer"
              value={form.answer}
              rows={4}
              onChange={(event: Event) => {
                const value = (event.currentTarget as HTMLTextAreaElement).value;
                setForm((prev) => ({ ...prev, answer: value }));
              }}
            />

            {form.mediaName ? (
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  {form.mediaType === "image" && form.mediaUrl ? (
                    <>
                      <s-thumbnail
                        src={form.mediaUrl}
                        alt={form.mediaName}
                        size="base"
                      />
                      <s-text>{form.mediaName}</s-text>
                    </>
                  ) : (
                    <s-badge tone="info">
                      {form.mediaType === "image" ? "Image: " : "Video: "}
                      {form.mediaName}
                    </s-badge>
                  )}
                  <s-button variant="tertiary" onClick={removeMedia}>
                    Remove
                  </s-button>
                </s-stack>
                {form.mediaType === "video" ? (
                  <VideoTimestampFields
                    start={form.mediaStart}
                    end={form.mediaEnd}
                    onChange={(next) =>
                      setForm((prev) => ({
                        ...prev,
                        mediaStart: next.start ?? prev.mediaStart,
                        mediaEnd: next.end ?? prev.mediaEnd,
                      }))
                    }
                  />
                ) : null}
              </s-stack>
            ) : (
              <s-stack direction="inline" gap="small-200">
                <s-button variant="secondary" onClick={openVideoPicker}>
                  Attach video
                </s-button>
                <s-button variant="secondary" onClick={openImagePicker}>
                  Attach image
                </s-button>
              </s-stack>
            )}
          </s-stack>
        )}

        {pickerMode ? (
          <s-button slot="secondary-actions" onClick={closePicker}>
            Back
          </s-button>
        ) : (
          <>
            <s-button
              slot="secondary-actions"
              commandFor="knowledge-modal"
              command="--hide"
            >
              Cancel
            </s-button>
            <s-button
              slot="primary-action"
              variant="primary"
              onClick={handleSave}
              {...(isSaving ? { loading: true } : {})}
            >
              Save
            </s-button>
          </>
        )}
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
