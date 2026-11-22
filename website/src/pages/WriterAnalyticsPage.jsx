import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getWriterAnalytics, resolveAssetUrl } from "../api";

const PERIODS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "365d", label: "1 year" },
];

const METRICS = [
  ["views", "Story views"],
  ["reads", "Story reads"],
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["followers", "Followers"],
  ["published_stories", "Published stories"],
  ["published_chapters", "Published chapters"],
];
const COMPARISON_METRICS = [
  ["views", "Views"],
  ["reads", "Reads"],
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["follows", "Followers"],
];

function number(value) {
  return Number(value || 0).toLocaleString();
}

function isPublished(story) {
  return /published|ongoing|completed/i.test(String(story.status || ""));
}

function bucketDate(date, granularity) {
  const value = new Date(`${date}T00:00:00Z`);
  if (granularity === "weekly") {
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
    return value.toISOString().slice(0, 10);
  }
  if (granularity === "monthly") return date.slice(0, 7);
  if (granularity === "yearly") return date.slice(0, 4);
  return date;
}

function TrendChart({ series, keys, title, days, granularity }) {
  const chartData = useMemo(() => {
    const today = new Date();
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days + 1);
    const bucketStarts = [];
    if (granularity === "weekly") {
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 7)) {
        bucketStarts.push(new Date(date));
      }
    } else if (granularity === "monthly") {
      const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      while (date <= end) {
        bucketStarts.push(new Date(date));
        date.setUTCMonth(date.getUTCMonth() + 1);
      }
    } else if (granularity === "yearly") {
      const date = new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
      while (date <= end) {
        bucketStarts.push(new Date(date));
        date.setUTCFullYear(date.getUTCFullYear() + 1);
      }
    } else {
      for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
        bucketStarts.push(new Date(date));
      }
    }

    const valuesByBucket = new Map();
    for (const item of series) {
      const key = bucketDate(item.date, granularity);
      const values = valuesByBucket.get(key) || Object.fromEntries(keys.map((metric) => [metric, 0]));
      keys.forEach((metric) => { values[metric] += Number(item[metric] || 0); });
      valuesByBucket.set(key, values);
    }
    return bucketStarts.map((date) => {
      const rawDate = date.toISOString().slice(0, 10);
      const key = bucketDate(rawDate, granularity);
      const values = valuesByBucket.get(key) || {};
      return {
        date: key,
        label: granularity === "monthly"
          ? date.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" })
          : granularity === "yearly"
            ? key
            : rawDate,
        ...Object.fromEntries(keys.map((metric) => [metric, Number(values[metric] || 0)])),
      };
    });
  }, [days, granularity, keys, series]);

  const allValues = chartData.flatMap((item) => keys.map((key) => item[key]));
  const max = Math.max(0, ...allValues);
  const min = Math.min(0, ...allValues);
  const range = Math.max(1, max - min);
  const paths = keys.map((key) => {
    const points = chartData.map((item, index) => {
      const x = chartData.length <= 1 ? 400 : (index / (chartData.length - 1)) * 780 + 10;
      const y = 20 + ((max - item[key]) / range) * 190;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { key, points: points.join(" ") };
  });

  return (
    <section className="analytics-chart-card">
      <header><h3>{title}</h3><span>{PERIODS.find((item) => item.value === `${days}d`)?.label || "Selected period"} · {granularity}</span></header>
      <svg viewBox="0 0 800 240" role="img" aria-label={`${title} over the selected period`}>
        {[0, 1, 2, 3].map((line) => <line key={line} x1="10" x2="790" y1={20 + line * 63} y2={20 + line * 63} className="analytics-grid-line" />)}
        {paths.map(({ key, points }) => (
          <polyline key={key} points={points} className={`analytics-line analytics-line-${key}`} />
        ))}
      </svg>
      <div className="analytics-chart-legend">
        {keys.map((key) => <span className={`analytics-legend-${key}`} key={key}>{key[0].toUpperCase() + key.slice(1)}</span>)}
      </div>
      <div className="analytics-chart-range">
        <span>{chartData[0]?.label || ""}</span><span>{chartData.at(-1)?.label || ""}</span>
      </div>
    </section>
  );
}

export default function WriterAnalyticsPage({ user }) {
  const [period, setPeriod] = useState("30d");
  const [granularity, setGranularity] = useState("daily");
  const [section, setSection] = useState("overview");
  const [stories, setStories] = useState([]);
  const [overview, setOverview] = useState({});
  const [comparison, setComparison] = useState({ current: {}, previous: {} });
  const [series, setSeries] = useState([]);
  const [selectedStoryId, setSelectedStoryId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("views");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getWriterAnalytics(period)
      .then((response) => {
        if (!active) return;
        setOverview(response?.overview || {});
        setComparison(response?.comparison || { current: {}, previous: {} });
        setStories(Array.isArray(response?.stories) ? response.stories : []);
        setSeries(Array.isArray(response?.series) ? response.series : []);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Analytics could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [period, retryKey, user?.id, user?.user_id]);

  const days = Number.parseInt(period, 10) || 30;
  const filteredStories = useMemo(() => stories
    .filter((story) => statusFilter === "all" || (statusFilter === "published" ? isPublished(story) : !isPublished(story)))
    .sort((a, b) => Number(b[sortBy] || 0) - Number(a[sortBy] || 0)), [sortBy, statusFilter, stories]);
  const selectedStory = stories.find((story) => String(story.id) === String(selectedStoryId));

  return (
    <main className="writer-analytics-page">
      <header className="writer-analytics-header">
        <div>
          <span className="writer-analytics-eyebrow">YOUR WRITING PERFORMANCE</span>
          <h1>Writer analytics</h1>
          <p>Understand how readers find and engage with your stories.</p>
        </div>
        <Link className="btn btn-ghost" to="/write">Back to Writing Desk</Link>
      </header>

      <nav className="writer-analytics-tabs" aria-label="Analytics sections">
        <button type="button" className={section === "overview" ? "active" : ""} onClick={() => setSection("overview")}>Overview</button>
        <button type="button" className={section === "stories" ? "active" : ""} onClick={() => setSection("stories")}>Stories</button>
      </nav>

      {section === "overview" ? (
        <>
          <div className="writer-analytics-toolbar">
            <p>Combined performance across your stories</p>
            <label>
              Date range
              <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                {PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>
              Group by
              <select value={granularity} onChange={(event) => setGranularity(event.target.value)}>
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
              </select>
            </label>
          </div>
          {loading ? <div className="writer-analytics-state" role="status">Loading your analytics…</div> : null}
          {error ? <div className="writer-analytics-state error" role="alert">{error} <button type="button" onClick={() => setRetryKey((current) => current + 1)}>Retry</button></div> : null}
          {!loading && !error ? (
            <>
              <section className="writer-analytics-stats" aria-label="Writing statistics">
                {METRICS.map(([key, label]) => (
                  <article className="writer-analytics-stat" key={key}>
                    <span>{label}</span><strong>{number(overview[key])}</strong>
                  </article>
                ))}
              </section>
              <section className="writer-analytics-comparison" aria-label="Compare activity to the previous period">
                <header><h3>Activity vs previous {PERIODS.find((item) => item.value === period)?.label}</h3><span>Tracked events</span></header>
                <div>
                  {COMPARISON_METRICS.map(([key, label]) => {
                    const current = Number(comparison.current?.[key] || 0);
                    const previous = Number(comparison.previous?.[key] || 0);
                    const change = current - previous;
                    const percentage = previous
                      ? Math.round((change / previous) * 100)
                      : current > 0 ? 100 : current < 0 ? -100 : 0;
                    return (
                      <article key={key}>
                        <span>{label}</span>
                        <strong>{number(current)}</strong>
                        <small className={change > 0 ? "positive" : change < 0 ? "negative" : ""}>
                          {change > 0 ? "+" : ""}{number(change)} ({percentage > 0 ? "+" : ""}{percentage}%)
                        </small>
                      </article>
                    );
                  })}
                </div>
              </section>
              <div className="writer-analytics-charts">
                <TrendChart series={series} keys={["views", "reads"]} title="Views and reads" days={days} granularity={granularity} />
                <TrendChart series={series} keys={["likes", "comments", "follows"]} title="Engagement and follower growth" days={days} granularity={granularity} />
              </div>
              <p className="writer-analytics-note">Views use the platform’s lifetime story-view counters. Daily trends and reads are tracked from this release onward and count each reader/story/chapter once per day.</p>
            </>
          ) : null}
        </>
      ) : (
        <>
          <div className="writer-analytics-toolbar">
            <p>Compare the performance of each story</p>
            <div className="writer-analytics-filters">
              <label>Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All stories</option><option value="published">Published</option><option value="draft">Drafts</option>
                </select>
              </label>
              <label>Sort by
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  {["views", "reads", "likes", "comments"].map((key) => <option value={key} key={key}>{key[0].toUpperCase() + key.slice(1)}</option>)}
                </select>
              </label>
            </div>
          </div>
          {loading ? <div className="writer-analytics-state" role="status">Loading your stories…</div> : null}
          {error ? <div className="writer-analytics-state error" role="alert">{error} <button type="button" onClick={() => setRetryKey((current) => current + 1)}>Retry</button></div> : null}
          {!loading && !error && !filteredStories.length ? (
            <div className="writer-analytics-state">Your stories and their analytics will appear here.</div>
          ) : null}
          <section className="writer-analytics-story-list">
            {filteredStories.map((story) => (
              <button
                className={`writer-analytics-story${String(selectedStoryId) === String(story.id) ? " selected" : ""}`}
                key={story.id}
                type="button"
                onClick={() => setSelectedStoryId((current) => String(current) === String(story.id) ? null : story.id)}
                aria-expanded={String(selectedStoryId) === String(story.id)}
              >
                {story.cover_path
                  ? <img src={resolveAssetUrl(story.cover_path)} alt="" loading="lazy" />
                  : <span className="writer-analytics-story-fallback">{String(story.title || "S").slice(0, 1)}</span>}
                <span className="writer-analytics-story-main">
                  <strong>{story.title}</strong><small>{isPublished(story) ? "Published" : "Draft"} · {number(story.published_chapters)} published chapters</small>
                </span>
                <span className="writer-analytics-story-metrics">
                  <span>{number(story.views)} views</span><span>{number(story.reads)} reads</span><span>{number(story.likes)} likes</span><span>{number(story.comments)} comments</span>
                </span>
              </button>
            ))}
          </section>
          {selectedStory ? (
            <>
              <section className="writer-analytics-charts writer-analytics-story-charts">
                <TrendChart series={selectedStory.series || []} keys={["views", "reads"]} title={`${selectedStory.title}: views and reads`} days={days} granularity={granularity} />
                <TrendChart series={selectedStory.series || []} keys={["likes", "comments"]} title="Story engagement" days={days} granularity={granularity} />
              </section>
              <section className="writer-analytics-detail">
                <header><h2>{selectedStory.title} — chapter performance</h2><span>{PERIODS.find((item) => item.value === period)?.label}</span></header>
                <div className="writer-analytics-chapter-table">
                  <div className="writer-analytics-chapter-row heading"><span>Chapter</span><span>Views</span><span>Reads</span><span>Likes</span><span>Comments</span></div>
                  {selectedStory.chapters?.length ? selectedStory.chapters.map((chapter) => (
                    <div className="writer-analytics-chapter-row" key={`${selectedStory.id}-${chapter.chapter_number}`}>
                      <span>{chapter.title || `Chapter ${chapter.chapter_number}`}</span><span>{number(chapter.views)}</span><span>{number(chapter.reads)}</span><span>{number(chapter.likes)}</span><span>{number(chapter.comments)}</span>
                    </div>
                  )) : <p>No chapter activity has been recorded yet.</p>}
                </div>
              </section>
            </>
          ) : null}
          <p className="writer-analytics-note">Daily activity uses privacy-preserving, per-reader counters. New activity is collected from both web and app progress requests without changing the app API responses.</p>
        </>
      )}
    </main>
  );
}
