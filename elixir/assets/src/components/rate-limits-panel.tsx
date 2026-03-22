import {
  prettyValue,
  rateLimitCards,
  rateLimitProfile,
  type DashboardPayload,
} from "@/lib/dashboard";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type RateLimitsPanelProps = {
  snapshot: DashboardPayload | null;
};

function toneClasses(tone: "positive" | "warning" | "danger") {
  if (tone === "danger") {
    return "border-danger/20 bg-danger/10 text-danger";
  }

  if (tone === "warning") {
    return "border-warning/20 bg-warning/10 text-[color:var(--color-warning)]";
  }

  return "border-success/20 bg-success/10 text-success";
}

export function RateLimitsPanel({ snapshot }: RateLimitsPanelProps) {
  const cards = rateLimitCards(snapshot?.rate_limits);
  const profile = rateLimitProfile(snapshot?.rate_limits);

  return (
    <Card id="limits">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardDescription className="dashboard-kicker">
              Limites de débit
            </CardDescription>
            <CardTitle>Quotas amont</CardTitle>
          </div>
          {profile ? (
            <Badge variant="secondary" className="bg-secondary/80">
              {profile}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {cards.length === 0 ? (
          <div className="dashboard-subtle-panel px-4 py-5 text-sm text-muted-foreground">
            Aucune donnée de limite de débit disponible pour le moment.
          </div>
        ) : (
          <div className="grid gap-3">
            {cards.map((card) => (
              <div
                key={card.label}
                className={`rounded-[calc(var(--radius)*0.95)] border px-4 py-3 ${toneClasses(card.tone)}`}
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

        <div className="dashboard-subtle-panel p-4">
          <p className="dashboard-kicker text-[0.66rem]">Charge utile brute</p>
          <pre className="mt-3 overflow-x-auto text-xs leading-6 text-muted-foreground">
            {prettyValue(snapshot?.rate_limits)}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
