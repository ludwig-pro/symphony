export type PullRequestProvider = "github" | "gitlab"
export type PullRequestProviderFilter = "all" | PullRequestProvider
export type PullRequestBucket =
  | "created"
  | "assigned"
  | "mentioned"
  | "review_requested"
export type PullRequestStateFilter = "open" | "closed"

export type PullRequestActor = {
  login: string
  display_name: string
  url?: string | null
}

export type ProviderStatus = {
  available: boolean
  authenticated: boolean
  supported: boolean
  supported_buckets: PullRequestBucket[]
  warning?: string | null
  error?: string | null
}

export type PullRequestEntry = {
  provider: PullRequestProvider
  id: string | null
  number: number | null
  reference: string
  repository: string
  title: string
  url: string | null
  author: PullRequestActor | null
  assignees: PullRequestActor[]
  reviewers: PullRequestActor[]
  state: string
  is_draft: boolean
  created_at: string | null
  updated_at: string | null
}

export type PullRequestsPayload = {
  generated_at: string
  filters: {
    provider: PullRequestProviderFilter
    bucket: PullRequestBucket
    state: PullRequestStateFilter
  }
  providers: {
    github: ProviderStatus
    gitlab: ProviderStatus
  }
  items: PullRequestEntry[]
  total_count: number
}

export type PullRequestFilters = PullRequestsPayload["filters"]

export const defaultPullRequestFilters: PullRequestFilters = {
  provider: "all",
  bucket: "created",
  state: "open",
}

export const pullRequestProviderOptions: Array<{
  value: PullRequestProviderFilter
  label: string
}> = [
  { value: "all", label: "All" },
  { value: "github", label: "GitHub" },
  { value: "gitlab", label: "GitLab" },
]

export const pullRequestBucketOptions: Array<{
  value: PullRequestBucket
  label: string
}> = [
  { value: "created", label: "Created" },
  { value: "assigned", label: "Assigned" },
  { value: "mentioned", label: "Mentioned" },
  { value: "review_requested", label: "Review requests" },
]

export const pullRequestStateOptions: Array<{
  value: PullRequestStateFilter
  label: string
}> = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
]

export function providerLabel(provider: PullRequestProvider) {
  return provider === "github" ? "GitHub" : "GitLab"
}

export function pullRequestStateLabel(state: string) {
  switch (state) {
    case "closed":
      return "Closed"
    case "open":
    default:
      return "Open"
  }
}
