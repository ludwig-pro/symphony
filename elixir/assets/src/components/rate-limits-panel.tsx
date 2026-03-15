import {
  prettyValue,
  rateLimitCards,
  rateLimitProfile,
  type DashboardPayload,
} from "@/lib/dashboard"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type RateLimitsPanelProps = {
  snapshot: DashboardPayload | null
}

function toneClasses(tone: "positive" | "warning" | "danger") {
  if (tone === "danger") {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }

  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700"
}

export function RateLimitsPanel({ snapshot }: RateLimitsPanelProps) {
  const cards = rateLimitCards(snapshot?.rate_limits)
  const profile = rateLimitProfile(snapshot?.rate_limits)

  return (
    <Card className="shadow-sm" id="limits">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardDescription>Limites de débit</CardDescription>
            <CardTitle>Quotas amont</CardTitle>
          </div>
          {profile ? <Badge variant="secondary">{profile}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            Aucune donnée de limite de débit disponible pour le moment.
          </div>
        ) : (
          <div className="grid gap-3">
            {cards.map((card) => (
              <div
                key={card.label}
                className={`rounded-2xl border px-4 py-3 ${toneClasses(card.tone)}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{card.label}</p>
                  <p className="text-sm font-semibold">{card.value}</p>
                </div>
                <p className="mt-2 text-xs opacity-80">{card.meta}</p>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Charge utile brute
          </p>
          <pre className="mt-3 overflow-x-auto text-xs leading-6 text-muted-foreground">
            {prettyValue(snapshot?.rate_limits)}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}
