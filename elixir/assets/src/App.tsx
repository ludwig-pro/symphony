import { useDeferredValue } from "react";
import { TriangleAlertIcon, WifiOffIcon } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  runningEntries,
  trackedIssueCount,
  retryEntries,
} from "@/lib/dashboard";
import { useDashboardState } from "@/hooks/use-dashboard-state";
import { useDashboardRouter } from "@/hooks/use-dashboard-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardPageContent } from "@/pages/dashboard-pages";

function App() {
  const { pathname, page, navigate } = useDashboardRouter();
  const {
    snapshot,
    isLoading,
    isFetching,
    networkError,
    isSwitchingAgent,
    switchAgent,
  } = useDashboardState();
  const deferredSnapshot = useDeferredValue(snapshot);
  const activeSnapshot = deferredSnapshot ?? snapshot;
  const running = runningEntries(activeSnapshot);
  const retrying = retryEntries(activeSnapshot);
  const now = Date.now();
  const primaryIssue = running[0] ?? null;

  return (
    <div className="dark min-h-svh bg-background text-foreground">
      <TooltipProvider delayDuration={0}>
        <SidebarProvider defaultOpen>
          <AppSidebar
            snapshot={activeSnapshot}
            networkError={networkError}
            pathname={pathname}
            onNavigate={navigate}
          />
          <SidebarInset className="bg-transparent">
            <div className="dashboard-shell">
              <SiteHeader
                page={page}
                snapshot={activeSnapshot}
                networkError={networkError}
                primaryIssue={primaryIssue}
                isFetching={isFetching}
              />

              <div className="dashboard-page">
                {activeSnapshot?.error ? (
                  <Alert variant="destructive">
                    <TriangleAlertIcon className="size-4" />
                    <AlertTitle>Instantané indisponible</AlertTitle>
                    <AlertDescription>
                      {activeSnapshot.error.code}:{" "}
                      {activeSnapshot.error.message}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {networkError ? (
                  <Alert>
                    <WifiOffIcon className="size-4" />
                    <AlertTitle>Dernier état conservé</AlertTitle>
                    <AlertDescription>{networkError}</AlertDescription>
                  </Alert>
                ) : null}

                <DashboardPageContent
                  pageId={page.id}
                  snapshot={activeSnapshot}
                  running={running}
                  retrying={retrying}
                  trackedIssueCount={trackedIssueCount(
                    activeSnapshot?.counts ?? { running: 0, retrying: 0 },
                  )}
                  isLoading={isLoading}
                  isSwitchingAgent={isSwitchingAgent}
                  now={now}
                  onNavigate={navigate}
                  onSwitchAgent={switchAgent}
                />
              </div>
            </div>
          </SidebarInset>
          <Toaster position="top-right" richColors />
        </SidebarProvider>
      </TooltipProvider>
    </div>
  );
}

export default App;
