import { BarChart3, CloudRain, ShieldCheck } from 'lucide-react';
import { Suspense } from 'react';
import { Link, Outlet } from 'react-router-dom';
import ErrorBoundary from '../components/common/ErrorBoundary.jsx';
import { Logo } from '../components/layout/Navbar.jsx';
import ThemeToggle from '../components/layout/ThemeToggle.jsx';

const POINTS = [
  { icon: CloudRain, text: 'Weather-aware delay and cancellation probabilities' },
  { icon: BarChart3, text: 'Explanations for every prediction, trained on 6.8M flights' },
  { icon: ShieldCheck, text: 'Save routes and get alerts when risk changes' },
];

export default function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white lg:flex dark:bg-brand-950">
        <Logo className="text-white [&_span:last-child]:text-white" />
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight">Know before you go: will your flight be late?</h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-brand-100"><Icon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />{text}</li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-brand-200">Sem 7 capstone project</p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-700/40 blur-3xl" aria-hidden="true" />
      </aside>
      <main id="main" className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <Logo className="lg:hidden" />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          <ErrorBoundary>
            <Suspense fallback={null}><Outlet /></Suspense>
          </ErrorBoundary>
          <p className="muted mt-8 text-center text-sm"><Link to="/" className="hover:underline">Back to home</Link></p>
        </div>
      </main>
    </div>
  );
}
