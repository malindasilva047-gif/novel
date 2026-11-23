import { useEffect, useRef, useState } from "react";
import "./GuestLandingPage.css";

/**
 * Guest homepage — exact marketing HTML as a same-origin document.
 * All sections + animations match the reference (real :root/body, not Shadow DOM).
 */
export default function GuestLandingPage() {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState("100vh");

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return undefined;

    function resize() {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        const h = Math.max(
          doc.body?.scrollHeight || 0,
          doc.documentElement?.scrollHeight || 0,
          doc.body?.offsetHeight || 0,
          800,
        );
        setHeight(`${h}px`);
      } catch {
        /* ignore */
      }
    }

    function onLoad() {
      resize();
      const timers = [400, 1200, 3000].map((ms) => window.setTimeout(resize, ms));
      iframe._glTimers = timers;
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          const ro = new ResizeObserver(resize);
          ro.observe(doc.body);
          iframe._glRo = ro;
        }
      } catch {
        /* ignore */
      }
    }

    iframe.addEventListener("load", onLoad);
    window.addEventListener("resize", resize);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.removeEventListener("resize", resize);
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
      style={{ height }}
    />
  );
}
