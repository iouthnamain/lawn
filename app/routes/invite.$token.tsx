import { createFileRoute } from "@tanstack/react-router";
import { ConvexClientProvider } from "@/lib/convex";
import { convexConnectionLinks, seoHead } from "@/lib/seo";
import InvitePage from "./-invite";

export const Route = createFileRoute("/invite/$token")({
  head: () => {
    const head = seoHead({
      title: "Join team",
      description: "Accept your team invitation on lawn.",
      path: "/invite",
      noIndex: true,
    });

    return { ...head, links: [...head.links, ...convexConnectionLinks()] };
  },
  component: InviteRoute,
});

function InviteRoute() {
  return (
    <ConvexClientProvider>
      <InvitePage />
    </ConvexClientProvider>
  );
}
