import { Compass } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <EmptyState icon={Compass} title="Page not found" className="mx-auto mt-10 max-w-lg"
      description={`There is nothing at ${pathname}. It may have moved, or the link may be mistyped.`}
      action={<div className="flex flex-wrap justify-center gap-2"><Button as={Link} to="/">Go home</Button><Button as={Link} to="/predict" variant="secondary">Predict a flight</Button></div>} />
  );
}
