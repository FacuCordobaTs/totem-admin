import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

/**
 * Sesión de puesto (spec §1): el dispositivo queda fijado a un evento/puesto y el
 * personal rota identificándose solo con su PIN. Este store guarda a qué puesto está
 * fijado ESTE dispositivo; sobrevive al logout del bartender de turno (persistido en
 * localStorage) para que el siguiente entre solo con su PIN sin reconfigurar nada.
 */
export type PosDeviceSession = {
  token: string
  eventId: string
  eventName: string
  barId: string | null
  barName: string | null
  label: string
}

type PosSessionState = {
  session: PosDeviceSession | null
  setSession: (s: PosDeviceSession) => void
  clear: () => void
}

export const usePosSessionStore = create<PosSessionState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      clear: () => set({ session: null }),
    }),
    {
      name: "crow-pos-session",
      storage: createJSONStorage(() => localStorage),
    }
  )
)
