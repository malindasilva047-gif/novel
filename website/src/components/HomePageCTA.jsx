import { Link } from "react-router-dom";

export default function HomePageCTA() {
  return (
    <section className="home-page-cta" aria-labelledby="home-page-cta-title">
      <svg className="home-page-cta-wing" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M4 40C10 22 26 10 58 8c-6 8-8 14-8 20 4-2 7-3 10-3-6 10-14 16-24 18 3 1 6 1 9 1-8 8-20 12-41-4z" />
      </svg>
      <div className="home-page-cta-copy">
        <span className="home-page-cta-eyebrow">A HOME FOR EVERY STORY</span>
        <h2 id="home-page-cta-title">Give wings to your imagination</h2>
        <p>Whether you’re writing your first chapter or looking for your next late-night read, Wingsaga connects storytellers with readers who care.</p>
      </div>
      <div className="home-page-cta-actions">
        <Link className="home-page-cta-button home-page-cta-button--primary" to="/write">Start writing</Link>
        <Link className="home-page-cta-button home-page-cta-button--secondary" to="/genres/Stories">Explore stories</Link>
      </div>
    </section>
  );
}
