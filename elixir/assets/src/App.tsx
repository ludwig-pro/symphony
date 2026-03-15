import { useDeferredValue } from "react"
import { TriangleAlertIcon, WifiOffIcon } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { runningEntries, trackedIssueCount, retryEntries } from "@/lib/dashboard"
import { useDashboardState } from "@/hooks/use-dashboard-state"
import { useDashboardRouter } from "@/hooks/use-dashboard-router"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { DashboardPageContent } from "@/pages/dashboard-pages"

function App() {
  const { pathname, page, navigate } = useDashboardRouter()
  const {
    snapshot,
    isLoading,
    isFetching,
    networkError,
    isSwitchingAgent,
    switchAgent,
  } = useDashboardState()
  const deferredSnapshot = useDeferredValue(snapshot)
  const activeSnapshot = deferredSnapshot ?? snapshot
  const running = runningEntries(activeSnapshot)
  const retrying = retryEntries(activeSnapshot)
  const now = Date.now()
  const primaryIssue = running[0] ?? null

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen>
        <AppSidebar
          snapshot={activeSnapshot}
          networkError={networkError}
          pathname={pathname}
          onNavigate={navigate}
        />
        <SidebarInset className="bg-transparent">
          <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,_rgba(72,147,140,0.16),_transparent_28%),radial-gradient(circle_at_80%_0%,_rgba(232,186,110,0.15),_transparent_24%),linear-gradient(180deg,_rgba(253,251,246,0.98),_rgba(245,244,239,0.96))]">
            <SiteHeader
              page={page}
              snapshot={activeSnapshot}
              networkError={networkError}
              primaryIssue={primaryIssue}
              isFetching={isFetching}
            />

            <div className="flex flex-1 flex-col gap-6 px-4 py-5 lg:px-6 lg:py-6">
              {activeSnapshot?.error ? (
                <Alert variant="destructive">
                  <TriangleAlertIcon className="size-4" />
                  <AlertTitle>Instantané indisponible</AlertTitle>
                  <AlertDescription>
                    {activeSnapshot.error.code}: {activeSnapshot.error.message}
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
                  activeSnapshot?.counts ?? { running: 0, retrying: 0 }
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
  )
}

export default App
