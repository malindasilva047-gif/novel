(() => {
  const pick = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      cls: el.className, tag: el.tagName, position: cs.position,
      top: cs.top, bottom: cs.bottom, left: cs.left, right: cs.right,
      height: cs.height, maxHeight: cs.maxHeight, minHeight: cs.minHeight,
      width: cs.width, overflowY: cs.overflowY, paddingTop: cs.paddingTop,
      transform: cs.transform, backdropFilter: cs.backdropFilter,
      filter: cs.filter, contain: cs.contain, willChange: cs.willChange,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    };
  };
  const nav = document.querySelector("#primary-navigation");
  const chain = [];
  let node = nav?.parentElement;
  while (node && node !== document.documentElement) {
    chain.push(pick(node));
    node = node.parentElement;
  }
  return { nav: pick(nav), chain };
})()
