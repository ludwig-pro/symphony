import { GaugeIcon, SearchIcon } from "lucide-react";

import { counts, dashboardMode, type DashboardPayload } from "@/lib/dashboard";
import { DashboardLink } from "@/components/dashboard-link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { dashboardPages, dashboardSecondaryLinks } from "@/lib/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

type AppSidebarProps = {
  snapshot: DashboardPayload | null;
  networkError: string | null;
  pathname: string;
  onNavigate: (href: string) => void;
};

export function AppSidebar({
  snapshot,
  networkError,
  pathname,
  onNavigate,
}: AppSidebarProps) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const currentCounts = counts(snapshot);
  const currentMode = dashboardMode(currentCounts);
  const currentAgent = snapshot?.agent.current;
  const runtimeSummary = [
    networkError ? "Dégradé" : "Stable",
    currentMode,
    `${currentCounts.running} session${currentCounts.running > 1 ? "s" : ""}`,
    `${currentCounts.retrying} relance${currentCounts.retrying > 1 ? "s" : ""}`,
    currentAgent?.provider_label ?? "Agent n/d",
  ].join(" · ");
  const handleNavigate = (href: string) => {
    onNavigate(href);

    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="gap-3 px-4 pt-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="h-12 rounded-xl border border-sidebar-border/70 bg-transparent px-2.5"
              tooltip="Retour à la vue d'ensemble"
            >
              <DashboardLink href="/" onNavigate={handleNavigate}>
                <Avatar
                  size="lg"
                  className="bg-primary/12 text-primary after:border-primary/10"
                >
                  <AvatarFallback className="bg-transparent font-semibold text-primary">
                    S
                  </AvatarFallback>
                </Avatar>
                <span className="grid text-left">
                  <span className="text-sm font-semibold tracking-tight">
                    Symphony
                  </span>
                  <span className="text-xs text-sidebar-foreground/70">
                    Dashboard observabilité
                  </span>
                </span>
              </DashboardLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="group-data-[collapsible=icon]:hidden">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sidebar-foreground/45" />
            <SidebarInput
              aria-label="Rechercher une section"
              placeholder="Rechercher"
              className="h-10 rounded-lg border-sidebar-border/70 bg-surface-0 pl-9 text-sm"
            />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2.5">
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dashboardPages.map((page) => (
                <SidebarMenuItem key={page.path}>
                  <SidebarMenuButton
                    asChild
                    isActive={page.path === pathname}
                    tooltip={page.label}
                  >
                    <DashboardLink href={page.path} onNavigate={handleNavigate}>
                      <page.icon />
                      <span>{page.label}</span>
                    </DashboardLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Interfaces</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dashboardSecondaryLinks.map((link) => (
                <SidebarMenuItem key={link.href}>
                  <SidebarMenuButton asChild tooltip={link.label}>
                    <a href={link.href}>
                      <link.icon />
                      <span>{link.label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="mt-auto px-3 pb-4">
        <div className="rounded-xl border border-sidebar-border/80 bg-transparent p-4 group-data-[collapsible=icon]:hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-sidebar-foreground/60">
                Runtime
              </p>
              <p className="mt-1 text-sm font-semibold text-sidebar-foreground">
                {currentMode}
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                networkError
                  ? "border-danger/20 bg-danger/10 text-danger"
                  : "border-success/20 bg-success/10 text-success"
              }
            >
              {networkError ? "Dégradé" : "Stable"}
            </Badge>
          </div>

          <dl className="mt-4 grid gap-2.5 text-xs text-sidebar-foreground/70">
            <div className="flex items-center justify-between gap-3">
              <dt>Sessions</dt>
              <dd className="font-medium text-sidebar-foreground">
                {currentCounts.running}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Relances</dt>
              <dd className="font-medium text-sidebar-foreground">
                {currentCounts.retrying}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Agent</dt>
              <dd className="max-w-[10rem] truncate font-medium text-sidebar-foreground">
                {currentAgent?.provider_label ?? "n/d"}
              </dd>
            </div>
          </dl>
        </div>

        <DashboardLink
          href="/"
          onNavigate={handleNavigate}
          aria-label={runtimeSummary}
          title={runtimeSummary}
          className="hidden size-10 items-center justify-center self-center rounded-2xl border border-sidebar-border/80 bg-sidebar-accent/45 text-sidebar-foreground transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:flex"
        >
          <div className="relative">
            <GaugeIcon className="size-4" />
            <span
              className={`absolute -right-0.5 -bottom-0.5 size-2 rounded-full ${
                networkError ? "bg-rose-500" : "bg-emerald-500"
              }`}
            />
          </div>
          <span className="sr-only">
            {state === "collapsed" ? runtimeSummary : "Résumé runtime"}
          </span>
        </DashboardLink>
      </SidebarFooter>
    </Sidebar>
  );
}
