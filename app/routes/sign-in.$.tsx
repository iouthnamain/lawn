import { createFileRoute } from "@tanstack/react-router";
import { ConvexClientProvider } from "@/lib/convex";
import { AuthShell } from "./auth/-layout";
import SignInPage from "./auth/-sign-in";

export const Route = createFileRoute("/sign-in/$")({
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
