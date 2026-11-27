(() => {
  const slot = document.querySelector(".library-completed-slot");
  const card = slot?.querySelector(".book-card");
  const grid = document.querySelector(".library-completed-grid");
  const info = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { cls: el.className, w: r.width, h: r.height, display: cs.display, gridCols: cs.gridTemplateColumns, width: cs.width, maxWidth: cs.maxWidth, minHeight: cs.minHeight, height: cs.height, align: cs.alignItems, justify: cs.justifyContent, flexDir: cs.flexDirection, bg: cs.backgroundColor };
  };
  return { grid: info(grid), slot: info(slot), card: info(card), cardTag: card?.tagName };
})()
