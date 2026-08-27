import prisma from "./db.server";
import { parseTimeInput } from "./media-timestamp";
import type { KnowledgeCollection } from "./components/settings/knowledge-sync-section";

export type SaveKnowledgeEntryPayload = {
  id?: string;
  type?: string;
  question?: string;
  productId?: string;
  productTitle?: string;
  productHandle?: string;
  answer?: string;
  mediaType?: string;
  mediaId?: string;
  mediaUrl?: string;
  mediaName?: string;
  mediaStart?: string;
  mediaEnd?: string;
  fromQueryLog?: boolean;
};

export async function saveKnowledgeEntry(
  shop: string,
  sessionId: string,
  payload: SaveKnowledgeEntryPayload,
) {
  const type = payload.type === "product" ? "product" : "freeform";
  const answer = String(payload.answer ?? "").trim();
  const mediaType = String(payload.mediaType ?? "").trim() || null;
  const mediaId = String(payload.mediaId ?? "").trim() || null;
  const mediaUrl = String(payload.mediaUrl ?? "").trim() || null;
  const mediaName = String(payload.mediaName ?? "").trim() || null;
  const mediaStartInput = String(payload.mediaStart ?? "").trim();
  const mediaEndInput = String(payload.mediaEnd ?? "").trim();

  if (!answer) {
    return { error: "Answer is required." } as const;
  }

  // Timestamps only mean anything for a video — an image entry never carries
  // them, even if a stale form value came along for the ride.
  let mediaStartSeconds: number | null = null;
  let mediaEndSeconds: number | null = null;

  if (mediaType === "video") {
    if (mediaStartInput) {
      mediaStartSeconds = parseTimeInput(mediaStartInput);
      if (mediaStartSeconds === null) {
        return { error: "Start time must be seconds (10) or mm:ss (0:10)." } as const;
      }
    }
    if (mediaEndInput) {
      mediaEndSeconds = parseTimeInput(mediaEndInput);
      if (mediaEndSeconds === null) {
        return { error: "End time must be seconds (15) or mm:ss (0:15)." } as const;
      }
    }
    if (
      mediaStartSeconds !== null &&
      mediaEndSeconds !== null &&
      mediaEndSeconds <= mediaStartSeconds
    ) {
      return { error: "End time must be after the start time." } as const;
    }
  }

  let question: string | null = null;
  let productId: string | null = null;
  let productTitle: string | null = null;
  let productHandle: string | null = null;

  if (type === "freeform") {
    question = String(payload.question ?? "").trim();
    if (!question) {
      return { error: "Question is required for a free-form entry." } as const;
    }
  } else {
    productId = String(payload.productId ?? "").trim();
    productTitle = String(payload.productTitle ?? "").trim();
    productHandle = String(payload.productHandle ?? "").trim() || null;
    if (!productId || !productTitle) {
      return { error: "Select a product for this entry." } as const;
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
    const existing = await prisma.knowledgeEntry.findUnique({ where: { id } });
    if (!existing || existing.shop !== shop) {
      return { error: "That entry no longer exists." } as const;
    }
    const entry = await prisma.knowledgeEntry.update({ where: { id }, data });
    return { entry } as const;
  }

  const source = payload.fromQueryLog ? "query-log" : "manual";
  const dbSession = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { email: true },
  });
  const entry = await prisma.knowledgeEntry.create({
    data: {
      shop,
      ...data,
      source,
      createdByEmail: dbSession?.email ?? null,
    },
  });
  return { entry } as const;
}

export async function deleteKnowledgeEntry(shop: string, id: string) {
  await prisma.knowledgeEntry.deleteMany({ where: { id, shop } });
  return { ok: true } as const;
}

export async function syncKnowledgeCollections(
  shop: string,
  rawCollections: unknown,
) {
  const knowledgeCollections: KnowledgeCollection[] = Array.isArray(rawCollections)
    ? rawCollections
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
    where: { shop },
    update: { knowledgeCollections },
    create: { shop, knowledgeCollections },
  });
  return { ok: true, knowledgeCollections } as const;
}
