import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useRoute, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ApprovalProvider } from "@/hooks/use-approval";
import { WorkspaceProvider } from "@/hooks/use-workspace";
import { Layout } from "@/components/layout/Layout";
import Dashboard from "@/pages/Dashboard";
import NewBatch from "@/pages/batches/NewBatch";
import BatchDetail from "@/pages/batches/BatchDetail";
import History from "@/pages/History";
import Wallet from "@/pages/Wallet";
import NewTemplate from "@/pages/templates/NewTemplate";
import BuiltinTemplateEditorPage from "@/pages/templates/BuiltinTemplateEditor";
import BuiltinTemplatesListPage from "@/pages/templates/BuiltinTemplatesList";
import VerifyCertificate from "@/pages/VerifyCertificate";
import StudentProfile from "@/pages/StudentProfile";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";
import Reports from "@/pages/Reports";
import Landing from "@/pages/Landing";
import WorkspaceMembers from "@/pages/workspace/Members";
import WorkspaceBrand from "@/pages/workspace/Brand";
import InviteAccept from "@/pages/InviteAccept";

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
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/batches/new" component={NewBatch} />
        <Route path="/batches/:id" component={BatchDetail} />
        <Route path="/history" component={History} />
        <Route path="/wallet" component={Wallet} />
        <Route path="/reports" component={Reports} />
        <Route path="/templates" component={BuiltinTemplatesListPage} />
        <Route path="/templates/new" component={NewTemplate} />
        <Route path="/workspace/members" component={WorkspaceMembers} />
        <Route path="/workspace/brand" component={WorkspaceBrand} />
        <Route path="/invite" component={InviteAccept} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

const GOOGLE_SERVICES = [
  {
    name: "GOOGLE SHEETS",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="1" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    ),
    reason: "Read recipient data (names, emails, event details) from your spreadsheets.",
  },
  {
    name: "GOOGLE SLIDES",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="4" width="20" height="16" rx="1" />
        <rect x="6" y="8" width="12" height="8" rx="0" strokeDasharray="2 2" />
      </svg>
    ),
    reason: "Access your certificate templates and generate personalised slides for each recipient.",
  },
  {
    name: "GOOGLE DRIVE",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 19h20L12 2z" />
        <line x1="6" y1="14" x2="18" y2="14" />
      </svg>
    ),
    reason: "Store generated certificate PDFs and organise them into batch folders.",
  },
  {
    name: "GMAIL",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="4" width="20" height="16" rx="1" />
        <polyline points="2,4 12,13 22,4" />
      </svg>
    ),
    reason: "Send personalised emails with certificate PDFs attached to each recipient.",
  },
];

