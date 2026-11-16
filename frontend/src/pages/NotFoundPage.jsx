import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="page">
      <div className="error-state">
        <div className="error-icon" aria-hidden="true">?</div>
        <h3>Page not found</h3>
        <p>The page you are looking for does not exist or has moved.</p>
        <Link to="/" className="btn btn-secondary">
          Go to home
        </Link>
      </div>
    </div>
  );
}
