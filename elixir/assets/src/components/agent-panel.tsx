import { BotIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react"

import {
  activeAgentCopy,
  agentOptionLabel,
  claudeBridgeBadgeLabel,
  claudeBridgeCopy,
  type AgentPayload,
} from "@/lib/dashboard"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

type AgentPanelProps = {
  agent: AgentPayload | null
  isLoading: boolean
  isSwitchingAgent: boolean
  onSwitchAgent: (presetId: string) => void
}

export function AgentPanel({
  agent,
  isLoading,
  isSwitchingAgent,
  onSwitchAgent,
}: AgentPanelProps) {
  if (isLoading && !agent) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>Agent actif</CardDescription>
          <CardTitle>
            <Skeleton className="h-7 w-40 rounded-lg" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-4 w-full rounded-md" />
        </CardContent>
      </Card>
    )
  }

  if (!agent) {
    return null
  }

  return (
    <Card className="shadow-sm" id="control">
      <CardHeader>
        <CardDescription>Contrôle agent</CardDescription>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BotIcon className="size-4 text-primary" />
              {agent.current.label}
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              {activeAgentCopy(agent.current)}
            </p>
          </div>

          <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
            <SparklesIcon className="size-3.5" />
            {agent.current.provider_label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Agent suivant
          </p>
          <Select
            value={agent.current.id}
            onValueChange={onSwitchAgent}
            disabled={isSwitchingAgent}
          >
            <SelectTrigger
              aria-label="Sélectionner un profil d'agent"
              className="h-11 w-full rounded-xl bg-background"
            >
              <SelectValue placeholder="Sélectionner un profil" />
            </SelectTrigger>
            <SelectContent>
              {agent.presets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id} disabled={!preset.available}>
                  {agentOptionLabel(preset)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={
              agent.claude_bridge.available
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }
          >
            {claudeBridgeBadgeLabel(agent.claude_bridge)}
          </Badge>
          <Badge variant="secondary">{agent.current.source_label}</Badge>
        </div>

        <p className="text-sm text-muted-foreground">
          {claudeBridgeCopy(agent.claude_bridge)}
        </p>

        {!agent.claude_bridge.available ? (
          <Alert variant="destructive">
            <TriangleAlertIcon className="size-4" />
            <AlertTitle>Claude indisponible</AlertTitle>
            <AlertDescription>
              {agent.claude_bridge.reason || "Les prérequis d'exécution Claude ne sont pas satisfaits."}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
