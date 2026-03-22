import { Clock3Icon, RadioTowerIcon } from "lucide-react";

import {
  dashboardMode,
  dashboardModeCopy,
  formatSnapshotDate,
  type DashboardPayload,
  type RunningEntry,
} from "@/lib/dashboard";
import { type DashboardPage } from "@/lib/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

type SiteHeaderProps = {
  page: DashboardPage;
  snapshot: DashboardPayload | null;
  networkError: string | null;
  primaryIssue: RunningEntry | null;
  isFetching: boolean;
};

export function SiteHeader({
  page,
  snapshot,
  networkError,
  primaryIssue,
  isFetching,
}: SiteHeaderProps) {
  const currentCounts = snapshot?.counts ?? { running: 0, retrying: 0 };

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95">
      <div className="flex flex-col gap-4 px-4 py-5 lg:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1 rounded-lg border border-border/70 bg-card" />
            <Separator
              orientation="vertical"
              className="hidden h-5 data-[orientation=vertical]:h-5 sm:block"
            />
            <div className="min-w-0">
              <p className="dashboard-kicker">{page.eyebrow}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h1 className="dashboard-heading">{page.title}</h1>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {page.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start">
            <Badge
              variant="outline"
              className={
                networkError
                  ? "border-danger/20 bg-danger/10 text-danger"
                  : "border-success/20 bg-success/10 text-success"
              }
            >
              <RadioTowerIcon className="size-3.5" />
              {networkError ? "Connexion perdue" : "Polling 1s"}
            </Badge>
            <Badge variant="secondary" className="bg-secondary text-foreground">
              {dashboardMode(currentCounts)}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <a href="/api/v1/state">API d'état</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/api/v1/config/agent">API des agents</a>
            </Button>
            {primaryIssue ? (
              <Button asChild size="sm">
                <a href={`/api/v1/${primaryIssue.issue_identifier}`}>
                  JSON de l'issue
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
          <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
            {networkError ?? dashboardModeCopy(currentCounts)}
          </p>

          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <Clock3Icon
              className={`size-4 ${isFetching ? "animate-pulse" : ""}`}
            />
            <span>Instantané {formatSnapshotDate(snapshot?.generated_at)}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
