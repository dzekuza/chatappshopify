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

const EMPTY_FORM = {
  id: "",
  question: "",
  answer: "",
  videoId: "",
  videoUrl: "",
  videoName: "",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const entries = await prisma.knowledgeEntry.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  return { entries };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const payload = await request.json();
  const intent = String(payload.intent ?? "save");

  if (intent === "delete") {
    const id = String(payload.id ?? "");
    await prisma.knowledgeEntry.deleteMany({
      where: { id, shop: session.shop },
    });
    return { ok: true };
  }

  const question = String(payload.question ?? "").trim();
  const answer = String(payload.answer ?? "").trim();
  const videoId = String(payload.videoId ?? "").trim() || null;
  const videoUrl = String(payload.videoUrl ?? "").trim() || null;
  const videoName = String(payload.videoName ?? "").trim() || null;

  if (!question || !answer) {
    return { error: "Question and answer are required." };
  }

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
      data: { question, answer, videoId, videoUrl, videoName },
    });
    return { entry };
  }

  const entry = await prisma.knowledgeEntry.create({
    data: {
      shop: session.shop,
      question,
      answer,
      videoId,
      videoUrl,
      videoName,
    },
  });
  return { entry };
};

export default function Knowledge() {
  const { entries } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const videoFetcher = useFetcher<{ videos: VideoFile[] }>();
  const shopify = useAppBridge();

  const [form, setForm] = useState(EMPTY_FORM);
  const modalRef = useRef<{ hideOverlay: () => void }>(null);
  const videoModalRef = useRef<{ hideOverlay: () => void }>(null);

  const isSaving = fetcher.state !== "idle";
  const videos = videoFetcher.data?.videos ?? [];
  const isLoadingVideos = videoFetcher.state !== "idle";

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
  };

  const openEditEntry = (entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    setForm({
      id: entry.id,
      question: entry.question,
      answer: entry.answer,
      videoId: entry.videoId ?? "",
      videoUrl: entry.videoUrl ?? "",
      videoName: entry.videoName ?? "",
    });
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
  };

  const selectVideo = (video: VideoFile) => {
    setForm((prev) => ({
      ...prev,
      videoId: video.id,
      videoUrl: video.url,
      videoName: video.filename,
    }));
    videoModalRef.current?.hideOverlay();
  };

  const removeVideo = () => {
    setForm((prev) => ({ ...prev, videoId: "", videoUrl: "", videoName: "" }));
  };

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
            specific way — with an optional video attached, e.g. a how-to
            clip. When a shopper asks something close to one of these, the
            assistant uses your answer (and shows the video) instead of
            guessing.
          </s-paragraph>

          {entries.length === 0 ? (
            <s-paragraph tone="neutral" color="subdued">
              No custom questions yet.
            </s-paragraph>
          ) : (
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Question</s-table-header>
                <s-table-header listSlot="secondary">Answer</s-table-header>
                <s-table-header listSlot="inline">Video</s-table-header>
                <s-table-header listSlot="labeled" />
              </s-table-header-row>
              <s-table-body>
                {entries.map((entry) => {
                  const editLinkId = `edit-${entry.id}`;
                  return (
                    <s-table-row key={entry.id} clickDelegate={editLinkId}>
                      <s-table-cell>
                        <s-link
                          id={editLinkId}
                          commandFor="knowledge-modal"
                          command="--show"
                          onClick={() => openEditEntry(entry.id)}
                        >
                          {entry.question}
                        </s-link>
                      </s-table-cell>
                      <s-table-cell>
                        {entry.answer.length > 100
                          ? `${entry.answer.slice(0, 100)}…`
                          : entry.answer}
                      </s-table-cell>
                      <s-table-cell>
                        {entry.videoUrl ? (
                          <s-badge tone="info">Video attached</s-badge>
                        ) : (
                          <s-text color="subdued">None</s-text>
                        )}
                      </s-table-cell>
                      <s-table-cell>
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          {...(isSaving ? { loading: true } : {})}
                          onClick={() => handleDelete(entry.id)}
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
        </s-stack>
      </s-section>

      <s-modal
        ref={modalRef as any}
        id="knowledge-modal"
        heading="Custom question"
      >
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Question"
            value={form.question}
            details="How a shopper might phrase it — the assistant matches similar wording too."
            onChange={(event: any) => {
              const value = event.currentTarget.value;
              setForm((prev) => ({ ...prev, question: value }));
            }}
          />
          <s-text-area
            label="Answer"
            value={form.answer}
            rows={4}
            onChange={(event: any) => {
              const value = event.currentTarget.value;
              setForm((prev) => ({ ...prev, answer: value }));
            }}
          />

          {form.videoName ? (
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-badge tone="info">{form.videoName}</s-badge>
              <s-button variant="tertiary" onClick={removeVideo}>
                Remove video
              </s-button>
            </s-stack>
          ) : (
            <s-button
              variant="secondary"
              commandFor="video-picker-modal"
              command="--show"
              onClick={openVideoPicker}
            >
              Attach video from Shopify media
            </s-button>
          )}
        </s-stack>

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
      </s-modal>

      <s-modal
        ref={videoModalRef as any}
        id="video-picker-modal"
        heading="Select a video"
      >
        {isLoadingVideos ? (
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
        )}

        <s-button
          slot="secondary-actions"
          commandFor="video-picker-modal"
          command="--hide"
        >
          Close
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

