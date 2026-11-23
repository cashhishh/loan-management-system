import { Link, Navigate, Route, Routes } from 'react-router-dom';
import Layout, { ProtectedRoute } from './components/Layout';
import { homeFor, useAuth } from './context/AuthContext';
import { PageLoader } from './components/ui';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import ApplicantDashboard from './pages/applicant/Dashboard';
import ApplicationWizard, { NewApplication } from './pages/applicant/ApplicationWizard';
import ApplicationView from './pages/applicant/ApplicationView';
import ApplicationsQueue, { ADMIN_STATUS_OPTIONS, OFFICER_STATUS_OPTIONS } from './pages/staff/ApplicationsQueue';
import ReviewDetail from './pages/staff/ReviewDetail';
import UsersPage from './pages/admin/Users';

function Home() {
  const { user, status } = useAuth();
  if (status === 'loading') return <PageLoader />;
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <p className="mt-2 text-slate-600">This page doesn’t exist.</p>
      <Link to="/" className="mt-4 inline-block text-brand-600 hover:underline">
        Go home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route element={<ProtectedRoute roles={['APPLICANT']} />}>
            <Route path="/dashboard" element={<ApplicantDashboard />} />
            <Route path="/applications/new" element={<NewApplication />} />
            <Route path="/applications/:id/edit" element={<ApplicationWizard />} />
            <Route path="/applications/:id" element={<ApplicationView />} />
          </Route>

          <Route element={<ProtectedRoute roles={['OFFICER']} />}>
            <Route
              path="/review"
              element={
                <ApplicationsQueue
                  title="Review queue"
                  subtitle="Pick up submitted applications, run eligibility checks and make a recommendation."
                  presetStatuses="SUBMITTED,UNDER_REVIEW,MORE_INFO_NEEDED"
                  statusOptions={OFFICER_STATUS_OPTIONS}
                  showAssigned
                />
              }
            />
            <Route path="/review/:id" element={<ReviewDetail />} />
          </Route>

          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route
              path="/admin"
              element={
                <ApplicationsQueue
                  key="approvals"
                  title="Final approvals"
                  subtitle="Applications recommended by loan officers, awaiting your decision."
                  presetStatuses="RECOMMENDED_APPROVAL,RECOMMENDED_REJECTION"
                  statusOptions={ADMIN_STATUS_OPTIONS}
                  showAssigned={false}
                />
              }
            />
            <Route
              path="/admin/applications"
              element={
                <ApplicationsQueue
                  key="all"
                  title="All applications"
                  subtitle="Every application in the system, across all stages."
                  presetStatuses=""
                  statusOptions={ADMIN_STATUS_OPTIONS}
                  showAssigned={false}
                />
              }
            />
            <Route path="/admin/applications/:id" element={<ReviewDetail />} />
            <Route path="/admin/users" element={<UsersPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
