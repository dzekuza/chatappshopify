import { useEffect, useRef } from "react";
import { parseMediaFragment } from "../media-timestamp";

type TimestampedVideoProps = {
  src: string;
  className?: string;
  width?: number;
};

// A knowledge-entry video whose URL may carry a `#t=start,end` media
// fragment. Most browsers honour the fragment on their own, but not all of
// them do (and not consistently for streamed CDN media), so the start seek
// and the stop-at-end are enforced here too.
export function TimestampedVideo({ src, className, width }: TimestampedVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const { start, end } = parseMediaFragment(src);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const seekToStart = () => {
      if (start !== null && video.currentTime < start) {
        video.currentTime = start;
      }
    };

    // Re-arms whenever the shopper scrubs back before the end, so replaying
    // the clip works instead of pausing instantly forever.
    let stopped = false;
    const stopAtEnd = () => {
      if (end === null) return;
      if (video.currentTime < end - 0.25) {
        stopped = false;
        return;
      }
      if (stopped) return;
      stopped = true;
      video.pause();
    };

    if (video.readyState >= 1) seekToStart();
    video.addEventListener("loadedmetadata", seekToStart);
    video.addEventListener("timeupdate", stopAtEnd);
    return () => {
      video.removeEventListener("loadedmetadata", seekToStart);
      video.removeEventListener("timeupdate", stopAtEnd);
    };
  }, [src, start, end]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- merchant-uploaded videos have no caption track
    <video
      ref={ref}
      src={src}
      controls
      playsInline
      className={className}
      width={width}
    />
  );
}