function PipelineMockup() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 4);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-3 w-full max-w-sm">
      {/* Spreadsheet mockup */}
      <div
        className="border bg-white/5 overflow-hidden transition-all duration-500"
        style={{
          borderColor: activeStep === 0 ? "white" : "rgba(255,255,255,0.15)",
          boxShadow: activeStep === 0 ? "0 0 20px rgba(255,255,255,0.1)" : "none",
        }}
      >
        <div className="px-3 py-1.5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="1" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <span className="text-[8px] tracking-widest font-bold">RECIPIENTS.XLSX</span>
          </div>
          {activeStep === 0 && <span className="text-[7px] tracking-wider text-green-400 animate-pulse">READING...</span>}
        </div>
        <div className="text-[8px]">
          {[["NAME", "EMAIL", "EVENT"], ["Adithyan B Raj", "adithyan@e...", "Xcepthon"], ["Sarah Chen", "sarah.c@...", "Xcepthon"], ["Ravi Kumar", "ravi.k@...", "Xcepthon"]].map((row, ri) => (
            <div
              key={ri}
              className={`grid grid-cols-3 border-b border-white/5 ${
                ri === 0 ? "font-bold text-white/60" : ri <= activeStep && activeStep === 0 ? "text-white" : "text-white/30"
              }`}
            >
              {row.map((cell, ci) => (
                <div key={ci} className="px-2 py-1 border-r border-white/5 truncate">{cell}</div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center">
        <div className={`text-[10px] transition-colors duration-500 ${activeStep >= 1 ? "text-white" : "text-white/20"}`}>▼</div>
      </div>

      {/* Template mockup */}
      <div
        className="border overflow-hidden transition-all duration-500"
        style={{
          borderColor: activeStep === 1 ? "white" : "rgba(255,255,255,0.15)",
          boxShadow: activeStep === 1 ? "0 0 20px rgba(255,255,255,0.1)" : "none",
        }}
      >
        <div className="px-3 py-1.5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="1" />
              <rect x="6" y="8" width="12" height="8" rx="0" strokeDasharray="2 2" />
            </svg>
            <span className="text-[8px] tracking-widest font-bold">CERTIFICATE TEMPLATE</span>
          </div>
          {activeStep === 1 && <span className="text-[7px] tracking-wider text-green-400 animate-pulse">MERGING...</span>}
        </div>
        <div className="p-3 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="border border-white/20 w-full py-4 text-center">
            <div className="text-[7px] tracking-widest text-white/30 mb-1">CERTIFICATE OF ACHIEVEMENT</div>
            <div className={`text-sm font-bold transition-all duration-700 ${activeStep >= 1 ? "text-white" : "text-white/20"}`}>
              {activeStep >= 1 ? "Adithyan B Raj" : "<<Name>>"}
            </div>
            <div className={`text-[8px] mt-1 transition-all duration-700 ${activeStep >= 1 ? "text-white/60" : "text-white/20"}`}>
              {activeStep >= 1 ? "Xcepthon 2026" : "<<Event>>"}
            </div>
          </div>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center">
        <div className={`text-[10px] transition-colors duration-500 ${activeStep >= 2 ? "text-white" : "text-white/20"}`}>▼</div>
      </div>

      {/* Output row: PDF + Email */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="border p-3 transition-all duration-500"
          style={{
            borderColor: activeStep === 2 ? "white" : "rgba(255,255,255,0.15)",
            boxShadow: activeStep === 2 ? "0 0 20px rgba(255,255,255,0.1)" : "none",
          }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 19h20L12 2z" />
              <line x1="6" y1="14" x2="18" y2="14" />
            </svg>
            <span className="text-[8px] tracking-widest font-bold">DRIVE</span>
          </div>
          <div className={`flex items-center gap-1.5 transition-all duration-500 ${activeStep >= 2 ? "text-white" : "text-white/20"}`}>
            <div className="w-5 h-6 border border-current flex items-center justify-center">
              <span className="text-[5px] font-bold">PDF</span>
            </div>
            <div className="text-[7px] truncate">Adithyan_cert.pdf</div>
          </div>
        </div>

        <div
          className="border p-3 transition-all duration-500"
          style={{
            borderColor: activeStep === 3 ? "white" : "rgba(255,255,255,0.15)",
            boxShadow: activeStep === 3 ? "0 0 20px rgba(255,255,255,0.1)" : "none",
          }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="1" />
              <polyline points="2,4 12,13 22,4" />
            </svg>
            <span className="text-[8px] tracking-widest font-bold">GMAIL</span>
          </div>
          <div className={`text-[7px] transition-all duration-500 ${activeStep >= 3 ? "text-white" : "text-white/20"}`}>
            <div className="truncate">To: adithyan@e...</div>
            <div className="text-white/40 truncate">Your certificate is ready ✓</div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1.5 pt-2">
        {["SHEETS", "SLIDES", "DRIVE", "GMAIL"].map((label, i) => (
          <div key={label} className="flex-1">
            <div
              className="h-0.5 mb-1 transition-all duration-500"
              style={{ background: i <= activeStep ? "white" : "rgba(255,255,255,0.1)" }}
            />
            <div className={`text-[7px] tracking-widest text-center transition-colors duration-500 ${i <= activeStep ? "text-white/80" : "text-white/20"}`}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectGoogleScreen() {
  const { connectGoogle, logout } = useAuth();
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      await connectGoogle();
    } catch {
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen flex font-mono bg-white">
      {/* Left panel — branding + animated mockup */}
      <div className="hidden lg:flex lg:w-1/2 bg-black text-white flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-8 h-8 border-2 border-white/30 flex items-center justify-center">
              <span className="text-xs font-bold">C</span>
            </div>
            <div>
              <div className="text-sm font-bold tracking-widest">CEPHLOW</div>
              <div className="text-[9px] tracking-widest text-white/40">CERTIFICATE AUTOMATION</div>
            </div>
          </div>
          <h1 className="text-3xl font-bold leading-tight mb-3">
            One connection.<br />Full automation.
          </h1>
          <p className="text-sm text-white/50 leading-relaxed max-w-sm mb-10">
            Link your Google account once and Cephlow handles the rest.
          </p>
        </div>

        {/* Animated pipeline mockup */}
        <div className="flex-1 flex items-center justify-center">
          <PipelineMockup />
        </div>

        <div className="text-[9px] tracking-widest text-white/20 mt-6">
          © 2026 CEPHLOW CERTIFICATE AUTHORITY
        </div>
      </div>

      {/* Right panel — connect action */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-lg">
          {/* Mobile branding (hidden on lg) */}
          <div className="lg:hidden flex items-center gap-2 mb-4">
            <div className="w-6 h-6 bg-black flex items-center justify-center">
              <span className="text-white text-[9px] font-bold">C</span>
            </div>
            <span className="text-sm font-bold tracking-widest">CEPHLOW</span>
          </div>

          <div className="text-[9px] tracking-widest text-gray-400 mb-1 lg:mb-2">ONE-TIME SETUP</div>
          <h2 className="text-xl lg:text-2xl font-bold mb-1 lg:mb-2">Connect Google Account</h2>
          <p className="text-xs lg:text-sm text-gray-500 leading-relaxed mb-4 lg:mb-8">
            Grant access so Cephlow can generate and deliver certificates on your behalf.
          </p>

          {/* Mobile: CTA first, then details below */}
          <div className="lg:hidden space-y-3 mb-4">
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full bg-black text-white text-xs tracking-widest font-bold py-3.5 hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {connecting ? "REDIRECTING..." : "CONNECT GOOGLE ACCOUNT \u2192"}
            </button>
            <button
              onClick={logout}
              className="w-full border border-black text-xs tracking-widest py-2.5 hover:bg-gray-50 transition-colors"
            >
              SIGN OUT
            </button>
          </div>

          {/* Mobile: compact inline service list */}
          <div className="lg:hidden space-y-2 mb-4">
            <div className="text-[9px] tracking-widest text-gray-400">SERVICES WE ACCESS</div>
            {GOOGLE_SERVICES.map((service) => (
              <div key={service.name} className="flex items-center gap-3 border border-gray-200 px-3 py-2">
                <div className="w-7 h-7 border border-black flex items-center justify-center shrink-0">
                  {service.icon}
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] font-bold tracking-widest">{service.name}</span>
                  <span className="text-[9px] text-gray-400 ml-1.5">{service.reason}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: compact security note */}
          <div className="lg:hidden flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200">
            <span className="text-xs">🔒</span>
            <p className="text-[9px] text-gray-500">Your data is encrypted and safe. Revoke access anytime.</p>
          </div>

          {/* Desktop: 2x2 grid cards */}
          <div className="hidden lg:grid grid-cols-2 gap-3 mb-8">
            {GOOGLE_SERVICES.map((service) => (
              <div
                key={service.name}
                className="border border-black p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="w-9 h-9 border border-black flex items-center justify-center mb-3">
                  {service.icon}
                </div>
                <div className="text-[10px] font-bold tracking-widest mb-1">{service.name}</div>
                <div className="text-[10px] text-gray-500 leading-relaxed">{service.reason}</div>
              </div>
            ))}
          </div>

          {/* Desktop: security note */}
          <div className="hidden lg:flex border border-gray-200 bg-gray-50 px-4 py-3 items-start gap-3 mb-8">
            <span className="text-sm mt-0.5">🔒</span>
            <div>
              <div className="text-[10px] font-bold tracking-widest mb-0.5">YOUR DATA IS SAFE</div>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                Credentials are encrypted end-to-end. Cephlow only accesses files you explicitly use in batches. Revoke access anytime from your Google account settings.
              </p>
            </div>
          </div>

          {/* Desktop: actions */}
          <div className="hidden lg:block">
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full bg-black text-white text-xs tracking-widest font-bold py-4 hover:bg-gray-800 transition-colors disabled:opacity-50 mb-3"
            >
              {connecting ? "REDIRECTING..." : "CONNECT GOOGLE ACCOUNT \u2192"}
            </button>
            <button
              onClick={logout}
              className="w-full border border-black text-xs tracking-widest py-3 hover:bg-gray-50 transition-colors"
            >
              SIGN OUT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// App paths that should never be treated as student profile slugs
const KNOWN_APP_PATHS = ["/login", "/batches", "/history", "/wallet", "/templates", "/auth", "/verify", "/reports", "/workspace", "/invite"];

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

  if (!user) {
    if (location === "/") return <Landing />;
    return <Login />;
  }
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
      <WorkspaceProvider>
        <ApprovalProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={300}>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <AppRouter />
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
