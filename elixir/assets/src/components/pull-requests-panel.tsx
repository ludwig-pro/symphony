import {
  AlertCircleIcon,
  ArrowUpRightIcon,
  GitPullRequestIcon,
  InfoIcon,
} from "lucide-react"

import {
  formatSnapshotDate,
  formatInt,
} from "@/lib/dashboard"
import {
  providerLabel,
  pullRequestBucketOptions,
  pullRequestProviderOptions,
  pullRequestStateLabel,
  pullRequestStateOptions,
  type ProviderStatus,
  type PullRequestActor,
  type PullRequestBucket,
  type PullRequestEntry,
  type PullRequestProvider,
  type PullRequestProviderFilter,
  type PullRequestsPayload,
  type PullRequestStateFilter,
} from "@/lib/pull-requests"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type PullRequestsPanelProps = {
  payload: PullRequestsPayload | null
  filters: {
    provider: PullRequestProviderFilter
    bucket: PullRequestBucket
    state: PullRequestStateFilter
  }
  isLoading: boolean
  isFetching: boolean
  error: string | null
  onProviderChange: (provider: PullRequestProviderFilter) => void
  onBucketChange: (bucket: PullRequestBucket) => void
  onStateChange: (state: PullRequestStateFilter) => void
}

function providerBadgeClass(provider: PullRequestProvider) {
  return provider === "github"
    ? "border-sky-500/20 bg-sky-500/10 text-sky-600"
    : "border-orange-500/20 bg-orange-500/10 text-orange-600"
}

function itemStateBadgeClass(state: string) {
  return state === "closed"
    ? "border-border bg-secondary text-foreground"
    : "border-success/20 bg-success/10 text-success"
}

function actorLabel(actor: PullRequestActor) {
  return actor.display_name || actor.login
}

function actorSummary(actors: PullRequestActor[], emptyLabel: string) {
  if (actors.length === 0) {
    return emptyLabel
  }

  const visible = actors.slice(0, 2).map(actorLabel).join(", ")

  if (actors.length <= 2) {
    return visible
  }

  return `${visible} +${actors.length - 2}`
}

function statusEntries(
  payload: PullRequestsPayload | null,
  providerFilter: PullRequestProviderFilter,
) {
  if (!payload) {
    return []
  }

  const statuses: Array<[PullRequestProvider, ProviderStatus]> = [
    ["github", payload.providers.github],
    ["gitlab", payload.providers.gitlab],
  ]

  if (providerFilter === "all") {
    return statuses
  }

  return statuses.filter(([provider]) => provider === providerFilter)
}

function ProviderStatusAlerts({
  payload,
  providerFilter,
}: {
  payload: PullRequestsPayload | null
  providerFilter: PullRequestProviderFilter
}) {
  return (
    <>
      {statusEntries(payload, providerFilter).map(([provider, status]) => {
        if (status.error) {
          return (
            <Alert key={`${provider}-error`} variant="destructive">
              <AlertCircleIcon className="size-4" />
              <AlertTitle>{providerLabel(provider)}</AlertTitle>
              <AlertDescription>{status.error}</AlertDescription>
            </Alert>
          )
        }

        if (status.warning) {
          return (
            <Alert key={`${provider}-warning`}>
              <InfoIcon className="size-4" />
              <AlertTitle>{providerLabel(provider)}</AlertTitle>
              <AlertDescription>{status.warning}</AlertDescription>
            </Alert>
          )
        }

        return null
      })}
    </>
  )
}

function FilterButtons<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={option.value === value ? "default" : "outline"}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

