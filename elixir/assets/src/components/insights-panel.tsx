import { insightItems, type DashboardPayload } from "@/lib/dashboard"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type InsightsPanelProps = {
  snapshot: DashboardPayload | null
}

export function InsightsPanel({ snapshot }: InsightsPanelProps) {
  const items = insightItems(snapshot)

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardDescription>Notes d'exécution</CardDescription>
        <CardTitle>Lecture rapide de la posture d'orchestration</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-border/70 bg-muted/35 p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
              {item.value}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{item.copy}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
