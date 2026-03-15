import {
  ActivityIcon,
  ArrowRightLeftIcon,
  Clock3Icon,
  CoinsIcon,
} from "lucide-react"

import {
  formatInt,
  formatRuntimeSeconds,
  totalRuntimeSeconds,
  trackedIssueCopy,
  type DashboardPayload,
} from "@/lib/dashboard"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

type SectionCardsProps = {
  snapshot: DashboardPayload | null
  isLoading: boolean
  now: number
}

export function SectionCards({ snapshot, isLoading, now }: SectionCardsProps) {
  const currentCounts = snapshot?.counts ?? { running: 0, retrying: 0 }
  const currentTotals = snapshot?.codex_totals ?? {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
  }

  const cards = [
    {
      label: "Actives",
      value: currentCounts.running.toString(),
      copy: "Sessions d'issue actives dans l'environnement d'exécution courant.",
      badge: `${currentCounts.running} suivies`,
      icon: ActivityIcon,
    },
    {
      label: "Relances",
      value: currentCounts.retrying.toString(),
      copy: "Issues en attente de la prochaine fenêtre de relance.",
      badge: "Backoff",
      icon: ArrowRightLeftIcon,
    },
    {
      label: "Jetons totaux",
      value: formatInt(currentTotals.total_tokens),
      copy: `Entrée ${formatInt(currentTotals.input_tokens)} / Sortie ${formatInt(currentTotals.output_tokens)}`,
      badge: "Cumuls runtime",
      icon: CoinsIcon,
    },
    {
      label: "Durée d'exécution",
      value: formatRuntimeSeconds(totalRuntimeSeconds(snapshot, now)),
      copy: trackedIssueCopy(currentCounts),
      badge: "Runtime actif",
      icon: Clock3Icon,
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {cards.map((card) => (
        <Card
          key={card.label}
          className="bg-gradient-to-br from-card via-card to-primary/5 shadow-sm"
        >
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-3xl tracking-tight">
              {isLoading ? <Skeleton className="h-8 w-24 rounded-lg" /> : card.value}
            </CardTitle>
            <CardAction>
              <Badge variant="outline" className="border-primary/15 bg-primary/8 text-primary">
                <card.icon className="size-3.5" />
                {card.badge}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="items-start text-sm text-muted-foreground">
            {isLoading ? <Skeleton className="h-4 w-full rounded-md" /> : card.copy}
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
