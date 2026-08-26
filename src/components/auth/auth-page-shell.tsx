import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { BrandLockup } from "@/components/auth/brand-lockup"

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center w-full bg-background px-6">
      <div className="w-full max-w-sm">
        <BrandLockup className="mb-12" />
        {children}
      </div>
    </div>
  )
}

export function AuthFormError({
  message,
  className,
}: {
  message: string
  className?: string
}) {
  return (
    <p
      className={cn(
        "rounded-xl border border-red-200/60 bg-red-50/90 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200",
        className
      )}
      role="alert"
    >
      {message}
    </p>
  )
}
