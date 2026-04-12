import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { apiFetch, ApiError } from "@/lib/api"

export type StaffRole = "ADMIN" | "MANAGER" | "BARTENDER" | "SECURITY"

export type StaffProfile = {
  id: string
  name: string
  email: string
  role: StaffRole
  tenantId: string | null
  /** Nombre de la productora (solo UI; el backend usa `tenant`). */
  tenantName?: string | null
  isActive?: boolean
  createdAt?: string | null
}

type AuthState = {
  token: string | null
  staff: StaffProfile | null
  setAuth: (token: string, staff: StaffProfile) => void
  updateStaff: (staff: StaffProfile) => void
  logout: () => void
  fetchSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      staff: null,
      setAuth: (token, staff) => set({ token, staff }),
      updateStaff: (staff) => set({ staff }),
      logout: () => set({ token: null, staff: null }),
      fetchSession: async () => {
        const token = get().token
        if (!token) return
        try {
          const data = await apiFetch<{ staff: StaffProfile }>("/staff/me", {
            method: "GET",
            token,
          })
          set({
            staff: {
              ...data.staff,
              tenantId: data.staff.tenantId ?? null,
              isActive: data.staff.isActive ?? true,
              tenantName: data.staff.tenantName ?? null,
            },
          })
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            set({ token: null, staff: null })
          }
        }
      },
    }),
    {
      name: "totem-admin-auth",
      partialize: (s) => ({ token: s.token, staff: s.staff }),
      storage: createJSONStorage(() => localStorage),
    }
  )
)
