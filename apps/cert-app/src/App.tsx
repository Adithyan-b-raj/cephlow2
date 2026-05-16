import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useRoute, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ApprovalProvider } from "@/hooks/use-approval";
import { WorkspaceProvider } from "@/hooks/use-workspace";
import { Layout } from "@/components/layout/Layout";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const NewBatch = lazy(() => import("@/pages/batches/NewBatch"));
const BatchDetail = lazy(() => import("@/pages/batches/BatchDetail"));
const History = lazy(() => import("@/pages/History"));
const Wallet = lazy(() => import("@/pages/Wallet"));
const NewTemplate = lazy(() => import("@/pages/templates/NewTemplate"));
const BuiltinTemplateEditorPage = lazy(() => import("@/pages/templates/BuiltinTemplateEditor"));
const BuiltinTemplatesListPage = lazy(() => import("@/pages/templates/BuiltinTemplatesList"));
const VerifyCertificate = lazy(() => import("@/pages/VerifyCertificate"));
const StudentProfile = lazy(() => import("@/pages/StudentProfile"));
const Login = lazy(() => import("@/pages/Login"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Reports = lazy(() => import("@/pages/Reports"));
const Advanced = lazy(() => import("@/pages/Advanced"));
const Landing = lazy(() => import("@/pages/Landing"));
const WorkspaceMembers = lazy(() => import("@/pages/workspace/Members"));
const WorkspaceBrand = lazy(() => import("@/pages/workspace/Brand"));
const Invitations = lazy(() => import("@/pages/workspace/Invitations"));
const InviteAccept = lazy(() => import("@/pages/InviteAccept"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsAndConditions = lazy(() => import("@/pages/TermsAndConditions"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const SettingsPage = lazy(() => import("@/pages/Settings"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthenticatedRouter() {
  // The builtin template editor is full-screen and renders its own chrome,
  // so it must NOT be wrapped in <Layout> (which adds sidebar + sticky header).
  const [isBuiltinEditor] = useRoute("/templates/builtin/:id");
  if (isBuiltinEditor) {
    return <BuiltinTemplateEditorPage />;
  }

  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/batches/new" component={NewBatch} />
          <Route path="/batches/:id" component={BatchDetail} />
          <Route path="/history" component={History} />
          <Route path="/wallet" component={Wallet} />
          <Route path="/reports" component={Reports} />
          <Route path="/advanced" component={Advanced} />
          <Route path="/templates" component={BuiltinTemplatesListPage} />
          <Route path="/templates/new" component={NewTemplate} />
          <Route path="/workspace/members" component={WorkspaceMembers} />
          <Route path="/workspace/brand" component={WorkspaceBrand} />
          <Route path="/workspace/invitations" component={Invitations} />
          <Route path="/invite" component={InviteAccept} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Layout>
  );
}

// App paths that should never be treated as student profile slugs
const KNOWN_APP_PATHS = ["/login", "/batches", "/history", "/wallet", "/templates", "/auth", "/verify", "/reports", "/workspace", "/invite", "/privacy", "/terms", "/forgot-password", "/reset-password", "/advanced", "/settings"];

function AppRouter() {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const [isVerifyRoute] = useRoute("/verify/:batchId/:certId");
  const [isProfileRoute] = useRoute("/:username");

  // Public legal pages — no auth required
  if (location === "/privacy") return <PrivacyPolicy />;
  if (location === "/terms") return <TermsAndConditions />;

  // Public auth flow pages — no auth required
  if (location === "/forgot-password") return <ForgotPassword />;
  if (location === "/reset-password") return <ResetPassword />;

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

  if (!user) {
    if (location === "/") return <Landing />;
    return <Login />;
  }
  // Redirect authenticated users from /login to dashboard
  if (location === "/login") {
    setLocation("/", { replace: true });
    return null;
  }

  return (
    <Switch>
      <Route>
        <AuthenticatedRouter />
      </Route>
    </Switch>
  );
}

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

function App() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <ApprovalProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={300}>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Suspense fallback={<PageLoader />}>
                  <AppRouter />
                </Suspense>
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </QueryClientProvider>
        </ApprovalProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
}

export default App;
