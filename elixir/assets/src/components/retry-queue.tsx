import { Clock4Icon, ExternalLinkIcon, RotateCcwIcon } from "lucide-react"

import { issueJsonPath, type RetryEntry } from "@/lib/dashboard"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type RetryQueueProps = {
  entries: RetryEntry[]
}

export function RetryQueue({ entries }: RetryQueueProps) {
  return (
    <Card className="shadow-sm" id="retrying">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardDescription>File de relance</CardDescription>
            <CardTitle>Issues en attente</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Issues en attente de la prochaine fenêtre de relance.
            </p>
          </div>
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            <RotateCcwIcon className="size-3.5" />
            {entries.length} en attente
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
            Aucune issue n'est actuellement en temporisation.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {entries.map((entry) => (
              <article
                key={`${entry.issue_identifier}-${entry.attempt}`}
                className="rounded-2xl border border-border/80 bg-card/80 p-4 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <span className="font-semibold text-foreground">
                      {entry.issue_identifier}
                    </span>
                    <a
                      href={issueJsonPath(entry.issue_identifier)}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Détails JSON
                      <ExternalLinkIcon className="size-3.5" />
                    </a>
                  </div>
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                    Tentative {entry.attempt}
                  </Badge>
                </div>

                <dl className="mt-4 grid gap-4 text-sm">
                  <div className="grid gap-1">
                    <dt className="flex items-center gap-2 text-muted-foreground">
                      <Clock4Icon className="size-3.5" />
                      Prévue à
                    </dt>
                    <dd className="font-medium text-foreground">
                      {entry.due_at || "n/d"}
                    </dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-muted-foreground">Dernière erreur</dt>
                    <dd className="text-foreground">{entry.error || "n/d"}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
