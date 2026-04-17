import { createRoot } from "react-dom/client"
import { Toaster } from "sonner"
import "./index.css"
import { createBrowserRouter } from "react-router"
import { RouterProvider } from "react-router/dom"
import { RoleAccessGate } from "@/components/auth/RoleAccessGate"
import { DashboardPage } from "@/pages/DashboardPage"
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
import { Navigate, useParams } from "react-router"

function withAuth(element: ReactElement) {
  return <RequireAuth>{element}</RequireAuth>
}

function LegacyPublicEventRedirect() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/" replace />
  return <Navigate to={`/p/${id}`} replace />
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
      { index: true, element: <DashboardPage /> },
      { path: "events", element: <EventsListPage /> },
      { path: "events/:id", element: <EventDashboardPage /> },
      { path: "inventory", element: <InventoryPage /> },
      { path: "staff", element: <StaffPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "metrics", element: <GlobalMetricsPage /> },
      { path: "pos", element: <PosPage /> },
      { path: "scanner", element: <ScannerPage /> },
    ],
  },
])

createRoot(document.getElementById("root")!).render(
  <>
    <RouterProvider router={router} />
    <Toaster position="top-center" richColors={false} closeButton theme="system" />
  </>
)
