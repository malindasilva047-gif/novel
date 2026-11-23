import { useEffect, useRef, useState } from "react";
import "./GuestLandingPage.css";

/**
 * Guest homepage iframe.
 * Height is expanded to full content so only the PARENT page scrolls (one scrollbar).
 */
export default function GuestLandingPage() {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState("100vh");

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return undefined;

    function applyHeight(px) {
      const h = Math.max(Number(px) || 0, window.innerHeight || 800);
      // +2 avoids sub-pixel iframe scrollbar
      setHeight(`${h + 2}px`);
    }

    function resizeFromDoc() {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        // Prefer body scrollHeight; force layout
        const body = doc.body;
        const htmlEl = doc.documentElement;
        if (body) {
          body.style.overflow = "hidden";
          htmlEl.style.overflow = "hidden";
        }
        const h = Math.max(
          body?.scrollHeight || 0,
          htmlEl?.scrollHeight || 0,
          body?.offsetHeight || 0,
          htmlEl?.offsetHeight || 0,
          800,
        );
        applyHeight(h);
      } catch {
        /* ignore */
      }
    }

    function onMessage(e) {
      if (e?.data?.type === "guest-landing-height" && e.data.height) {
        applyHeight(e.data.height);
      }
    }

    function onLoad() {
      resizeFromDoc();
      const timers = [300, 800, 1600, 3200].map((ms) => window.setTimeout(resizeFromDoc, ms));
      iframe._glTimers = timers;
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          const ro = new ResizeObserver(() => resizeFromDoc());
          ro.observe(doc.body);
          iframe._glRo = ro;
        }
      } catch {
        /* ignore */
      }
    }

    iframe.addEventListener("load", onLoad);
    window.addEventListener("resize", resizeFromDoc);
    window.addEventListener("message", onMessage);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.removeEventListener("resize", resizeFromDoc);
      window.removeEventListener("message", onMessage);
      (iframe._glTimers || []).forEach((id) => window.clearTimeout(id));
      try {
        iframe._glRo?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return (
    <iframe
      ref={iframeRef}
      className="guest-landing-frame"
      title="Wingsaga — Stories worth staying up for"
      src="/guest-landing.html"
      scrolling="no"
      style={{ height }}
    />
  );
}
