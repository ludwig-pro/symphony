import { Clock3Icon, RadioTowerIcon } from "lucide-react"

import {
  dashboardMode,
  dashboardModeCopy,
  formatSnapshotDate,
  type DashboardPayload,
  type RunningEntry,
} from "@/lib/dashboard"
import { type DashboardPage } from "@/lib/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

type SiteHeaderProps = {
  page: DashboardPage
  snapshot: DashboardPayload | null
  networkError: string | null
  primaryIssue: RunningEntry | null
  isFetching: boolean
}

export function SiteHeader({
  page,
  snapshot,
  networkError,
  primaryIssue,
  isFetching,
}: SiteHeaderProps) {
  const currentCounts = snapshot?.counts ?? { running: 0, retrying: 0 }

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur">
      <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="hidden h-5 data-[orientation=vertical]:h-5 sm:block"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {page.eyebrow}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {page.title}
              </h1>
              <Badge
                variant="outline"
                className={
                  networkError
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }
              >
                <RadioTowerIcon className="size-3.5" />
                {networkError ? "Connexion perdue" : "Polling 1s"}
              </Badge>
              <Badge variant="secondary">
                {dashboardMode(currentCounts)}
              </Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {page.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/api/v1/state">API d'état</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/api/v1/config/agent">API des agents</a>
            </Button>
            {primaryIssue ? (
              <Button asChild size="sm">
                <a href={`/api/v1/${primaryIssue.issue_identifier}`}>JSON de l'issue</a>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card/80 px-4 py-3 shadow-sm">
          <p className="max-w-4xl text-sm text-muted-foreground">
            {networkError ?? dashboardModeCopy(currentCounts)}
          </p>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3Icon className={`size-4 ${isFetching ? "animate-pulse" : ""}`} />
            <span>Instantané {formatSnapshotDate(snapshot?.generated_at)}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
