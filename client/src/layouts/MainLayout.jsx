import { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from '../components/common/ErrorBoundary.jsx';
import { SkeletonCard } from '../components/common/Skeleton.jsx';
import { useToast } from '../components/common/Toast.jsx';
import Footer from '../components/layout/Footer.jsx';
import Navbar from '../components/layout/Navbar.jsx';
import Sidebar from '../components/layout/Sidebar.jsx';
import { useAuth } from '../hooks/useAuth.js';

/** App shell. `sidebar={false}` gives the marketing (landing) variant: top bar + page + footer. */
export default function MainLayout({ sidebar = true }) {
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const { pathname } = useLocation();
  const { expired, dismissExpired } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (expired) { toast.warning('Session expired', 'Please log in again to continue.'); dismissExpired(); }
  }, [expired]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { window.scrollTo?.(0, 0); }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg dark:focus:bg-slate-900">Skip to content</a>
      <Navbar onMenu={() => setDrawer(true)} showMenuButton={sidebar} showTopLinks={!sidebar} />
      <div className="mx-auto flex w-full max-w-screen-2xl flex-1">
        {sidebar && <Sidebar open={drawer} onClose={closeDrawer} />}
        <main id="main" tabIndex={-1} className={sidebar ? 'min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8' : 'min-w-0 flex-1'}>
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<div className="space-y-4"><SkeletonCard height="h-32" /><SkeletonCard /></div>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <Footer />
    </div>
  );
}
