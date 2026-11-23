import { useEffect, useRef, useState } from "react";
import "./GuestLandingPage.css";

/**
 * Guest homepage iframe.
 * Height tracks real content bottom so the App footer sits tight under the page.
 */
export default function GuestLandingPage() {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState("100vh");

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return undefined;

    function measureContentHeight(doc) {
      const body = doc.body;
      const htmlEl = doc.documentElement;
      if (!body) return 0;

      // Prefer the bottom edge of the last visible content node (skip scripts).
      let bottom = 0;
      const nodes = body.children;
      for (let i = 0; i < nodes.length; i += 1) {
        const el = nodes[i];
        if (!el || el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
        const style = doc.defaultView?.getComputedStyle?.(el);
        if (style && (style.display === "none" || style.visibility === "hidden")) continue;
        const rect = el.getBoundingClientRect();
        const top = rect.top + (doc.defaultView?.scrollY || htmlEl.scrollTop || 0);
        bottom = Math.max(bottom, top + rect.height);
      }

      // Fallback to classic metrics if measurement failed.
      const fallback = Math.max(
        body.scrollHeight || 0,
        htmlEl.scrollHeight || 0,
        body.offsetHeight || 0,
        800,
      );
      return Math.ceil(bottom > 0 ? bottom : fallback);
    }

    function applyHeight(px) {
      const h = Math.max(Number(px) || 0, 600);
      setHeight(`${h}px`);
    }

    function resizeFromDoc() {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        const body = doc.body;
        const htmlEl = doc.documentElement;
        if (body) {
          body.style.overflow = "hidden";
          body.style.marginBottom = "0";
          body.style.paddingBottom = "0";
        }
        if (htmlEl) {
          htmlEl.style.overflow = "hidden";
          htmlEl.style.marginBottom = "0";
          htmlEl.style.paddingBottom = "0";
        }
        applyHeight(measureContentHeight(doc));
      } catch {
        /* ignore */
      }
    }

    function onMessage(e) {
      if (e?.data?.type === "guest-landing-height" && e.data.height) {
        // Trust postMessage but clamp to measured DOM when available.
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc?.body) {
            applyHeight(Math.min(Number(e.data.height), measureContentHeight(doc) + 8));
            return;
          }
        } catch {
          /* fall through */
        }
        applyHeight(e.data.height);
      }
    }

    function onLoad() {
      resizeFromDoc();
      const timers = [200, 600, 1200, 2400].map((ms) => window.setTimeout(resizeFromDoc, ms));
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
      src="/guest-landing.html?v=20261123-gap1"
      scrolling="no"
      style={{ height }}
    />
  );
}
