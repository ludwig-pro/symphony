defmodule SymphonyElixir.PullRequestsTest do
  use SymphonyElixir.TestSupport

  alias SymphonyElixir.PullRequests

  test "list/1 covers github status branches and bucket-specific normalization" do
    Application.put_env(:symphony_elixir, :pull_requests_command_path_resolver, fn
      "gh" -> nil
      "glab" -> "/usr/bin/glab"
    end)

    unavailable = PullRequests.list(%{provider: "github", bucket: "created", state: "open"})

    assert unavailable.items == []
    assert unavailable.providers.github.error == "Le CLI GitHub (`gh`) n'est pas installé."
    refute unavailable.providers.github.available

    Application.put_env(:symphony_elixir, :pull_requests_command_path_resolver, &available_cli_path/1)

    Application.put_env(:symphony_elixir, :pull_requests_cli_runner, fn
      "gh", ["auth", "status"] -> {:error, {1, "auth failed"}}
      command, args -> raise "unexpected command #{inspect(command)} #{inspect(args)}"
    end)

    unauthenticated = PullRequests.list(%{provider: "github", bucket: "created", state: "open"})

    assert unauthenticated.items == []
    assert unauthenticated.providers.github.error == "GitHub CLI n'est pas authentifié."
    refute unauthenticated.providers.github.authenticated

    Application.put_env(:symphony_elixir, :pull_requests_cli_runner, fn
      "gh", ["auth", "status"] -> {:ok, "github auth ok"}
      command, args -> raise "unexpected command #{inspect(command)} #{inspect(args)}"
    end)

    unsupported = PullRequests.list(%{provider: "github", bucket: "unsupported", state: "open"})

    assert unsupported.items == []
    assert unsupported.providers.github.warning =~ "pas pris en charge"
    refute unsupported.providers.github.supported

    parent = self()

    Application.put_env(:symphony_elixir, :pull_requests_cli_runner, fn
      "gh", ["auth", "status"] ->
        {:ok, "github auth ok"}

      "gh", ["search", "prs" | args] ->
        send(parent, {:github_search_args, args})

        joined = Enum.join(args, " ")

        cond do
          String.contains?(joined, "--assignee @me") ->
            {:ok,
             Jason.encode!([
               %{
                 "id" => "PR_assigned",
                 "number" => 12,
                 "title" => "assigned",
                 "url" => "https://github.com/acme/web/pull/12",
                 "state" => "OPEN",
                 "isDraft" => false,
                 "createdAt" => "2026-03-21T09:00:00Z",
                 "updatedAt" => "not-a-timestamp",
                 "repository" => %{"nameWithOwner" => "acme/web"},
                 "author" => %{"name" => "Missing Login"},
                 "assignees" => [1, %{"name" => "Missing Login"}]
               }
             ])}

          String.contains?(joined, "--mentions @me") ->
            {:ok,
             Jason.encode!([
               %{
                 "id" => "PR_mentioned_nil",
                 "number" => "7",
                 "title" => nil,
                 "url" => "https://github.com/acme/api/pull/7",
                 "state" => 123,
                 "isDraft" => 1,
                 "createdAt" => nil,
                 "updatedAt" => nil,
                 "author" => nil,
                 "assignees" => "invalid"
               },
               %{
                 "id" => "PR_mentioned_number",
                 "number" => 8,
                 "title" => "numeric timestamp",
                 "url" => "https://github.com/acme/api/pull/8",
                 "state" => "OPEN",
                 "isDraft" => false,
                 "createdAt" => "2026-03-21T09:00:00Z",
                 "updatedAt" => 123,
                 "repository" => %{"nameWithOwner" => "acme/api"},
                 "author" => %{"login" => "reviewer"},
                 "assignees" => []
               }
             ])}

          true ->
            raise "unexpected github search args #{inspect(args)}"
        end

      command, args ->
        raise "unexpected command #{inspect(command)} #{inspect(args)}"
    end)

    assigned = PullRequests.list(%{provider: "github", bucket: "assigned", state: "open"})

    assert_received {:github_search_args, assigned_args}
    assert assigned_args |> Enum.join(" ") =~ "--assignee @me"
    assert assigned.total_count == 1
    assert assigned.providers.github.available

    assert assigned.items == [
             %{
               provider: "github",
               id: "PR_assigned",
               number: 12,
               reference: "#12",
               repository: "acme/web",
               title: "assigned",
               url: "https://github.com/acme/web/pull/12",
               author: nil,
               assignees: [],
               reviewers: [],
               state: "open",
               is_draft: false,
               created_at: "2026-03-21T09:00:00Z",
               updated_at: "not-a-timestamp"
             }
           ]

    mentioned = PullRequests.list(%{provider: "github", bucket: "mentioned", state: "open"})

    assert_received {:github_search_args, mentioned_args}
    assert mentioned_args |> Enum.join(" ") =~ "--mentions @me"
    assert mentioned.total_count == 2
    assert Enum.any?(mentioned.items, &(&1.reference == "#?"))
    assert Enum.any?(mentioned.items, &(&1.updated_at == nil))

    odd_item = Enum.find(mentioned.items, &(&1.reference == "#?"))

    assert odd_item.repository == "n/d"
    assert odd_item.title == "Sans titre"
    assert odd_item.author == nil
    assert odd_item.assignees == []
    assert odd_item.state == "open"
    assert odd_item.is_draft == true
  end

  test "list/1 covers gitlab status branches and provider error handling" do
    Application.put_env(:symphony_elixir, :pull_requests_command_path_resolver, fn
      "gh" -> "/usr/bin/gh"
      "glab" -> nil
    end)

    unavailable = PullRequests.list(%{provider: "gitlab", bucket: "created", state: "open"})

    assert unavailable.items == []
    assert unavailable.providers.gitlab.error == "Le CLI GitLab (`glab`) n'est pas installé."
    refute unavailable.providers.gitlab.available

    Application.put_env(:symphony_elixir, :pull_requests_command_path_resolver, &available_cli_path/1)

    parent = self()

    Application.put_env(:symphony_elixir, :pull_requests_cli_runner, fn
      "glab", ["auth", "status"] ->
        {:ok, "gitlab auth ok"}

      "glab", ["api", "user"] ->
        {:ok, ~s({"username":"gitlab-ludwig"})}

      "glab", ["api", query] ->
        send(parent, {:gitlab_query, query})

        cond do
          String.contains?(query, "assignee_username=gitlab-ludwig") and String.contains?(query, "state=closed") ->
            {:ok,
             Jason.encode!([
               %{
                 "id" => 501,
                 "iid" => nil,
                 "title" => nil,
                 "web_url" => "https://gitlab.com/acme/platform/-/merge_requests/17",
                 "state" => "closed",
                 "draft" => "true",
                 "created_at" => "2026-03-21T12:00:00Z",
                 "updated_at" => "2026-03-22T12:00:00Z",
                 "references" => %{},
                 "author" => %{
                   "username" => "gitlab-ludwig",
                   "name" => "GitLab Ludwig",
                   "web_url" => "https://gitlab.com/gitlab-ludwig"
                 },
                 "assignees" => [],
                 "reviewers" => []
               }
             ])}

          String.contains?(query, "reviewer_username=gitlab-ludwig") ->
            {:ok, "[]"}

          true ->
            raise "unexpected gitlab query #{inspect(query)}"
        end

      command, args ->
        raise "unexpected command #{inspect(command)} #{inspect(args)}"
    end)

    assigned = PullRequests.list(%{provider: "gitlab", bucket: "assigned", state: "closed"})

    assert_received {:gitlab_query, assigned_query}
    assert assigned_query =~ "assignee_username=gitlab-ludwig"
    assert assigned_query =~ "state=closed"
    assert assigned.total_count == 1
    assert assigned.providers.gitlab.available

    [assigned_item] = assigned.items
    assert assigned_item.reference == "!?"
    assert assigned_item.repository == "n/d"
    assert assigned_item.title == "Sans titre"
    assert assigned_item.state == "closed"
    assert assigned_item.is_draft == true

    review_requested = PullRequests.list(%{provider: "gitlab", bucket: "review_requested", state: "open"})

    assert_received {:gitlab_query, review_requested_query}
    assert review_requested_query =~ "reviewer_username=gitlab-ludwig"
    assert review_requested_query =~ "state=opened"
    assert review_requested.items == []

    Application.put_env(:symphony_elixir, :pull_requests_cli_runner, fn
      "glab", ["auth", "status"] -> {:ok, "gitlab auth ok"}
      "glab", ["api", "user"] -> {:ok, "{}"}
      command, args -> raise "unexpected command #{inspect(command)} #{inspect(args)}"
    end)

    invalid_user = PullRequests.list(%{provider: "gitlab", bucket: "created", state: "open"})

    assert invalid_user.items == []
    assert invalid_user.providers.gitlab.error == "Impossible de résoudre l'utilisateur GitLab courant."

    Application.put_env(:symphony_elixir, :pull_requests_cli_runner, fn
      "glab", ["auth", "status"] -> {:ok, "gitlab auth ok"}
      "glab", ["api", "user"] -> {:error, {1, ""}}
      command, args -> raise "unexpected command #{inspect(command)} #{inspect(args)}"
    end)

    user_lookup_failure = PullRequests.list(%{provider: "gitlab", bucket: "created", state: "open"})

    assert user_lookup_failure.items == []
    assert user_lookup_failure.providers.gitlab.error == "Impossible de résoudre l'utilisateur GitLab courant."

    Application.put_env(:symphony_elixir, :pull_requests_cli_runner, fn
      "glab", ["auth", "status"] -> {:ok, "gitlab auth ok"}
      "glab", ["api", "user"] -> {:ok, ~s({"username":"gitlab-ludwig"})}
      "glab", ["api", query] when is_binary(query) -> {:ok, "not-json"}
      command, args -> raise "unexpected command #{inspect(command)} #{inspect(args)}"
    end)

    invalid_json = PullRequests.list(%{provider: "gitlab", bucket: "created", state: "open"})

    assert invalid_json.items == []
    assert invalid_json.providers.gitlab.error == "Réponse JSON GitLab invalide."

    Application.put_env(:symphony_elixir, :pull_requests_cli_runner, fn
      "glab", ["auth", "status"] -> {:ok, "gitlab auth ok"}
      "glab", ["api", "user"] -> {:ok, ~s({"username":"gitlab-ludwig"})}
      "glab", ["api", query] when is_binary(query) -> {:error, {1, "permission denied"}}
      command, args -> raise "unexpected command #{inspect(command)} #{inspect(args)}"
    end)

    command_error = PullRequests.list(%{provider: "gitlab", bucket: "created", state: "open"})

    assert command_error.items == []
    assert command_error.providers.gitlab.error == "permission denied"
  end

  test "list/1 reports timed out providers without dropping successful results" do
    Application.put_env(:symphony_elixir, :pull_requests_command_path_resolver, &available_cli_path/1)
    Application.put_env(:symphony_elixir, :pull_requests_provider_timeout_ms, 1)

    Application.put_env(:symphony_elixir, :pull_requests_cli_runner, fn
      "gh", ["auth", "status"] ->
        {:ok, "github auth ok"}

      "gh", ["search", "prs" | _args] ->
        Process.sleep(25)
        {:ok, "[]"}

      "glab", ["auth", "status"] ->
        {:ok, "gitlab auth ok"}

      "glab", ["api", "user"] ->
        {:ok, ~s({"username":"gitlab-ludwig"})}

      "glab", ["api", query] when is_binary(query) ->
        {:ok,
         Jason.encode!([
           %{
             "id" => 701,
             "iid" => 27,
             "title" => "fast gitlab result",
             "web_url" => "https://gitlab.com/acme/platform/-/merge_requests/27",
             "state" => "opened",
             "draft" => false,
             "created_at" => "2026-03-21T12:00:00Z",
             "updated_at" => "2026-03-22T12:00:00Z",
             "references" => %{"short" => "!27", "full" => "acme/platform"},
             "author" => %{"username" => "gitlab-ludwig"},
             "assignees" => [],
             "reviewers" => []
           }
         ])}

      command, args ->
        raise "unexpected command #{inspect(command)} #{inspect(args)}"
    end)

    result = PullRequests.list(%{provider: "all", bucket: "created", state: "open"})

    assert result.total_count == 1
    assert result.providers.github.error == "Délai dépassé lors de la récupération des pull requests."
    assert result.providers.gitlab.available
  end

  test "list/1 uses executables found on PATH when no test runner is configured" do
    Application.delete_env(:symphony_elixir, :pull_requests_cli_runner)
    Application.delete_env(:symphony_elixir, :pull_requests_command_path_resolver)

    old_path = System.get_env("PATH")
    temp_dir = Path.join(System.tmp_dir!(), "symphony-pull-requests-cli-#{System.unique_integer([:positive])}")
    File.mkdir_p!(temp_dir)

    on_exit(fn ->
      restore_env("PATH", old_path)
      File.rm_rf(temp_dir)
    end)

    write_executable!(
      Path.join(temp_dir, "gh"),
      """
      #!/bin/sh
      if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
        echo "github auth ok"
        exit 0
      fi

      if [ "$1" = "search" ] && [ "$2" = "prs" ]; then
        echo '[{"id":"PR_cli","number":33,"title":"cli","url":"https://github.com/acme/cli/pull/33","state":"OPEN","isDraft":false,"createdAt":"2026-03-21T09:00:00Z","updatedAt":"2026-03-22T10:00:00Z","repository":{"nameWithOwner":"acme/cli"},"author":{"login":"cli-user","url":"https://github.com/cli-user"},"assignees":[]}]'
        exit 0
      fi

      exit 1
      """
    )

    write_executable!(
      Path.join(temp_dir, "glab"),
      """
      #!/bin/sh
      if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
        echo "gitlab auth ok"
        exit 0
      fi

      if [ "$1" = "api" ] && [ "$2" = "user" ]; then
        exit 1
      fi

      exit 1
      """
    )

    System.put_env("PATH", "#{temp_dir}:#{old_path}")

    github = PullRequests.list(%{provider: "github", bucket: "created", state: "open"})

    assert github.providers.github.available

    assert github.items == [
             %{
               provider: "github",
               id: "PR_cli",
               number: 33,
               reference: "#33",
               repository: "acme/cli",
               title: "cli",
               url: "https://github.com/acme/cli/pull/33",
               author: %{
                 login: "cli-user",
                 display_name: "cli-user",
                 url: "https://github.com/cli-user"
               },
               assignees: [],
               reviewers: [],
               state: "open",
               is_draft: false,
               created_at: "2026-03-21T09:00:00Z",
               updated_at: "2026-03-22T10:00:00Z"
             }
           ]

    gitlab = PullRequests.list(%{provider: "gitlab", bucket: "created", state: "open"})

    assert gitlab.items == []
    assert gitlab.providers.gitlab.error == "Impossible de résoudre l'utilisateur GitLab courant."
  end

  defp available_cli_path("gh"), do: "/usr/bin/gh"
  defp available_cli_path("glab"), do: "/usr/bin/glab"

  defp write_executable!(path, contents) do
    File.write!(path, contents)
    File.chmod!(path, 0o755)
  end
end
