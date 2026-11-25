import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const AUTO_MS = 5000;

export default function ImageCarousel({ slides, label, className = "", showCaptions = true, autoPlay = true, intervalMs = AUTO_MS }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slideCount = slides?.length || 0;
  const timerRef = useRef(null);

  function moveSlide(direction) {
    if (!slideCount) return;
    setActiveIndex((index) => (index + direction + slideCount) % slideCount);
  }

  function goTo(index) {
    if (!slideCount) return;
    setActiveIndex(((index % slideCount) + slideCount) % slideCount);
  }

  useEffect(() => {
    if (!autoPlay || paused || slideCount < 2) return undefined;
    timerRef.current = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % slideCount);
    }, Math.max(2000, Number(intervalMs) || AUTO_MS));
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [autoPlay, paused, slideCount, intervalMs, activeIndex]);

  if (!slideCount) return null;

  return (
    <div
      className={`image-carousel ${className}`}
      role="region"
      aria-label={label}
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <div className="image-carousel-track" aria-live="polite">
        {slides.map((slide, index) => (
          <div
            className={`image-carousel-slide${activeIndex === index ? " active" : ""}`}
            key={slide.image || `${slide.title}-${index}`}
            aria-hidden={activeIndex !== index}
          >
            <img
              src={slide.image}
              alt={`${slide.genre || ""}: ${slide.title || "Featured"}`.trim()}
              loading={activeIndex === index ? "eager" : "lazy"}
              fetchPriority={activeIndex === index ? "high" : "auto"}
            />
            <div className="image-carousel-shade" />
            {showCaptions ? (
              <div className="image-carousel-copy">
                <span>{slide.kicker || slide.genre}</span>
                <h2>{slide.title}</h2>
                <p>{slide.description}</p>
                {slide.to && slide.linkLabel ? (
                  <Link to={slide.to} tabIndex={activeIndex === index ? 0 : -1}>
                    {slide.linkLabel} <span aria-hidden="true">→</span>
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="image-carousel-controls" aria-label="Choose slide">
        <button type="button" className="image-carousel-arrow" aria-label="Previous slide" onClick={() => moveSlide(-1)}>
          <span aria-hidden="true">‹</span>
        </button>
        <div className="image-carousel-dots">
          {slides.map((slide, index) => (
            <button
              type="button"
              key={slide.image || index}
              className={activeIndex === index ? "active" : ""}
              aria-label={`Show slide ${index + 1}: ${slide.genre || slide.title || index + 1}`}
              aria-current={activeIndex === index ? "true" : undefined}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
        <button type="button" className="image-carousel-arrow" aria-label="Next slide" onClick={() => moveSlide(1)}>
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}
