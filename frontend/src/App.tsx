import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import zhCN from 'antd/locale/zh_CN';
import BasicLayout from './layouts/BasicLayout';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './pages/auth/LoginPage';
import ActivationPage from './pages/license/ActivationPage';
import { EnvironmentProvider } from './contexts/EnvironmentContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Lazy-loaded page components for code splitting
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const ProjectListPage = lazy(() => import('./pages/project/ProjectListPage'));
const ProjectDetailPage = lazy(() => import('./pages/project/ProjectDetailPage'));
const ApplicationDetailPage = lazy(() => import('./pages/application/ApplicationDetailPage'));
const EditorPage = lazy(() => import('./pages/editor/EditorPage'));
const NotificationListPage = lazy(() => import('./pages/notification/NotificationListPage'));
const AboutPage = lazy(() => import('./pages/about/AboutPage'));

const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" tip="加载中..." />
  </div>
);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <ConfigProvider locale={zhCN}>
      <EnvironmentProvider>
      <BrowserRouter>
        <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* Activation must be reachable while logged in but unactivated;
                ProtectedRoute lets it through when path === '/activation' */}
            <Route
              path="/activation"
              element={
                <ProtectedRoute>
                  <ActivationPage />
                </ProtectedRoute>
              }
            />
            {/* Editor page — full-screen, no BasicLayout wrapper */}
            <Route
              path="/sequences/:seqId"
              element={
                <ProtectedRoute>
                  <EditorPage />
                </ProtectedRoute>
              }
            />
            {/* Legacy route redirect */}
            <Route
              path="/sequences/:seqId/editor"
              element={
                <ProtectedRoute>
                  <EditorPage />
                </ProtectedRoute>
              }
            />
            <Route
              element={
                <ProtectedRoute>
                  <BasicLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectListPage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/projects/:id/applications/:appId" element={<ApplicationDetailPage />} />
              <Route path="/notifications" element={<NotificationListPage />} />
              <Route path="/about" element={<AboutPage />} />
            </Route>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
      </EnvironmentProvider>
    </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App;
