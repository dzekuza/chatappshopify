// Video timestamps on knowledge entries.
//
// A merchant can mark the relevant slice of an attached how-to video (e.g.
// "roof assembly is shown from 0:10 to 0:15"). That range travels to the
// shopper as a standard media fragment on the URL — `…/clip.mp4#t=10,15` —
// because the URL is the only thing that survives the round trip through the
// model's reply text. Players (the storefront widget and the admin preview)
// then seek to the start and stop at the end.

export type MediaRange = { start: number | null; end: number | null };

// Accepts plain seconds ("10", "10s") or clock notation ("0:10", "1:02:03").
export function parseTimeInput(value: string): number | null {
  const trimmed = value.trim().replace(/s$/i, "");
  if (!trimmed) return null;

  const parts = trimmed.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(?:\.\d+)?$/.test(p.trim()))) {
    return null;
  }

  const seconds = parts.reduce(
    (total, part) => total * 60 + parseFloat(part.trim()),
    0,
  );
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds);
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`;
}

// `#t=start,end` — end alone isn't valid on its own, so a range with only an
// end is emitted as `#t=0,end`.
export function withMediaFragment(
  url: string,
  start: number | null | undefined,
  end: number | null | undefined,
): string {
  if (start == null && end == null) return url;
  const base = url.split("#")[0];
  const from = start ?? 0;
  return end == null ? `${base}#t=${from}` : `${base}#t=${from},${end}`;
}

export function parseMediaFragment(url: string): MediaRange {
  const match = url.match(/#t=(\d+(?:\.\d+)?)?(?:,(\d+(?:\.\d+)?))?/);
  if (!match) return { start: null, end: null };
  const start = match[1] === undefined ? null : parseFloat(match[1]);
  const end = match[2] === undefined ? null : parseFloat(match[2]);
  return {
    start: start !== null && Number.isFinite(start) ? start : null,
    end: end !== null && Number.isFinite(end) ? end : null,
  };
}

// Human-readable range for the prompt / admin UI, e.g. "0:10–0:15".
export function describeRange(
  start: number | null | undefined,
  end: number | null | undefined,
): string {
  if (start == null && end == null) return "";
  if (end == null) return `from ${formatTimestamp(start ?? 0)}`;
  if (start == null) return `up to ${formatTimestamp(end)}`;
  return `from ${formatTimestamp(start)} to ${formatTimestamp(end)}`;
}
