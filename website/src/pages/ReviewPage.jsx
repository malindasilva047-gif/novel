import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getBook, postBookReview, resolveAssetUrl } from "../api";
import { isGuestUser } from "../utils/guest";

function StarRow({ label, value, onChange }) {
  return (
    <div className="star-row">
      <p>{label}</p>
      <div className="stars-pick">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={n <= value ? "star on" : "star"}
            onClick={() => onChange(n)}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReviewPage({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const guest = isGuestUser(user);
  const [book, setBook] = useState(null);
  const [overall, setOverall] = useState(0);
  const [plot, setPlot] = useState(0);
  const [style, setStyle] = useState(0);
  const [tech, setTech] = useState(0);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getBook(id)
      .then(setBook)
      .catch((e) => setError(String(e.message || e)));
  }, [id]);

  async function onSubmit(e) {
    e.preventDefault();
    if (guest) {
      setError("Sign in to submit a review");
      return;
    }
    if (!overall || !body.trim()) {
      setError("Rating and review text are required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await postBookReview(id, {
        rating: overall,
        comment: body.trim(),
        plot_rating: plot,
        style_rating: style,
        tech_rating: tech,
      });
      navigate(`/stories/${id}/reviews`);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  if (!book && !error) return <div className="container page">Loading…</div>;
  const cover = resolveAssetUrl(book?.cover_path || "");

  return (
    <div className="review-page">
      <div
        className="story-hero story-hero--sm"
        style={{
          backgroundImage: cover
            ? `linear-gradient(180deg, rgba(11,10,18,0.25), rgba(11,10,18,0.96) 82%), url(${cover})`
            : undefined,
        }}
      >
        <div className="story-hero-inner">
          {cover && <img className="story-hero-cover" src={cover} alt="" />}
        </div>
      </div>
      <div className="container page review-layout">
        <aside className="review-guidelines">
          <h2>Review guidelines</h2>
          <ul>
            <li>
              <strong>Give us details:</strong> Specific feedback on plot, characters, structure.
            </li>
            <li>
              <strong>Be constructive:</strong> Offer ideas to help improve the story.
            </li>
            <li>
              <strong>Be a kind critic:</strong> Disagree thoughtfully and respectfully.
            </li>
            <li>
              <strong>Focus on the story:</strong> No spam or unrelated content.
            </li>
          </ul>
        </aside>
        <form className="review-form" onSubmit={onSubmit}>
          <h1>My Review</h1>
          {error && <div className="error-banner">{error}</div>}
          <StarRow label="How do you rate this story overall?" value={overall} onChange={setOverall} />
          <StarRow label="How do you rate the plot of this story?" value={plot} onChange={setPlot} />
          <StarRow label="How do you rate the author’s writing style?" value={style} onChange={setStyle} />
          <StarRow
            label="How do you rate the author’s technical writing skills?"
            value={tech}
            onChange={setTech}
          />
          <label>
            Write your review here (required)
            <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} required />
          </label>
          <div className="form-actions">
            <Link className="btn" to={`/stories/${id}`}>
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary" disabled={busy || guest}>
              {busy ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
