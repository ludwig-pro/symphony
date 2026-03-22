import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import {
  defaultPullRequestFilters,
  type PullRequestBucket,
  type PullRequestProviderFilter,
  type PullRequestsPayload,
  type PullRequestStateFilter,
} from "@/lib/pull-requests";

type RequestError = {
  error?: {
    message?: string;
  };
};

async function decodeJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function requestMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function buildQuery(
  provider: PullRequestProviderFilter,
  bucket: PullRequestBucket,
  state: PullRequestStateFilter,
) {
  const query = new URLSearchParams({
    provider,
    bucket,
    state,
  });

  return `/api/v1/pull-requests?${query.toString()}`;
}

export function usePullRequestsState(active: boolean) {
  const [payload, setPayload] = useState<PullRequestsPayload | null>(null);
  const [provider, setProvider] = useState<PullRequestProviderFilter>(
    defaultPullRequestFilters.provider,
  );
  const [bucket, setBucket] = useState<PullRequestBucket>(
    defaultPullRequestFilters.bucket,
  );
  const [state, setState] = useState<PullRequestStateFilter>(
    defaultPullRequestFilters.state,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchPullRequests = useEffectEvent(async (initial = false) => {
    if (!active || inFlightRef.current) {
      return;
    }

    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    inFlightRef.current = true;

    if (initial) {
      setIsLoading(true);
    }

    setIsFetching(true);

    try {
      const response = await fetch(buildQuery(provider, bucket, state), {
        headers: {
          accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await decodeJson<RequestError>(response).catch(
          () => ({}) as RequestError,
        );

        throw new Error(
          body.error?.message ||
            "Impossible de charger les pull requests du dashboard.",
        );
      }

      const nextPayload = await decodeJson<PullRequestsPayload>(response);

      startTransition(() => {
        setPayload(nextPayload);
        setError(null);
      });
    } catch (fetchError) {
      if (!controller.signal.aborted) {
        setError(
          requestMessage(
            fetchError,
            "Impossible de charger les pull requests du dashboard.",
          ),
        );
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }

      inFlightRef.current = false;
      setIsFetching(false);
      setIsLoading(false);
    }
  });

  useEffect(() => {
    if (!active) {
      controllerRef.current?.abort();
      setIsFetching(false);
      setIsLoading(false);
      return;
    }

    let timer: number | null = null;
    let stopped = false;

    const loop = async (initial = false) => {
      await fetchPullRequests(initial);

      if (stopped) {
        return;
      }

      timer = window.setTimeout(() => {
        void loop(false);
      }, 30_000);
    };

    void loop(true);

    return () => {
      stopped = true;

      if (timer !== null) {
        window.clearTimeout(timer);
      }

      controllerRef.current?.abort();
    };
  }, [active, provider, bucket, state]);

  return {
    payload,
    filters: { provider, bucket, state },
    isLoading,
    isFetching,
    error,
    setProvider,
    setBucket,
    setState,
  };
}
