(() => {
  const out = [];
  document.querySelectorAll(".library-tabs .profile-tab").forEach((el) => {
    const cs = getComputedStyle(el);
    out.push({ cls: el.className, text: el.textContent.trim().slice(0, 24), bg: cs.backgroundImage, bgc: cs.backgroundColor, color: cs.color, fill: cs.webkitTextFillColor, border: cs.borderBottomColor, shadow: cs.boxShadow });
  });
  return out;
})()