function PullRequestTable({ items }: { items: PullRequestEntry[] }) {
  return (
    <Table className="min-w-[72rem]">
      <TableHeader>
        <TableRow>
          <TableHead>Provider</TableHead>
          <TableHead>Pull Request</TableHead>
          <TableHead>État</TableHead>
          <TableHead>Auteur</TableHead>
          <TableHead>Participants</TableHead>
          <TableHead>Dates</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={`${item.provider}-${item.id ?? item.reference}`}>
            <TableCell className="align-top">
              <Badge
                variant="outline"
                className={cn("capitalize", providerBadgeClass(item.provider))}
              >
                {providerLabel(item.provider)}
              </Badge>
            </TableCell>
            <TableCell className="align-top">
              <div className="grid gap-1">
                <a
                  href={item.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-start gap-1 font-semibold text-foreground hover:text-primary"
                >
                  <span className="leading-6">{item.title}</span>
                  <ArrowUpRightIcon className="mt-1 size-3.5 shrink-0" />
                </a>
                <span className="text-sm text-muted-foreground">
                  {item.repository} · {item.reference}
                </span>
              </div>
            </TableCell>
            <TableCell className="align-top">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={itemStateBadgeClass(item.state)}
                >
                  {pullRequestStateLabel(item.state)}
                </Badge>
                {item.is_draft ? (
                  <Badge variant="secondary" className="bg-secondary text-foreground">
                    Draft
                  </Badge>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="align-top">
              <div className="grid gap-1 text-sm">
                <span className="font-medium text-foreground">
                  {item.author ? actorLabel(item.author) : "n/d"}
                </span>
                <span className="text-muted-foreground">
                  {item.author?.login ?? "Auteur indisponible"}
                </span>
              </div>
            </TableCell>
            <TableCell className="align-top">
              <div className="grid gap-1 text-sm text-muted-foreground">
                <span>
                  Assignés: {actorSummary(item.assignees, "Aucun assigné")}
                </span>
                <span>
                  Reviewers: {actorSummary(item.reviewers, "Aucun reviewer")}
                </span>
              </div>
            </TableCell>
            <TableCell className="align-top">
              <div className="grid gap-1 text-sm">
                <span className="text-muted-foreground">
                  Créée {formatSnapshotDate(item.created_at)}
                </span>
                <span className="font-medium text-foreground">
                  Mise à jour {formatSnapshotDate(item.updated_at)}
                </span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function PullRequestsPanel({
  payload,
  filters,
  isLoading,
  isFetching,
  error,
  onProviderChange,
  onBucketChange,
  onStateChange,
}: PullRequestsPanelProps) {
  const items = payload?.items ?? []

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardDescription className="dashboard-kicker">
                Vue unifiée GitHub / GitLab
              </CardDescription>
              <CardTitle>Filtres Pull Requests</CardTitle>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Visualise les PR et MR qui te concernent sans quitter le dashboard.
              </p>
            </div>
            <Badge variant="secondary" className="bg-secondary text-foreground">
              {formatInt(payload?.total_count ?? 0)} résultat
              {(payload?.total_count ?? 0) > 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <FilterButtons
            label="Plateforme"
            options={pullRequestProviderOptions}
            value={filters.provider}
            onChange={onProviderChange}
          />

          <FilterButtons
            label="Vue"
            options={pullRequestBucketOptions}
            value={filters.bucket}
            onChange={onBucketChange}
          />

          <FilterButtons
            label="État"
            options={pullRequestStateOptions}
            value={filters.state}
            onChange={onStateChange}
          />
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertCircleIcon className="size-4" />
          <AlertTitle>Chargement impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ProviderStatusAlerts
        payload={payload}
        providerFilter={filters.provider}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardDescription className="dashboard-kicker">
                Liste courante
              </CardDescription>
              <CardTitle className="flex items-center gap-2">
                <GitPullRequestIcon className="size-4" />
                Pull Requests / Merge Requests
              </CardTitle>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Résultats triés par dernière mise à jour décroissante.
              </p>
            </div>
            <Badge variant="outline" className="border-border/70 bg-card text-foreground">
              {isFetching ? "Actualisation…" : "À jour"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="dashboard-subtle-panel px-4 py-8 text-sm text-muted-foreground">
              Aucune pull request ou merge request ne correspond aux filtres
              courants.
            </div>
          ) : (
            <PullRequestTable items={items} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
