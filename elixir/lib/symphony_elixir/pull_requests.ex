defmodule SymphonyElixir.PullRequests do
  @moduledoc """
  Read-only pull request and merge request aggregation via GitHub and GitLab CLIs.
  """

  @default_limit 100
  @default_provider_timeout_ms 5_000
  @github_supported_buckets ["created", "assigned", "mentioned", "review_requested"]
  @gitlab_supported_buckets ["created", "assigned", "review_requested"]
  @github_json_fields [
    "assignees",
    "author",
    "createdAt",
    "id",
    "isDraft",
    "number",
    "repository",
    "state",
    "title",
    "updatedAt",
    "url"
  ]

  @type filters :: %{
          provider: String.t(),
          bucket: String.t(),
          state: String.t()
        }

  @spec list(filters()) :: map()
  def list(%{provider: provider, bucket: bucket, state: state} = filters) do
    selected_providers = selected_providers(provider)
    provider_results = fetch_selected_providers(selected_providers, filters)

    providers =
      %{
        github: base_provider_status("github", bucket),
        gitlab: base_provider_status("gitlab", bucket)
      }
      |> Map.merge(provider_results.providers)

    items =
      provider_results.items
      |> Enum.sort_by(&timestamp_sort_value(&1.updated_at), :desc)

    %{
      generated_at: generated_at(),
      filters: %{provider: provider, bucket: bucket, state: state},
      providers: providers,
      items: items,
      total_count: length(items)
    }
  end

  defp fetch_selected_providers(selected_providers, filters) do
    timeout_ms = provider_timeout_ms()

    selected_providers
    |> Task.async_stream(&fetch_provider(&1, filters),
      ordered: true,
      timeout: timeout_ms,
      on_timeout: :kill_task,
      max_concurrency: length(selected_providers)
    )
    |> Enum.zip(selected_providers)
    |> Enum.reduce(%{providers: %{}, items: []}, fn
      {{:ok, %{status: status, items: items}}, provider}, acc ->
        %{
          providers: Map.put(acc.providers, provider_key(provider), status),
          items: acc.items ++ items
        }

      {{:exit, _reason}, provider}, acc ->
        timeout_status = timeout_provider_status(provider, filters.bucket)

        %{
          providers: Map.put(acc.providers, provider_key(provider), timeout_status),
          items: acc.items
        }
    end)
  end

  defp fetch_provider("github", filters), do: fetch_github(filters)
  defp fetch_provider("gitlab", filters), do: fetch_gitlab(filters)

  defp fetch_github(%{bucket: bucket, state: state}) do
    with {:ok, _path} <- ensure_command_available("gh", "Le CLI GitHub (`gh`) n'est pas installé."),
         :ok <- ensure_authenticated("gh", ["auth", "status"], "GitHub CLI n'est pas authentifié.") do
      if bucket_supported?("github", bucket) do
        case run_command("gh", github_search_args(bucket, state)) do
          {:ok, output} ->
            case Jason.decode(output) do
              {:ok, items} when is_list(items) ->
                %{
                  status: available_provider_status("github", bucket),
                  items: Enum.map(items, &normalize_github_item/1)
                }

              _ ->
                %{
                  status:
                    error_provider_status(
                      "github",
                      bucket,
                      true,
                      "Réponse JSON GitHub invalide."
                    ),
                  items: []
                }
            end

          {:error, {_status, output}} ->
            %{
              status:
                error_provider_status(
                  "github",
                  bucket,
                  true,
                  command_error_message(output, "Impossible de récupérer les pull requests GitHub.")
                ),
              items: []
            }
        end
      else
        %{
          status:
            unsupported_provider_status(
              "github",
              bucket,
              true,
              "Ce filtre n'est pas pris en charge par GitHub."
            ),
          items: []
        }
      end
    else
      {:error, {:unavailable, message}} ->
        %{status: unavailable_provider_status("github", bucket, message), items: []}

      {:error, {:unauthenticated, message}} ->
        %{status: unauthenticated_provider_status("github", bucket, message), items: []}
    end
  end

  defp fetch_gitlab(%{bucket: bucket, state: state}) do
    with {:ok, _path} <- ensure_command_available("glab", "Le CLI GitLab (`glab`) n'est pas installé."),
         :ok <- ensure_authenticated("glab", ["auth", "status"], "GitLab CLI n'est pas authentifié.") do
      if bucket_supported?("gitlab", bucket) do
        case resolve_gitlab_username() do
          {:ok, username} ->
            case run_command("glab", gitlab_merge_request_args(bucket, state, username)) do
              {:ok, output} ->
                case Jason.decode(output) do
                  {:ok, items} when is_list(items) ->
                    %{
                      status: available_provider_status("gitlab", bucket),
                      items: Enum.map(items, &normalize_gitlab_item/1)
                    }

                  _ ->
                    %{
                      status:
                        error_provider_status(
                          "gitlab",
                          bucket,
                          true,
                          "Réponse JSON GitLab invalide."
                        ),
                      items: []
                    }
                end

              {:error, {_status, output}} ->
                %{
                  status:
                    error_provider_status(
                      "gitlab",
                      bucket,
                      true,
                      command_error_message(output, "Impossible de récupérer les merge requests GitLab.")
                    ),
                  items: []
                }
            end

          {:error, message} ->
            %{
              status: error_provider_status("gitlab", bucket, true, message),
              items: []
            }
        end
      else
        %{
          status:
            unsupported_provider_status(
              "gitlab",
              bucket,
              true,
              "GitLab ne prend pas encore en charge le filtre Mentioned dans cette V1."
            ),
          items: []
        }
      end
    else
      {:error, {:unavailable, message}} ->
        %{status: unavailable_provider_status("gitlab", bucket, message), items: []}

      {:error, {:unauthenticated, message}} ->
        %{status: unauthenticated_provider_status("gitlab", bucket, message), items: []}
    end
  end

  defp github_search_args(bucket, state) do
    [
      "search",
      "prs"
      | github_bucket_args(bucket) ++
          [
            "--state",
            state,
            "--archived",
            "false",
            "--limit",
            Integer.to_string(@default_limit),
            "--json",
            Enum.join(@github_json_fields, ",")
          ]
    ]
  end

  defp github_bucket_args("created"), do: ["--author", "@me"]
  defp github_bucket_args("assigned"), do: ["--assignee", "@me"]
  defp github_bucket_args("mentioned"), do: ["--mentions", "@me"]
  defp github_bucket_args("review_requested"), do: ["--review-requested", "@me"]

  defp gitlab_merge_request_args(bucket, state, username) do
    state = gitlab_state(state)
    parameter = gitlab_bucket_query_param(bucket)

    query =
      URI.encode_query(%{
        "scope" => "all",
        parameter => username,
        "state" => state,
        "per_page" => Integer.to_string(@default_limit),
        "order_by" => "updated_at",
        "sort" => "desc"
      })

    ["api", "merge_requests?#{query}"]
  end

  defp gitlab_bucket_query_param("created"), do: "author_username"
  defp gitlab_bucket_query_param("assigned"), do: "assignee_username"
  defp gitlab_bucket_query_param("review_requested"), do: "reviewer_username"

  defp gitlab_state("open"), do: "opened"
  defp gitlab_state("closed"), do: "closed"

  defp resolve_gitlab_username do
    case run_command("glab", ["api", "user"]) do
      {:ok, output} ->
        with {:ok, %{"username" => username}} when is_binary(username) <- Jason.decode(output) do
          {:ok, username}
        else
          _ -> {:error, "Impossible de résoudre l'utilisateur GitLab courant."}
        end

      {:error, {_status, output}} ->
        {:error, command_error_message(output, "Impossible de résoudre l'utilisateur GitLab courant.")}
    end
  end

  defp normalize_github_item(item) do
    number = integer_value(Map.get(item, "number"))

    %{
      provider: "github",
      id: string_value(Map.get(item, "id")),
      number: number,
      reference: if(is_integer(number), do: "##{number}", else: "#?"),
      repository: get_in(item, ["repository", "nameWithOwner"]) || "n/d",
      title: string_value(Map.get(item, "title")) || "Sans titre",
      url: string_value(Map.get(item, "url")),
      author: normalize_actor(Map.get(item, "author")),
      assignees: normalize_actors(Map.get(item, "assignees")),
      reviewers: [],
      state: normalize_state(Map.get(item, "state")),
      is_draft: truthy?(Map.get(item, "isDraft")),
      created_at: string_value(Map.get(item, "createdAt")),
      updated_at: string_value(Map.get(item, "updatedAt"))
    }
  end

  defp normalize_gitlab_item(item) do
    number = integer_value(Map.get(item, "iid"))

    %{
      provider: "gitlab",
      id: string_value(Map.get(item, "id")),
      number: number,
      reference: string_value(get_in(item, ["references", "short"])) || if(is_integer(number), do: "!#{number}", else: "!?"),
      repository: string_value(get_in(item, ["references", "full"])) || "n/d",
      title: string_value(Map.get(item, "title")) || "Sans titre",
      url: string_value(Map.get(item, "web_url")),
      author: normalize_actor(Map.get(item, "author")),
      assignees: normalize_actors(Map.get(item, "assignees")),
      reviewers: normalize_actors(Map.get(item, "reviewers")),
      state: normalize_state(Map.get(item, "state")),
      is_draft: truthy?(Map.get(item, "draft")) or truthy?(Map.get(item, "work_in_progress")),
      created_at: string_value(Map.get(item, "created_at")),
      updated_at: string_value(Map.get(item, "updated_at"))
    }
  end

  defp normalize_actor(nil), do: nil

  defp normalize_actor(actor) when is_map(actor) do
    login =
      string_value(Map.get(actor, "login")) ||
        string_value(Map.get(actor, "username")) ||
        string_value(Map.get(actor, :login)) ||
        string_value(Map.get(actor, :username))

    display_name =
      string_value(Map.get(actor, "name")) ||
        string_value(Map.get(actor, :name)) ||
        login

    url =
      string_value(Map.get(actor, "url")) ||
        string_value(Map.get(actor, "web_url")) ||
        string_value(Map.get(actor, :url)) ||
        string_value(Map.get(actor, :web_url))

    if is_binary(login) and login != "" do
      %{login: login, display_name: display_name, url: url}
    else
      nil
    end
  end

  defp normalize_actor(_actor), do: nil

  defp normalize_actors(actors) when is_list(actors) do
    actors
    |> Enum.map(&normalize_actor/1)
    |> Enum.reject(&is_nil/1)
  end

  defp normalize_actors(_actors), do: []

  defp normalize_state(value) when is_binary(value) do
    case String.downcase(value) do
      "opened" -> "open"
      other -> other
    end
  end

  defp normalize_state(_value), do: "open"

  defp ensure_command_available(command, message) do
    case command_path(command) do
      nil -> {:error, {:unavailable, message}}
      path -> {:ok, path}
    end
  end

  defp ensure_authenticated(command, args, message) do
    case run_command(command, args) do
      {:ok, _output} -> :ok
      {:error, _reason} -> {:error, {:unauthenticated, message}}
    end
  end

  defp base_provider_status(provider, bucket) do
    %{
      available: false,
      authenticated: false,
      supported: bucket_supported?(provider, bucket),
      supported_buckets: supported_buckets(provider),
      warning: nil,
      error: nil
    }
  end

  defp available_provider_status(provider, bucket) do
    base_provider_status(provider, bucket)
    |> Map.merge(%{
      available: true,
      authenticated: true
    })
  end

  defp unavailable_provider_status(provider, bucket, message) do
    base_provider_status(provider, bucket)
    |> Map.put(:error, message)
  end

  defp unauthenticated_provider_status(provider, bucket, message) do
    base_provider_status(provider, bucket)
    |> Map.put(:error, message)
  end

  defp error_provider_status(provider, bucket, authenticated, message) do
    base_provider_status(provider, bucket)
    |> Map.merge(%{
      authenticated: authenticated,
      error: message
    })
  end

  defp unsupported_provider_status(provider, bucket, authenticated, message) do
    base_provider_status(provider, bucket)
    |> Map.merge(%{
      authenticated: authenticated,
      warning: message
    })
  end

  defp timeout_provider_status(provider, bucket) do
    base_provider_status(provider, bucket)
    |> Map.put(:error, "Délai dépassé lors de la récupération des pull requests.")
  end

  defp bucket_supported?("github", bucket), do: bucket in @github_supported_buckets
  defp bucket_supported?("gitlab", bucket), do: bucket in @gitlab_supported_buckets

  defp supported_buckets("github"), do: @github_supported_buckets
  defp supported_buckets("gitlab"), do: @gitlab_supported_buckets

  defp selected_providers("all"), do: ["github", "gitlab"]
  defp selected_providers(provider), do: [provider]

  defp provider_key("github"), do: :github
  defp provider_key("gitlab"), do: :gitlab

  defp provider_timeout_ms do
    Application.get_env(:symphony_elixir, :pull_requests_provider_timeout_ms, @default_provider_timeout_ms)
  end

  defp command_path(command) do
    case Application.get_env(:symphony_elixir, :pull_requests_command_path_resolver) do
      resolver when is_function(resolver, 1) -> resolver.(command)
      _ -> System.find_executable(command)
    end
  end

  defp run_command(command, args) do
    case Application.get_env(:symphony_elixir, :pull_requests_cli_runner) do
      runner when is_function(runner, 2) ->
        runner.(command, args)

      _ ->
        case command_path(command) do
          nil ->
            {:error, {:enoent, ""}}

          path ->
            case System.cmd(path, args, stderr_to_stdout: true) do
              {output, 0} -> {:ok, output}
              {output, status} -> {:error, {status, output}}
            end
        end
    end
  end

  defp command_error_message(output, fallback) do
    case output |> to_string() |> String.trim() do
      "" -> fallback
      trimmed -> trimmed
    end
  end

  defp generated_at do
    DateTime.utc_now()
    |> DateTime.truncate(:second)
    |> DateTime.to_iso8601()
  end

  defp timestamp_sort_value(nil), do: 0

  defp timestamp_sort_value(timestamp) when is_binary(timestamp) do
    case DateTime.from_iso8601(timestamp) do
      {:ok, datetime, _offset} -> DateTime.to_unix(datetime, :second)
      _ -> 0
    end
  end

  defp timestamp_sort_value(_timestamp), do: 0

  defp integer_value(value) when is_integer(value), do: value
  defp integer_value(_value), do: nil

  defp string_value(nil), do: nil
  defp string_value(value) when is_binary(value), do: value
  defp string_value(value) when is_atom(value), do: Atom.to_string(value)
  defp string_value(_value), do: nil

  defp truthy?(value), do: value in [true, "true", 1]
end
