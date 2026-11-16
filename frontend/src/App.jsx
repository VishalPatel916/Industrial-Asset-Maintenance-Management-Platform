import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth, RequireRole } from './components/RequireRole';
import { useAuth } from './context/AuthContext';
import AssetDetailPage from './pages/AssetDetailPage';
import AssetFormPage from './pages/AssetFormPage';
import AssetListPage from './pages/AssetListPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage, { homePathFor } from './pages/LoginPage';
import MyWorkPage from './pages/MyWorkPage';
import NotFoundPage from './pages/NotFoundPage';
import RequestCreatePage from './pages/RequestCreatePage';
import RequestDetailPage from './pages/RequestDetailPage';
import RequestListPage from './pages/RequestListPage';
import UsersPage from './pages/UsersPage';
import WorkOrderDetailPage from './pages/WorkOrderDetailPage';
import WorkOrderListPage from './pages/WorkOrderListPage';
import { ROLES } from './utils/constants';

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homePathFor(user)} replace />;
}

const { Admin, Viewer } = ROLES;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route element={<RequireRole roles={[Admin, Viewer]} />}>
          <Route path="dashboard" element={<DashboardPage />} />
        </Route>
        <Route path="my-work" element={<MyWorkPage />} />

        <Route path="assets" element={<AssetListPage />} />
        <Route path="assets/:id" element={<AssetDetailPage />} />
        <Route element={<RequireRole roles={[Admin]} />}>
          <Route path="assets/new" element={<AssetFormPage />} />
          <Route path="assets/:id/edit" element={<AssetFormPage />} />
        </Route>

        <Route path="requests" element={<RequestListPage />} />
        <Route path="requests/new" element={<RequestCreatePage />} />
        <Route path="requests/:id" element={<RequestDetailPage />} />

        <Route path="work-orders" element={<WorkOrderListPage />} />
        <Route path="work-orders/:id" element={<WorkOrderDetailPage />} />

        <Route element={<RequireRole roles={[Admin]} />}>
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
