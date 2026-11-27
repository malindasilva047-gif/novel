(() => {
  const nav = document.querySelector(".nav-links");
  const link = nav?.querySelector("a");
  const heading = nav?.querySelector(".mobile-nav-heading");
  const backdrop = document.querySelector(".nav-backdrop");
  const info = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      color: cs.color, bg: cs.backgroundColor, filter: cs.filter,
      backdrop: cs.backdropFilter, opacity: cs.opacity, z: cs.zIndex,
      fill: cs.webkitTextFillColor, border: cs.borderColor,
    };
  };
  const out = { nav: info(nav), link: info(link), heading: info(heading), backdrop: info(backdrop) };
  backdrop?.remove();
  const blur = document.getElementById("tmp-unblur");
  if (!blur) {
    const style = document.createElement("style");
    style.id = "tmp-unblur";
    style.textContent = "* { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }";
    document.head.appendChild(style);
  }
  return out;
})()
