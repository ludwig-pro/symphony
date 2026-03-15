import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import { switchSuccessMessage, type AgentPayload, type DashboardPayload } from "@/lib/dashboard"

type RequestError = {
  error?: {
    code?: string
    message?: string
  }
}

async function decodeJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

function requestMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }

  return fallback
}

export function useDashboardState() {
  const [snapshot, setSnapshot] = useState<DashboardPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const [isSwitchingAgent, setIsSwitchingAgent] = useState(false)
  const inFlightRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)

  const applySnapshot = (nextSnapshot: DashboardPayload) => {
    startTransition(() => {
      setSnapshot(nextSnapshot)
      setNetworkError(null)
    })
  }

  const fetchSnapshot = useEffectEvent(async (initial = false) => {
    if (inFlightRef.current) {
      return
    }

    const controller = new AbortController()
    controllerRef.current?.abort()
    controllerRef.current = controller
    inFlightRef.current = true

    if (initial) {
      setIsLoading(true)
    }

    setIsFetching(true)

    try {
      const response = await fetch("/api/v1/state", {
        headers: {
          accept: "application/json",
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        const payload = await decodeJson<RequestError>(response).catch(
          () => ({}) as RequestError
        )
        throw new Error(payload.error?.message || "Impossible de charger l'état du runtime.")
      }

      applySnapshot(await decodeJson<DashboardPayload>(response))
    } catch (error) {
      if (!controller.signal.aborted) {
        setNetworkError(requestMessage(error, "Impossible de joindre l'API du dashboard."))
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }

      inFlightRef.current = false
      setIsFetching(false)
      setIsLoading(false)
    }
  })

  useEffect(() => {
    let timer: number | null = null
    let stopped = false

    const loop = async (initial = false) => {
      await fetchSnapshot(initial)

      if (stopped) {
        return
      }

      timer = window.setTimeout(() => {
        void loop(false)
      }, 1_000)
    }

    void loop(true)

    return () => {
      stopped = true

      if (timer !== null) {
        window.clearTimeout(timer)
      }

      controllerRef.current?.abort()
    }
  }, [])

  const switchAgent = async (presetId: string) => {
    setIsSwitchingAgent(true)

    try {
      const response = await fetch("/api/v1/config/agent", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ preset_id: presetId }),
      })

      const payload = await decodeJson<AgentPayload & RequestError>(response)

      if (!response.ok) {
        throw new Error(payload.error?.message || "Impossible de changer le profil d'agent.")
      }

      startTransition(() => {
        setSnapshot((current) => (current ? { ...current, agent: payload } : current))
      })

      toast.success(switchSuccessMessage(payload.current))
      void fetchSnapshot(false)
    } catch (error) {
      toast.error(requestMessage(error, "Impossible de changer le profil d'agent."))
    } finally {
      setIsSwitchingAgent(false)
    }
  }

  return {
    snapshot,
    isLoading,
    isFetching,
    networkError,
    isSwitchingAgent,
    switchAgent,
  }
}
