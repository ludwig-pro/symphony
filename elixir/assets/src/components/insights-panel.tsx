import { insightItems, type DashboardPayload } from "@/lib/dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type InsightsPanelProps = {
  snapshot: DashboardPayload | null;
};

export function InsightsPanel({ snapshot }: InsightsPanelProps) {
  const items = insightItems(snapshot);

  return (
    <Card>
      <CardHeader>
        <CardDescription className="dashboard-kicker">
          Notes d'exécution
        </CardDescription>
        <CardTitle>Lecture rapide de la posture d'orchestration</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {items.map((item) => (
          <div key={item.label} className="dashboard-subtle-panel p-4">
            <p className="dashboard-kicker text-[0.66rem]">{item.label}</p>
            <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
              {item.value}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {item.copy}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
