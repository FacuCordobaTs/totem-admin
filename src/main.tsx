import { createRoot } from "react-dom/client"
import "./index.css"
import { createBrowserRouter } from "react-router"
import { RouterProvider } from "react-router/dom"
import { DashboardPage } from "@/pages/DashboardPage"
import { EventsListPage } from "@/pages/EventsListPage"
import { EventDashboardPage } from "@/pages/EventDashboardPage"
import { InventoryPage } from "@/pages/InventoryPage"
import { StaffPage } from "@/pages/StaffPage"
import { FinancesPage } from "@/pages/FinancesPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { PosPage } from "@/pages/PosPage"
import { ScannerPage } from "@/pages/ScannerPage"
import { LoginPage } from "@/pages/LoginPage"
import { RegisterPage } from "@/pages/RegisterPage"
import { ProfilePage } from "@/pages/ProfilePage"
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
  { path: "/", element: withAuth(<DashboardPage />) },
  { path: "/events", element: withAuth(<EventsListPage />) },
  { path: "/events/:id", element: withAuth(<EventDashboardPage />) },
  { path: "/inventory", element: withAuth(<InventoryPage />) },
  { path: "/staff", element: withAuth(<StaffPage />) },
  { path: "/finances", element: withAuth(<FinancesPage />) },
  { path: "/settings", element: withAuth(<SettingsPage />) },
  { path: "/pos", element: withAuth(<PosPage />) },
  { path: "/scanner", element: withAuth(<ScannerPage />) },
  { path: "/profile", element: withAuth(<ProfilePage />) },
])

createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />
)
