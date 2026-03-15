import { useCallback, useEffect, useState } from "react"

import { dashboardPageForPath, normalizeDashboardPath } from "@/lib/navigation"

function currentDashboardPath() {
  if (typeof window === "undefined") {
    return "/"
  }

  return normalizeDashboardPath(window.location.pathname)
}

export function useDashboardRouter() {
  const [pathname, setPathname] = useState(currentDashboardPath)

  useEffect(() => {
    const syncFromLocation = () => {
      setPathname(currentDashboardPath())
    }

    window.addEventListener("popstate", syncFromLocation)

    return () => {
      window.removeEventListener("popstate", syncFromLocation)
    }
  }, [])

  const navigate = useCallback(
    (href: string) => {
      const nextPath = normalizeDashboardPath(href)

      if (nextPath === pathname) {
        return
      }

      window.history.pushState({}, "", nextPath)
      window.scrollTo({ top: 0, left: 0, behavior: "auto" })
      setPathname(nextPath)
    },
    [pathname]
  )

  return {
    pathname,
    page: dashboardPageForPath(pathname),
    navigate,
  }
}
