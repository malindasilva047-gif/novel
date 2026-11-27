(() => {
  const sels = [
    ".library-saved-library",
    ".library-saved-heading h2",
    ".library-saved-heading .eyebrow",
    ".library-saved-actions > span",
    ".library-create-list-button",
    ".library-tabs",
    ".library-tabs .profile-tab",
    ".library-tabs .profile-tab.active",
    ".continue-reading-card",
    ".continue-reading-title",
    ".continue-reading-author",
    ".continue-reading-progress button",
    ".continue-reading-meter",
    ".library-card-menu summary",
    ".library-empty",
    ".library-empty h2",
    ".library-cinematic-hero",
    ".library-cinematic-copy h1",
    ".library-cinematic-copy p",
    ".library-featured-button",
    ".library-cinematic-secondary",
    ".library-notice",
    ".library-tab-icon",
  ];
  return sels.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const cs = getComputedStyle(el);
    return { sel, color: cs.color, fill: cs.webkitTextFillColor, bg: cs.backgroundColor, border: cs.borderColor, filter: cs.filter };
  });
})()
