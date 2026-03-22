import { ClipboardIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";

import {
  formatInt,
  formatRuntimeAndTurns,
  issueJsonPath,
  stateBadgeLabel,
  stateTone,
  type RunningEntry,
} from "@/lib/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SessionsTableProps = {
  entries: RunningEntry[];
  trackedIssueCount: number;
  isLoading: boolean;
  now: number;
};

function stateBadgeClasses(entryState: string | null) {
  const tone = stateTone(entryState);

  if (tone === "positive") {
    return "border-success/20 bg-success/10 text-success";
  }

  if (tone === "warning") {
    return "border-warning/20 bg-warning/10 text-[color:var(--color-warning)]";
  }

  if (tone === "danger") {
    return "border-danger/20 bg-danger/10 text-danger";
  }

  return "border-border bg-secondary text-foreground";
}

export function SessionsTable({
  entries,
  trackedIssueCount,
  isLoading,
  now,
}: SessionsTableProps) {
  const copySessionId = async (sessionId: string) => {
    try {
      await navigator.clipboard.writeText(sessionId);
      toast.success("ID de session copié.");
    } catch {
      toast.error("Impossible de copier l'ID de session.");
    }
  };

  return (
    <Card id="sessions">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardDescription className="dashboard-kicker">
              Sessions actives
            </CardDescription>
            <CardTitle>Issues en cours</CardTitle>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Issues actives, dernière activité agent connue et usage des
              jetons.
            </p>
          </div>
          <Badge variant="secondary" className="bg-secondary text-foreground">
            {trackedIssueCount} suivies
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="dashboard-subtle-panel px-4 py-8 text-sm text-muted-foreground">
            Aucune session active.
          </div>
        ) : (
          <Table className="min-w-[54rem]">
            <TableHeader>
              <TableRow>
                <TableHead>Issue</TableHead>
                <TableHead>État</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Durée / tours</TableHead>
                <TableHead className="min-w-[18rem]">
                  Mise à jour Codex
                </TableHead>
                <TableHead>Jetons</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow
                  key={entry.issue_identifier}
                  className="border-border/70"
                >
                  <TableCell className="align-top">
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
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge
                      variant="outline"
                      className={stateBadgeClasses(entry.state)}
                    >
                      {stateBadgeLabel(entry.state)}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    {entry.session_id ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-0 text-primary hover:bg-transparent hover:text-primary/80"
                        onClick={() => void copySessionId(entry.session_id!)}
                      >
                        <ClipboardIcon className="size-3.5" />
                        Copier l'ID
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">n/d</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top font-medium text-foreground">
                    {formatRuntimeAndTurns(entry, now)}
                  </TableCell>
                  <TableCell className="max-w-[26rem] align-top whitespace-normal">
                    <div className="grid gap-1">
                      <span className="line-clamp-2 text-sm leading-6 text-foreground">
                        {entry.last_message ||
                          String(entry.last_event || "n/d")}
                      </span>
                      <span className="text-xs text-ink-soft">
                        {entry.last_event || "n/d"}
                        {entry.last_event_at ? ` · ${entry.last_event_at}` : ""}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="grid gap-1 text-sm">
                      <span className="font-medium text-foreground">
                        Total: {formatInt(entry.tokens.total_tokens)}
                      </span>
                      <span className="text-muted-foreground">
                        Entrée {formatInt(entry.tokens.input_tokens)} / Sortie{" "}
                        {formatInt(entry.tokens.output_tokens)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
