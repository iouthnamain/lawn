import { useAction } from "convex/react";
import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  videoId: Id<"videos">;
  fallback: ReactNode;
};

export function VideoThumbnail({ videoId, fallback, ...imageProps }: Props) {
  const getThumbnails = useAction(api.videoActions.getThumbnailUrls);
  const [thumbnail, setThumbnail] = useState<{ videoId: Id<"videos">; url: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [result] = await getThumbnails({ videoIds: [videoId] });
        if (!cancelled) setThumbnail(result ?? null);
      } catch {
        if (!cancelled) setThumbnail(null);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 45 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [getThumbnails, videoId]);
  if (thumbnail?.videoId !== videoId) return fallback;
  return <img {...imageProps} src={thumbnail.url} onError={() => setThumbnail(null)} />;
}
