import { resolveAssetUrl } from "../api";

function ListCard({ list }) {
  const covers = (Array.isArray(list.covers) ? list.covers : [])
    .map((cover) => typeof cover === "string" ? cover : cover?.cover_path || cover?.coverPath || "")
    .filter(Boolean)
    .slice(0, 3);
  if (!covers.length && list.cover_path) covers.push(list.cover_path);
  while (covers.length > 0 && covers.length < 3) covers.push(covers[covers.length - 1]);
  const storyCount = Number(list.story_count || 0);
  return (
    <article className="rl-card" aria-label={`${list.name}, ${storyCount} stories`}>
      <div className="rl-stack" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => {
          const src = covers[i] ? resolveAssetUrl(covers[i]) : "";
          return (
            <div key={i} className={`rl-cover rl-cover-${i}`}>
              {src ? (
                <img src={src} alt="" />
              ) : (
                <div className="rl-cover-empty" />
              )}
            </div>
          );
        })}
      </div>
      <div className="rl-meta">
        <h3 className="rl-name">{list.name}</h3>
        <p className="rl-count">{storyCount} {storyCount === 1 ? "story" : "stories"}</p>
      </div>
    </article>
  );
}

export default function ReadingListsRow({ lists = [] }) {
  const display = Array.isArray(lists) ? lists.filter((list) => Number(list?.story_count || 0) > 0) : [];
  if (!display.length) return null;

  return (
    <section className="rl-section full-bleed">
      <div className="full-bleed-inner">
      <div className="rl-header">
        <h2 className="rl-title">Community Reading Lists</h2>
      </div>
      <div className="rl-track">
        {display.map((list) => (
          <ListCard key={list.id || list.name} list={list} />
        ))}
      </div>
      </div>
    </section>
  );
}
