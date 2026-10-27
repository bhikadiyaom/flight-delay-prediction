import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-6 text-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="muted">Flight Delay &amp; Cancellation Prediction · Sem 7 capstone · trained on 6.8M US flights from 2023.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-1">
          <Link to="/models" className="muted hover:underline">How accurate is it?</Link>
          <Link to="/eda" className="muted hover:underline">Insights</Link>
          <a href="https://www.kaggle.com/datasets/bordanova/2023-us-civil-flights-delay-meteo-and-aircraft" target="_blank" rel="noopener noreferrer" className="muted hover:underline">Dataset</a>
        </nav>
      </div>
    </footer>
  );
}
