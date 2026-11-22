import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { apiFetch, ApiError, onStaffSessionRevoked, STAFF_ACCESS_PIN_REVOKED } from "@/lib/api"

export type StaffRole =
  | "ADMIN"
  | "MANAGER"
  | "BARTENDER"
  | "SECURITY"
  | "TRANSPORTER"
  | "PROMOTER"
  | "GENERAL_PROMOTER"
  | "DEPOSIT"

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

/** Por qué se cerró la sesión sin que la persona saliera: lo muestra la pantalla de reingreso. */
export type SessionNotice = "access-pin"

type AuthState = {
  token: string | null
  staff: StaffProfile | null
  roleChosen: boolean
  /**
   * Token del link de acceso (`/unirse/:token`) con el que entró la sesión de este dispositivo. Si
   * la sesión se pierde sin cerrar sesión (p. ej. al activarse el PIN de acceso del equipo), el
   * dispositivo vuelve a ese link en lugar del login con contraseña, que el personal no tiene.
   */
  accessLinkToken: string | null
  sessionNotice: SessionNotice | null
  chooseRole: (role: StaffRole) => Promise<void>
  showRolePicker: () => void
  setAuth: (token: string, staff: StaffProfile, options?: { accessLinkToken?: string }) => void
  updateStaff: (staff: StaffProfile) => void
  logout: () => void
  /** Cierra la sesión local porque el backend la revocó; conserva el link para volver a entrar. */
  revokeSession: (token: string, notice: SessionNotice) => void
  forgetAccessLink: () => void
  clearSessionNotice: () => void
  fetchSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      staff: null,
      roleChosen: false,
      accessLinkToken: null,
      sessionNotice: null,
      setAuth: (token, staff, options) =>
        set({
          token,
          staff,
          roleChosen: false,
          accessLinkToken: options?.accessLinkToken ?? null,
          sessionNotice: null,
        }),
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
      logout: () =>
        set({ token: null, staff: null, roleChosen: false, accessLinkToken: null, sessionNotice: null }),
      revokeSession: (token, notice) => {
        // Una respuesta tardía de una sesión anterior no puede cerrar la que entró después.
        if (get().token !== token) return
        set({ token: null, staff: null, roleChosen: false, sessionNotice: notice })
      },
      forgetAccessLink: () => set({ accessLinkToken: null, sessionNotice: null }),
      clearSessionNotice: () => set({ sessionNotice: null }),
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
            if (err.body?.code === STAFF_ACCESS_PIN_REVOKED) {
              get().revokeSession(token, "access-pin")
            } else {
              set({ token: null, staff: null, roleChosen: false })
            }
          }
        }
      },
    }),
    {
      name: "totem-admin-auth",
      partialize: (s) => ({
        token: s.token,
        staff: s.staff,
        accessLinkToken: s.accessLinkToken,
        sessionNotice: s.sessionNotice,
      }),
      storage: createJSONStorage(() => localStorage),
    }
  )
)

onStaffSessionRevoked((token) => useAuthStore.getState().revokeSession(token, "access-pin"))

/** A dónde vuelve un dispositivo que perdió la sesión: su link de acceso si entró por uno. */
export function staffReentryPath(state: Pick<AuthState, "accessLinkToken">): string {
  return state.accessLinkToken ? `/unirse/${state.accessLinkToken}` : "/login"
}
