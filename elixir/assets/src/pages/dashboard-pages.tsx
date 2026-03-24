import { ArrowRightIcon } from "lucide-react";

import { DashboardLink } from "@/components/dashboard-link";
import { AgentPanel } from "@/components/agent-panel";
import { InsightsPanel } from "@/components/insights-panel";
import { PullRequestsPanel } from "@/components/pull-requests-panel";
import { RateLimitsPanel } from "@/components/rate-limits-panel";
import { RetryQueue } from "@/components/retry-queue";
import { SectionCards } from "@/components/section-cards";
import { SessionsTable } from "@/components/sessions-table";
import { Button } from "@/components/ui/button";
import {
  type DashboardPayload,
  type RetryEntry,
  type RunningEntry,
} from "@/lib/dashboard";
import {
  type PullRequestBucket,
  type PullRequestFilters,
  type PullRequestsPayload,
  type PullRequestProviderFilter,
  type PullRequestStateFilter,
} from "@/lib/pull-requests";
import { type DashboardPageId } from "@/lib/navigation";

type DashboardPageContentProps = {
  pageId: DashboardPageId;
  snapshot: DashboardPayload | null;
  running: RunningEntry[];
  retrying: RetryEntry[];
  pullRequestsPayload: PullRequestsPayload | null;
  pullRequestFilters: PullRequestFilters;
  pullRequestsError: string | null;
  pullRequestsLoading: boolean;
  pullRequestsFetching: boolean;
  trackedIssueCount: number;
  isLoading: boolean;
  isSwitchingAgent: boolean;
  now: number;
  onNavigate: (href: string) => void;
  onSwitchAgent: (presetId: string) => void;
  onPullRequestProviderChange: (provider: PullRequestProviderFilter) => void;
  onPullRequestBucketChange: (bucket: PullRequestBucket) => void;
  onPullRequestStateChange: (state: PullRequestStateFilter) => void;
};

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
}: Pick<
  DashboardPageContentProps,
  | "snapshot"
  | "running"
  | "retrying"
  | "trackedIssueCount"
  | "isLoading"
  | "isSwitchingAgent"
  | "now"
  | "onNavigate"
  | "onSwitchAgent"
>) {
  return (
    <div className="flex flex-col gap-8">
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
          <DashboardLink href="/pull-requests" onNavigate={onNavigate}>
            Voir les pull requests
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

      <div className="dashboard-grid">
        <SessionsTable
          entries={running}
          trackedIssueCount={trackedIssueCount}
          isLoading={isLoading}
          now={now}
        />

        <div className="dashboard-rail">
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
    </div>
  );
}

function SessionsPage({
  running,
  trackedIssueCount,
  isLoading,
  now,
}: Pick<
  DashboardPageContentProps,
  "running" | "trackedIssueCount" | "isLoading" | "now"
>) {
  return (
    <SessionsTable
      entries={running}
      trackedIssueCount={trackedIssueCount}
      isLoading={isLoading}
      now={now}
    />
  );
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
  );
}

function LimitsPage({ snapshot }: Pick<DashboardPageContentProps, "snapshot">) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_23rem]">
      <RateLimitsPanel snapshot={snapshot} />
      <InsightsPanel snapshot={snapshot} />
    </div>
  );
}

function RetriesPage({
  retrying,
}: Pick<DashboardPageContentProps, "retrying">) {
  return <RetryQueue entries={retrying} />;
}

function PullRequestsPage({
  pullRequestsPayload,
  pullRequestFilters,
  pullRequestsError,
  pullRequestsLoading,
  pullRequestsFetching,
  onPullRequestProviderChange,
  onPullRequestBucketChange,
  onPullRequestStateChange,
}: Pick<
  DashboardPageContentProps,
  | "pullRequestsPayload"
  | "pullRequestFilters"
  | "pullRequestsError"
  | "pullRequestsLoading"
  | "pullRequestsFetching"
  | "onPullRequestProviderChange"
  | "onPullRequestBucketChange"
  | "onPullRequestStateChange"
>) {
  return (
    <PullRequestsPanel
      payload={pullRequestsPayload}
      filters={pullRequestFilters}
      isLoading={pullRequestsLoading}
      isFetching={pullRequestsFetching}
      error={pullRequestsError}
      onProviderChange={onPullRequestProviderChange}
      onBucketChange={onPullRequestBucketChange}
      onStateChange={onPullRequestStateChange}
    />
  );
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
      );

    case "agents":
      return (
        <AgentsPage
          snapshot={props.snapshot}
          isLoading={props.isLoading}
          isSwitchingAgent={props.isSwitchingAgent}
          onSwitchAgent={props.onSwitchAgent}
        />
      );

    case "limits":
      return <LimitsPage snapshot={props.snapshot} />;

    case "retries":
      return <RetriesPage retrying={props.retrying} />;

    case "pull-requests":
      return (
        <PullRequestsPage
          pullRequestsPayload={props.pullRequestsPayload}
          pullRequestFilters={props.pullRequestFilters}
          pullRequestsError={props.pullRequestsError}
          pullRequestsLoading={props.pullRequestsLoading}
          pullRequestsFetching={props.pullRequestsFetching}
          onPullRequestProviderChange={props.onPullRequestProviderChange}
          onPullRequestBucketChange={props.onPullRequestBucketChange}
          onPullRequestStateChange={props.onPullRequestStateChange}
        />
      );

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
      );
  }
}
