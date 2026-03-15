import { ArrowRightIcon } from "lucide-react"

import { DashboardLink } from "@/components/dashboard-link"
import { AgentPanel } from "@/components/agent-panel"
import { InsightsPanel } from "@/components/insights-panel"
import { RateLimitsPanel } from "@/components/rate-limits-panel"
import { RetryQueue } from "@/components/retry-queue"
import { SectionCards } from "@/components/section-cards"
import { SessionsTable } from "@/components/sessions-table"
import { Button } from "@/components/ui/button"
import { type DashboardPayload, type RetryEntry, type RunningEntry } from "@/lib/dashboard"
import { type DashboardPageId } from "@/lib/navigation"

type DashboardPageContentProps = {
  pageId: DashboardPageId
  snapshot: DashboardPayload | null
  running: RunningEntry[]
  retrying: RetryEntry[]
  trackedIssueCount: number
  isLoading: boolean
  isSwitchingAgent: boolean
  now: number
  onNavigate: (href: string) => void
  onSwitchAgent: (presetId: string) => void
}

function OverviewPage({
  snapshot,
  running,
  retrying,
  trackedIssueCount,
  isLoading,
  isSwitchingAgent,
  now,
  onNavigate,
  onSwitchAgent,
}: Omit<DashboardPageContentProps, "pageId">) {
  return (
    <>
      <SectionCards snapshot={snapshot} isLoading={isLoading} now={now} />

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <DashboardLink href="/sessions" onNavigate={onNavigate}>
            Voir les sessions
            <ArrowRightIcon className="size-3.5" />
          </DashboardLink>
        </Button>
        <Button asChild variant="outline" size="sm">
          <DashboardLink href="/retries" onNavigate={onNavigate}>
            Voir les relances
            <ArrowRightIcon className="size-3.5" />
          </DashboardLink>
        </Button>
        <Button asChild variant="outline" size="sm">
          <DashboardLink href="/agents" onNavigate={onNavigate}>
            Ouvrir le contrôle agent
            <ArrowRightIcon className="size-3.5" />
          </DashboardLink>
        </Button>
        <Button asChild variant="outline" size="sm">
          <DashboardLink href="/limits" onNavigate={onNavigate}>
            Consulter les quotas
            <ArrowRightIcon className="size-3.5" />
          </DashboardLink>
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_23rem]">
        <SessionsTable
          entries={running}
          trackedIssueCount={trackedIssueCount}
          isLoading={isLoading}
          now={now}
        />

        <div className="flex flex-col gap-6">
          <AgentPanel
            agent={snapshot?.agent ?? null}
            isLoading={isLoading}
            isSwitchingAgent={isSwitchingAgent}
            onSwitchAgent={onSwitchAgent}
          />
          <InsightsPanel snapshot={snapshot} />
          <RateLimitsPanel snapshot={snapshot} />
        </div>
      </div>

      <RetryQueue entries={retrying} />
    </>
  )
}

function SessionsPage({
  running,
  trackedIssueCount,
  isLoading,
  now,
}: Pick<DashboardPageContentProps, "running" | "trackedIssueCount" | "isLoading" | "now">) {
  return (
    <SessionsTable
      entries={running}
      trackedIssueCount={trackedIssueCount}
      isLoading={isLoading}
      now={now}
    />
  )
}

function AgentsPage({
  snapshot,
  isLoading,
  isSwitchingAgent,
  onSwitchAgent,
}: Pick<
  DashboardPageContentProps,
  "snapshot" | "isLoading" | "isSwitchingAgent" | "onSwitchAgent"
>) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_23rem]">
      <AgentPanel
        agent={snapshot?.agent ?? null}
        isLoading={isLoading}
        isSwitchingAgent={isSwitchingAgent}
        onSwitchAgent={onSwitchAgent}
      />
      <InsightsPanel snapshot={snapshot} />
    </div>
  )
}

function LimitsPage({ snapshot }: Pick<DashboardPageContentProps, "snapshot">) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_23rem]">
      <RateLimitsPanel snapshot={snapshot} />
      <InsightsPanel snapshot={snapshot} />
    </div>
  )
}

function RetriesPage({ retrying }: Pick<DashboardPageContentProps, "retrying">) {
  return <RetryQueue entries={retrying} />
}

export function DashboardPageContent(props: DashboardPageContentProps) {
  switch (props.pageId) {
    case "sessions":
      return (
        <SessionsPage
          running={props.running}
          trackedIssueCount={props.trackedIssueCount}
          isLoading={props.isLoading}
          now={props.now}
        />
      )

    case "agents":
      return (
        <AgentsPage
          snapshot={props.snapshot}
          isLoading={props.isLoading}
          isSwitchingAgent={props.isSwitchingAgent}
          onSwitchAgent={props.onSwitchAgent}
        />
      )

    case "limits":
      return <LimitsPage snapshot={props.snapshot} />

    case "retries":
      return <RetriesPage retrying={props.retrying} />

    case "overview":
    default:
      return (
        <OverviewPage
          snapshot={props.snapshot}
          running={props.running}
          retrying={props.retrying}
          trackedIssueCount={props.trackedIssueCount}
          isLoading={props.isLoading}
          isSwitchingAgent={props.isSwitchingAgent}
          now={props.now}
          onNavigate={props.onNavigate}
          onSwitchAgent={props.onSwitchAgent}
        />
      )
  }
}
