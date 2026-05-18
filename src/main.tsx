import { createRoot } from "react-dom/client"
import { Toaster } from "sonner"
import "./index.css"
import { createBrowserRouter, Navigate } from "react-router"
import { RouterProvider } from "react-router/dom"
import { RoleAccessGate } from "@/components/auth/RoleAccessGate"
import { EventsListPage } from "@/pages/EventsListPage"
import { EventDashboardPage } from "@/pages/EventDashboardPage"
import { InventoryPage } from "@/pages/InventoryPage"
import { StaffPage } from "@/pages/StaffPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { GlobalMetricsPage } from "@/pages/GlobalMetricsPage"
import { PosPage } from "@/pages/PosPage"
import { ScannerPage } from "@/pages/ScannerPage"
import { LoginPage } from "@/pages/LoginPage"
import { RegisterPage } from "@/pages/RegisterPage"
import { PublicEventPage } from "@/pages/PublicEventPage"
import { RequireAuth } from "@/components/auth/RequireAuth"
import { GuestRoute } from "@/components/auth/GuestRoute"
import type { ReactElement } from "react"
import { useParams, useSearchParams } from "react-router"

function withAuth(element: ReactElement) {
  return <RequireAuth>{element}</RequireAuth>
}

function LegacyPublicEventRedirect() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/" replace />
  return <Navigate to={`/p/${id}`} replace />
}

function LegacyEventRedirect() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/eventos" replace />
  return <Navigate to={`/eventos/${id}`} replace />
}

function MpOAuthRedirect() {
  const [sp] = useSearchParams()
  const next = new URLSearchParams(sp)
  next.set("tab", "finances")
  return <Navigate to={`/configuracion?${next.toString()}`} replace />
}

const router = createBrowserRouter([
  { path: "/p/:id", element: <PublicEventPage /> },
  { path: "/e/:id", element: <LegacyPublicEventRedirect /> },
  {
    path: "/login",
    element: (
      <GuestRoute>
        <LoginPage />
      </GuestRoute>
    ),
  },
  {
    path: "/register",
    element: (
      <GuestRoute>
        <RegisterPage />
      </GuestRoute>
    ),
  },
  {
    path: "/",
    element: withAuth(<RoleAccessGate />),
    children: [
      { index: true, element: <Navigate to="/eventos" replace /> },
      { path: "eventos", element: <EventsListPage /> },
      { path: "eventos/:id", element: <EventDashboardPage /> },
      { path: "catalogo", element: <InventoryPage /> },
      { path: "staff", element: <StaffPage /> },
      { path: "configuracion", element: <SettingsPage /> },
      { path: "metrics", element: <GlobalMetricsPage /> },
      { path: "pos", element: <PosPage /> },
      { path: "scanner", element: <ScannerPage /> },
      // Legacy redirects
      { path: "events", element: <Navigate to="/eventos" replace /> },
      { path: "events/:id", element: <LegacyEventRedirect /> },
      { path: "inventory", element: <Navigate to="/catalogo" replace /> },
      { path: "settings", element: <Navigate to="/configuracion" replace /> },
      { path: "dashboard/perfil", element: <MpOAuthRedirect /> },
      { path: "onboarding", element: <MpOAuthRedirect /> },
    ],
  },
])

createRoot(document.getElementById("root")!).render(
  <>
    <RouterProvider router={router} />
    <Toaster position="top-center" richColors={false} closeButton theme="system" />
  </>
)
