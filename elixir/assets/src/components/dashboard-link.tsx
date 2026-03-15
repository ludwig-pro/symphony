import * as React from "react"

type DashboardLinkProps = Omit<React.ComponentPropsWithoutRef<"a">, "href"> & {
  href: string
  onNavigate: (href: string) => void
}

function shouldHandleClientNavigation(
  event: React.MouseEvent<HTMLAnchorElement>,
  target?: string
) {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey ||
    target === "_blank"
  )
}

export const DashboardLink = React.forwardRef<HTMLAnchorElement, DashboardLinkProps>(
  ({ href, onNavigate, onClick, target, ...props }, ref) => {
    return (
      <a
        {...props}
        ref={ref}
        href={href}
        target={target}
        onClick={(event) => {
          onClick?.(event)

          if (!shouldHandleClientNavigation(event, target)) {
            return
          }

          event.preventDefault()
          onNavigate(href)
        }}
      />
    )
  }
)

DashboardLink.displayName = "DashboardLink"
