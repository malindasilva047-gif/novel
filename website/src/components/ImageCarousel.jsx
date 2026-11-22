import { useState } from "react";
import { Link } from "react-router-dom";

export default function ImageCarousel({ slides, label, className = "", showCaptions = true }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const slideCount = slides.length;

  function moveSlide(direction) {
    setActiveIndex((index) => (index + direction + slideCount) % slideCount);
  }

  if (!slideCount) return null;

  return (
    <div
      className={`image-carousel ${className}`}
      role="region"
      aria-label={label}
      aria-roledescription="carousel"
    >
      <div className="image-carousel-track" aria-live="polite">
        {slides.map((slide, index) => (
          <div className={`image-carousel-slide${activeIndex === index ? " active" : ""}`} key={slide.image} aria-hidden={activeIndex !== index}>
            <img src={slide.image} alt={`${slide.genre}: ${slide.title}`} loading={activeIndex === index ? "eager" : "lazy"} fetchpriority={activeIndex === index ? "high" : "auto"} />
            <div className="image-carousel-shade" />
            {showCaptions ? (
              <div className="image-carousel-copy">
                <span>{slide.kicker || slide.genre}</span>
                <h2>{slide.title}</h2>
                <p>{slide.description}</p>
                {slide.to && slide.linkLabel ? <Link to={slide.to} tabIndex={activeIndex === index ? 0 : -1}>{slide.linkLabel} <span aria-hidden="true">→</span></Link> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="image-carousel-controls" aria-label="Choose slide">
        <button type="button" className="image-carousel-arrow" aria-label="Previous slide" onClick={() => moveSlide(-1)}><span aria-hidden="true">‹</span></button>
        <div className="image-carousel-dots">
          {slides.map((slide, index) => (
            <button type="button" key={slide.image} className={activeIndex === index ? "active" : ""} aria-label={`Show slide ${index + 1}: ${slide.genre}`} aria-current={activeIndex === index ? "true" : undefined} onClick={() => setActiveIndex(index)} />
          ))}
        </div>
        <button type="button" className="image-carousel-arrow" aria-label="Next slide" onClick={() => moveSlide(1)}><span aria-hidden="true">›</span></button>
      </div>
    </div>
  );
}