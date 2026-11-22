import { Children, useEffect, useRef, useState } from "react";

export default function ArrowCarousel({
  children,
  className = "",
  itemClassName = "",
  label,
  previousLabel = `Previous ${label}`,
  nextLabel = `Next ${label}`,
  edgeGlow = false,
  stepByItem = false,
  carouselClassName = "",
  deferUntilVisible = false,
  deferHeight = 260,
}) {
  const carouselRef = useRef(null);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const [hasEntered, setHasEntered] = useState(!deferUntilVisible);
  const [offset, setOffset] = useState(0);
  const [maxOffset, setMaxOffset] = useState(0);
  const itemCount = Children.count(children);

  useEffect(() => {
    if (!deferUntilVisible || hasEntered) return undefined;
    const carousel = carouselRef.current;
    if (!carousel) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setHasEntered(true);
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setHasEntered(true);
        observer.disconnect();
      }
    }, { rootMargin: "500px 0px" });
    observer.observe(carousel);
    return () => observer.disconnect();
  }, [deferUntilVisible, hasEntered]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport) return undefined;
    if (!track) {
      setMaxOffset(0);
      return undefined;
    }

    const updateBounds = () => {
      const nextMax = Math.max(0, track.scrollWidth - viewport.clientWidth);
      setMaxOffset(nextMax);
      setOffset((current) => Math.min(current, nextMax));
    };

    updateBounds();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateBounds);
    observer?.observe(viewport);
    observer?.observe(track);
    window.addEventListener("resize", updateBounds);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, [hasEntered, itemCount]);

  function move(direction) {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const firstItem = track.querySelector(".arrow-carousel-item");
    const trackStyles = window.getComputedStyle(track);
    const gap = Number.parseFloat(trackStyles.columnGap || trackStyles.gap) || 0;
    const step = stepByItem && firstItem
      ? firstItem.getBoundingClientRect().width + gap
      : Math.max(180, viewport.clientWidth * 0.8);
    setOffset((current) => Math.max(0, Math.min(maxOffset, current + direction * step)));
  }

  function keepFocusedItemVisible(event) {
    const viewport = viewportRef.current;
    const item = event.target.closest(".arrow-carousel-item");
    if (!viewport || !item) return;
    const viewportRect = viewport.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.right > viewportRect.right) {
      setOffset((current) => Math.min(maxOffset, current + itemRect.right - viewportRect.right));
    } else if (itemRect.left < viewportRect.left) {
      setOffset((current) => Math.max(0, current - (viewportRect.left - itemRect.left)));
    }
  }

  return (
    <div
      ref={carouselRef}
      className={`arrow-carousel${edgeGlow ? " arrow-carousel--glass-edges" : ""}${carouselClassName ? ` ${carouselClassName}` : ""}`}
      role="region"
      aria-label={label}
      aria-roledescription="carousel"
    >
      {edgeGlow && maxOffset > 0 ? (
        <>
          <div className="arrow-carousel-edge-glow arrow-carousel-edge-glow--previous" aria-hidden="true" />
          <div className="arrow-carousel-edge-glow arrow-carousel-edge-glow--next" aria-hidden="true" />
        </>
      ) : null}
      {maxOffset > 0 ? (
        <button
          type="button"
          className="arrow-carousel-control arrow-carousel-control--previous"
          aria-label={previousLabel}
          disabled={offset <= 0}
          onClick={() => move(-1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m14.5 5-7 7 7 7" />
          </svg>
        </button>
      ) : null}
      <div className="arrow-carousel-viewport" ref={viewportRef} onFocusCapture={keepFocusedItemVisible}>
        {hasEntered ? (
          <div
            className={`arrow-carousel-track ${className}`.trim()}
            ref={trackRef}
            style={{ transform: `translate3d(-${offset}px, 0, 0)` }}
          >
            {Children.map(children, (child) => (
              <div className={`arrow-carousel-item ${itemClassName}`.trim()}>
                {child}
              </div>
            ))}
          </div>
        ) : (
          <div className="arrow-carousel-placeholder" style={{ minHeight: `${deferHeight}px` }} aria-hidden="true" />
        )}
      </div>
      {maxOffset > 0 ? (
        <button
          type="button"
          className="arrow-carousel-control arrow-carousel-control--next"
          aria-label={nextLabel}
          disabled={offset >= maxOffset}
          onClick={() => move(1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m9.5 5 7 7-7 7" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
