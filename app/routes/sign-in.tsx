import { createFileRoute } from "@tanstack/react-router";
import { ConvexClientProvider } from "@/lib/convex";
import { seoHead } from "@/lib/seo";
import { AuthShell } from "./auth/-layout";
import SignInPage from "./auth/-sign-in";

export const Route = createFileRoute("/sign-in")({
  head: () =>
    seoHead({
      title: "Sign in",
      description: "Sign in to your lawn account.",
      path: "/sign-in",
      noIndex: true,
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect_url: typeof search.redirect_url === "string" ? search.redirect_url : undefined,
  }),
  component: SignInRoute,
});

function SignInRoute() {
  return (
    <ConvexClientProvider>
      <AuthShell>
        <SignInPage />
      </AuthShell>
    </ConvexClientProvider>
  );
}
