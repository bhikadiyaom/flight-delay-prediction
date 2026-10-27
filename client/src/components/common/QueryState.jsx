import { RefreshCw, ServerCrash } from 'lucide-react';
import { getErrorMessage } from '../../api/axiosClient.js';
import Button from './Button.jsx';
import { SkeletonCard } from './Skeleton.jsx';

/** Error panel with a retry button, for a failed useQuery. */
export function QueryError({ error, onRetry, title = 'Could not load this data' }) {
  return (
    <div role="alert" className="card flex flex-col items-center gap-2 p-8 text-center">
      <ServerCrash size={28} className="text-red-700 dark:text-red-400" aria-hidden="true" />
      <h3 className="font-semibold">{title}</h3>
      <p className="muted max-w-md text-sm">{getErrorMessage(error)}</p>
      {onRetry && <Button variant="secondary" icon={RefreshCw} onClick={onRetry} className="mt-2">Try again</Button>}
    </div>
  );
}

/** Render children when the query has data; skeleton while loading; error panel on failure. */
export default function QueryState({ query, skeletonHeight = 'h-64', children }) {
  if (query.isPending) return <SkeletonCard height={skeletonHeight} />;
  if (query.isError) return <QueryError error={query.error} onRetry={() => query.refetch()} />;
  return children(query.data);
}
