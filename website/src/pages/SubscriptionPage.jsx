import { Link } from "react-router-dom";

export default function SubscriptionPage({ user }) {
  return (
    <div className="container page subscription-page">
      <h1>Author Subscription</h1>
      <p className="lead">
        Support for paid author subscriptions is coming soon. You can still meet new voices,
        follow authors, and publish your own stories today.
      </p>
      <div className="card-panel">
        <h2>What you can do today</h2>
        <ul>
          <li>
            <Link to="/write">Write & publish stories</Link> for free
          </li>
          <li>
            <Link to="/manage-stories">Manage your stories</Link>
          </li>
          <li>
            Follow authors from any <Link to="/">story page</Link>
          </li>
        </ul>
        <p className="meta">
          Signed in as: {user?.display_name || user?.email || "Guest"}
        </p>
        <p className="meta">
          Paid memberships are not available yet. We’ll share an update when they launch.
        </p>
      </div>
    </div>
  );
}
