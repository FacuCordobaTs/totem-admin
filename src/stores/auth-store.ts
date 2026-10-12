import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { apiFetch, ApiError } from "@/lib/api"

export type StaffRole =
  | "ADMIN"
  | "MANAGER"
  | "BARTENDER"
  | "SECURITY"
  | "TRANSPORTER"
  | "PROMOTER"
  | "GENERAL_PROMOTER"

export type StaffProfile = {
  id: string
  name: string
  email: string
  role: StaffRole
  roles?: StaffRole[]
  tenantId: string | null
  /** Nombre de la productora (solo UI; el backend usa `tenant`). */
  tenantName?: string | null
  isActive?: boolean
  createdAt?: string | null
}

type AuthState = {
  token: string | null
  staff: StaffProfile | null
  roleChosen: boolean
  chooseRole: (role: StaffRole) => Promise<void>
  showRolePicker: () => void
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
      roleChosen: false,
      setAuth: (token, staff) => set({ token, staff, roleChosen: false }),
      showRolePicker: () => set({ roleChosen: false }),
      chooseRole: async (role) => {
        const token = get().token
        const data = await apiFetch<{ token: string; staff: StaffProfile }>("/staff/me/role", {
          method: "POST", token, body: JSON.stringify({ role }),
        })
        if (get().token !== token) throw new Error("La sesión cambió. Volvé a ingresar.")
        set({ ...data, roleChosen: true })
      },
      updateStaff: (staff) => set({ staff }),
      logout: () => set({ token: null, staff: null, roleChosen: false }),
      fetchSession: async () => {
        const token = get().token
        if (!token) return
        try {
          const data = await apiFetch<{ staff: StaffProfile }>("/staff/me", {
            method: "GET",
            token,
            signal: AbortSignal.timeout(3000),
          })
          if (get().token !== token) return
          set({
            staff: {
              ...data.staff,
              tenantId: data.staff.tenantId ?? null,
              isActive: data.staff.isActive ?? true,
              tenantName: data.staff.tenantName ?? null,
            },
          })
        } catch (err) {
          if (get().token === token && err instanceof ApiError && err.status === 401) {
            set({ token: null, staff: null, roleChosen: false })
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
