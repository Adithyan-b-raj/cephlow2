import { Switch, Route, Router as WouterRouter, useRoute, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout/Layout";
import Dashboard from "@/pages/Dashboard";
import NewBatch from "@/pages/batches/NewBatch";
import BatchDetail from "@/pages/batches/BatchDetail";
import History from "@/pages/History";
import Wallet from "@/pages/Wallet";
import NewTemplate from "@/pages/templates/NewTemplate";
import VerifyCertificate from "@/pages/VerifyCertificate";
import StudentProfile from "@/pages/StudentProfile";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";
import Reports from "@/pages/Reports";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthenticatedRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/batches/new" component={NewBatch} />
        <Route path="/batches/:id" component={BatchDetail} />
        <Route path="/history" component={History} />
        <Route path="/wallet" component={Wallet} />
        <Route path="/reports" component={Reports} />
        <Route path="/templates/new" component={NewTemplate} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function ConnectGoogleScreen() {
  const { connectGoogle, logout } = useAuth();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Connect Google Account</h1>
        <p className="text-muted-foreground max-w-sm">
          Grant access to your Google Drive, Sheets, Slides, and Gmail so certificates can be generated and sent on your behalf.
        </p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={connectGoogle}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Connect Google Account
        </button>
        <button
          onClick={logout}
          className="w-full rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

// App paths that should never be treated as student profile slugs
const KNOWN_APP_PATHS = ["/login", "/batches", "/history", "/wallet", "/templates", "/auth", "/verify", "/reports"];

function AppRouter() {
  const { user, loading, hasGoogleAuth } = useAuth();
  const [location] = useLocation();
  const [isVerifyRoute] = useRoute("/verify/:batchId/:certId");
  const [isProfileRoute] = useRoute("/:username");

  // Public certificate verification page — no auth required
  if (isVerifyRoute) return <VerifyCertificate />;

  // Public student profile page — slug-like path not matching any app route
  const isKnownPath =
    location === "/" ||
    KNOWN_APP_PATHS.some((p) => location === p || location.startsWith(p + "/"));
  if (isProfileRoute && !isKnownPath) return <StudentProfile />;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Login />;
  if (!hasGoogleAuth) return <ConnectGoogleScreen />;

  return (
    <Switch>
      <Route>
        <AuthenticatedRouter />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
