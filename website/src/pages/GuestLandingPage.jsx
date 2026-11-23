import { useEffect, useRef, useState } from "react";
import "./GuestLandingPage.css";

/**
 * Guest homepage — exact marketing HTML as same-origin document.
 * iframe posts height after real stories load so all sections stay visible.
 */
export default function GuestLandingPage() {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState("100vh");

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return undefined;

    function applyHeight(px) {
      const h = Math.max(Number(px) || 0, 800);
      setHeight(`${h}px`);
    }

    function resizeFromDoc() {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        const h = Math.max(
          doc.body?.scrollHeight || 0,
          doc.documentElement?.scrollHeight || 0,
          doc.body?.offsetHeight || 0,
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
      const timers = [500, 1500, 3500].map((ms) => window.setTimeout(resizeFromDoc, ms));
      iframe._glTimers = timers;
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          const ro = new ResizeObserver(resizeFromDoc);
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
      style={{ height }}
    />
  );
}
