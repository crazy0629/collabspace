import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ConnectionBanner } from './components/ui/ConnectionBanner'
import { DashboardPage } from './pages/DashboardPage'
import { DocumentsProvider } from './store/DocumentsProvider'
import { SessionProvider } from './store/SessionProvider'
import { ToastProvider } from './store/ToastProvider'
import { useSession } from './store/useSession'

// The editor pulls in TipTap/ProseMirror, so it is split out of the dashboard bundle.
const DocumentPage = lazy(() => import('./pages/DocumentPage').then((module) => ({ default: module.DocumentPage })))

function AppRoutes() {
  const { currentUser } = useSession()
  return (
    // Keyed by user: switching demo accounts resets all document state and refetches as that user.
    <DocumentsProvider key={currentUser.id}>
      <ConnectionBanner />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage view="all" />} />
          <Route path="my-documents" element={<DashboardPage view="mine" />} />
          <Route path="shared" element={<DashboardPage view="shared" />} />
          <Route path="favorites" element={<DashboardPage view="favorites" />} />
          <Route path="trash" element={<DashboardPage view="trash" />} />
        </Route>
        <Route
          path="documents/:id"
          element={
            <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
              <DocumentPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DocumentsProvider>
  )
}

function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SessionProvider>
    </ToastProvider>
  )
}

export default App
