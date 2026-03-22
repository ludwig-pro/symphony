import {
  ActivityIcon,
  BadgeAlertIcon,
  BotIcon,
  DatabaseZapIcon,
  FolderKanbanIcon,
  GaugeIcon,
  GitPullRequestIcon,
  WaypointsIcon,
  type LucideIcon,
} from "lucide-react";

export type DashboardPageId =
  | "overview"
  | "sessions"
  | "pull-requests"
  | "agents"
  | "limits"
  | "retries";

export type DashboardPage = {
  id: DashboardPageId;
  path: string;
  label: string;
  title: string;
  description: string;
  eyebrow: string;
  icon: LucideIcon;
};

export type DashboardSecondaryLink = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const dashboardPages: DashboardPage[] = [
  {
    id: "overview",
    path: "/",
    label: "Overview",
    title: "Overview",
    description:
      "Synthèse globale du runtime, des sessions, des relances et de la posture d'orchestration.",
    eyebrow: "Observabilité Symphony",
    icon: GaugeIcon,
  },
  {
    id: "sessions",
    path: "/sessions",
    label: "Sessions actives",
    title: "Sessions actives",
    description:
      "Suivi détaillé des issues en cours, de la durée d'exécution, des tours et de l'usage des jetons.",
    eyebrow: "Exécution en cours",
    icon: ActivityIcon,
  },
  {
    id: "pull-requests",
    path: "/pull-requests",
    label: "Pull Requests",
    title: "Pull Requests",
    description:
      "Vue unifiée GitHub et GitLab pour suivre les PR et MR créées, assignées, mentionnées ou en review request.",
    eyebrow: "Revue de code",
    icon: GitPullRequestIcon,
  },
  {
    id: "agents",
    path: "/agents",
    label: "Contrôle agent",
    title: "Contrôle agent",
    description:
      "Pilotage du profil actif, disponibilité de la passerelle Claude et lecture rapide de la posture runtime.",
    eyebrow: "Configuration runtime",
    icon: BotIcon,
  },
  {
    id: "limits",
    path: "/limits",
    label: "Quotas",
    title: "Quotas et limites",
    description:
      "État des limites de débit, crédits amont et charge utile brute exposée par le runtime.",
    eyebrow: "Capacité plateforme",
    icon: DatabaseZapIcon,
  },
  {
    id: "retries",
    path: "/retries",
    label: "Relances",
    title: "Relances en attente",
    description:
      "Visibilité sur les backoffs en cours, les prochaines fenêtres de reprise et les erreurs récentes.",
    eyebrow: "File de reprise",
    icon: WaypointsIcon,
  },
];

export const dashboardDrawerPages: DashboardPage[] = dashboardPages.filter(
  (page) => page.id === "overview",
);

export const dashboardSecondaryLinks: DashboardSecondaryLink[] = [
  { href: "/api/v1/state", label: "État JSON", icon: FolderKanbanIcon },
  { href: "/api/v1/config/agent", label: "Agents JSON", icon: BadgeAlertIcon },
];

const dashboardPathAliases = new Map<string, string>([
  ["/overview", "/"],
  ["/control", "/agents"],
  ["/retrying", "/retries"],
]);

export function normalizeDashboardPath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  const aliased = dashboardPathAliases.get(trimmed) ?? trimmed;

  if (dashboardPages.some((page) => page.path === aliased)) {
    return aliased;
  }

  return "/";
}

export function dashboardPageForPath(pathname: string) {
  const normalizedPath = normalizeDashboardPath(pathname);

  return (
    dashboardPages.find((page) => page.path === normalizedPath) ??
    dashboardPages[0]
  );
}
