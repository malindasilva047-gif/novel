import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { showToast } from "./ToastViewport";

function clampOffset(value, imageSize, viewportSize) {
  return Math.min(0, Math.max(viewportSize - imageSize, value));
}

export default function ImageAdjustModal({ file, aspectRatio = 1, shape = "square", title, onCancel, onSave }) {
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const pointerRef = useRef(null);
  const [imageSize, setImageSize] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      const message = "This image could not be opened. Choose another image.";
      setError(message);
      showToast(message, "error");
    };
    image.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    if (!stageRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStageSize({ width, height });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  const baseScale = imageSize && stageSize.width && stageSize.height
    ? Math.max(stageSize.width / imageSize.width, stageSize.height / imageSize.height)
    : 1;
  const renderedWidth = (imageSize?.width || 0) * baseScale * zoom;
  const renderedHeight = (imageSize?.height || 0) * baseScale * zoom;

  function updateZoom(value) {
    const nextZoom = Number(value);
    const centerX = stageSize.width / 2;
    const centerY = stageSize.height / 2;
    const imagePointX = (centerX - offset.x) / (baseScale * zoom);
    const imagePointY = (centerY - offset.y) / (baseScale * zoom);
    const nextWidth = (imageSize?.width || 0) * baseScale * nextZoom;
    const nextHeight = (imageSize?.height || 0) * baseScale * nextZoom;
    setZoom(nextZoom);
    setOffset({
      x: clampOffset(centerX - imagePointX * baseScale * nextZoom, nextWidth, stageSize.width),
      y: clampOffset(centerY - imagePointY * baseScale * nextZoom, nextHeight, stageSize.height),
    });
  }

  function onPointerDown(event) {
    pointerRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    const start = pointerRef.current;
    if (!start) return;
    setOffset({
      x: clampOffset(start.offsetX + event.clientX - start.x, renderedWidth, stageSize.width),
      y: clampOffset(start.offsetY + event.clientY - start.y, renderedHeight, stageSize.height),
    });
  }

  async function saveCrop() {
    const image = imageRef.current;
    if (!image || !stageSize.width || !stageSize.height) return;
    setSaving(true);
    setError("");
    try {
      const scale = baseScale * zoom;
      const sourceX = Math.max(0, -offset.x / scale);
      const sourceY = Math.max(0, -offset.y / scale);
      const sourceWidth = Math.min(image.naturalWidth - sourceX, stageSize.width / scale);
      const sourceHeight = Math.min(image.naturalHeight - sourceY, stageSize.height / scale);
      const outputScale = Math.min(1, 2048 / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * outputScale));
      canvas.height = Math.max(1, Math.round(sourceHeight * outputScale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image editing is not available in this browser.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error("The adjusted image could not be saved.")), "image/jpeg", 0.92);
      });
      const name = file.name.replace(/\.[^.]+$/, "") || "image";
      await onSave(new File([blob], `${name}-adjusted.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "The image could not be saved.";
      setError(message);
      showToast(message, "error");
      setSaving(false);
    }
  }

  return createPortal(
    <div className="image-adjust-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel(); }}>
      <section className="image-adjust-dialog" role="dialog" aria-modal="true" aria-labelledby="image-adjust-title">
        <header>
          <div><span className="eyebrow">IMAGE ADJUSTMENT</span><h2 id="image-adjust-title">{title || "Adjust your image"}</h2></div>
          <button type="button" aria-label="Cancel image adjustment" onClick={onCancel} disabled={saving}>×</button>
        </header>
        <p className="image-adjust-hint">Drag to reposition. Use the slider to zoom in or out.</p>
        <div
          ref={stageRef}
          className={`image-adjust-stage image-adjust-stage--${shape}`}
          style={{ aspectRatio }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { pointerRef.current = null; }}
          onPointerCancel={() => { pointerRef.current = null; }}
          role="img"
          aria-label="Image crop preview"
        >
          {imageSize ? (
            <img
              src={previewUrl}
              alt=""
              draggable="false"
              style={{ width: renderedWidth, height: renderedHeight, transform: `translate(${offset.x}px, ${offset.y}px)` }}
            />
          ) : <span className="image-adjust-loading">Opening image…</span>}
          {shape === "circle" ? <span className="image-adjust-circle-mask" aria-hidden="true" /> : null}
        </div>
        <label className="image-adjust-zoom">Zoom <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => updateZoom(event.target.value)} disabled={!imageSize || saving} /></label>
        {error ? <p className="image-adjust-error" role="alert">{error}</p> : null}
        <footer>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={saveCrop} disabled={!imageSize || saving}>{saving ? "Saving…" : "Use this image"}</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
