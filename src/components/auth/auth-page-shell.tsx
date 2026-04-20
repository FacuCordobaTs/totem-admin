import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function AuthBrandHeader() {
  return (
    <div className="mb-8 flex flex-col items-center gap-2">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF9500]/15 text-[17px] font-bold text-[#FF9500]"
        aria-hidden
      >
        T
      </div>
      <p className="text-center text-sm text-[#8E8E93] dark:text-[#98989D]">
        Totem — operación de eventos
      </p>
    </div>
  )
}

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F2F2F7] px-4 py-12 dark:bg-black">
      <AuthBrandHeader />
      {children}
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
