import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout.jsx';
import MainLayout from '../layouts/MainLayout.jsx';
import AdminRoute from './AdminRoute.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';

// every page is its own chunk (the charts and map libraries only load on the pages that use them)
const Landing = lazy(() => import('../pages/LandingPage.jsx'));
const Login = lazy(() => import('../pages/LoginPage.jsx'));
const Register = lazy(() => import('../pages/RegisterPage.jsx'));
const EdaDashboard = lazy(() => import('../pages/EdaDashboardPage.jsx'));
const Predict = lazy(() => import('../pages/PredictPage.jsx'));
const LivePrediction = lazy(() => import('../pages/LivePredictionPage.jsx'));
const HistoricalSearch = lazy(() => import('../pages/HistoricalSearchPage.jsx'));
const ModelComparison = lazy(() => import('../pages/ModelComparisonPage.jsx'));
const SavedSearches = lazy(() => import('../pages/SavedSearchesPage.jsx'));
const BulkPrediction = lazy(() => import('../pages/BulkPredictionPage.jsx'));
const RiskMap = lazy(() => import('../pages/RiskMapPage.jsx'));
const Profile = lazy(() => import('../pages/ProfilePage.jsx'));
const AdminPanel = lazy(() => import('../pages/AdminPanelPage.jsx'));
const NotFound = lazy(() => import('../pages/NotFoundPage.jsx'));

/** Routes per docs/CONTEXT.md section 11: * = protected, ** = admin. /predict and /live are public (rate limited). */
export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout sidebar={false} />}>
        <Route index element={<Landing />} />
      </Route>
      <Route element={<AuthLayout />}>
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
      </Route>
      <Route element={<MainLayout />}>
        <Route path="eda" element={<EdaDashboard />} />
        <Route path="predict" element={<Predict />} />
        <Route path="live" element={<LivePrediction />} />
        <Route path="historical" element={<HistoricalSearch />} />
        <Route path="models" element={<ModelComparison />} />
        <Route path="risk-map" element={<RiskMap />} />
        <Route element={<ProtectedRoute />}>
          <Route path="saved" element={<SavedSearches />} />
          <Route path="bulk" element={<BulkPrediction />} />
          <Route path="profile" element={<Profile />} />
          <Route element={<AdminRoute />}>
            <Route path="admin" element={<AdminPanel />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
