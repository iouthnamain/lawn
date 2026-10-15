import { createFileRoute } from "@tanstack/react-router";
import { ConvexClientProvider } from "@/lib/convex";
import { seoHead } from "@/lib/seo";
import { AuthShell } from "./auth/-layout";
import SignUpPage from "./auth/-sign-up";

export const Route = createFileRoute("/sign-up")({
  head: () =>
    seoHead({
      title: "Account access",
      description: "Request a local account from your Lawn operator.",
      noIndex: true,
      path: "/sign-up",
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect_url: typeof search.redirect_url === "string" ? search.redirect_url : undefined,
  }),
  component: SignUpRoute,
});

function SignUpRoute() {
  return (
    <ConvexClientProvider>
      <AuthShell>
        <SignUpPage />
      </AuthShell>
    </ConvexClientProvider>
  );
}
