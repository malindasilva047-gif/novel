function isStyledLetter(char, kind) {
  const codePoint = char.codePointAt(0);
  if (kind === "bold") {
    return (codePoint >= 0x1d400 && codePoint <= 0x1d419)
      || (codePoint >= 0x1d41a && codePoint <= 0x1d433);
  }
  return (codePoint >= 0x1d434 && codePoint <= 0x1d44d)
    || (codePoint >= 0x1d44e && codePoint <= 0x1d467)
    || char === "ℎ";
}

function toStyledLetter(char, kind) {
  const codePoint = char.codePointAt(0);
  if (kind === "bold") {
    if (codePoint >= 65 && codePoint <= 90) return String.fromCodePoint(0x1d400 + codePoint - 65);
    if (codePoint >= 97 && codePoint <= 122) return String.fromCodePoint(0x1d41a + codePoint - 97);
  } else {
    if (codePoint >= 65 && codePoint <= 90) return String.fromCodePoint(0x1d434 + codePoint - 65);
    if (codePoint >= 97 && codePoint <= 122) return codePoint === 104 ? "ℎ" : String.fromCodePoint(0x1d44e + codePoint - 97);
  }
  return char;
}

function toPlainLetter(char, kind) {
  const codePoint = char.codePointAt(0);
  if (kind === "bold") {
    if (codePoint >= 0x1d400 && codePoint <= 0x1d419) return String.fromCodePoint(65 + codePoint - 0x1d400);
    if (codePoint >= 0x1d41a && codePoint <= 0x1d433) return String.fromCodePoint(97 + codePoint - 0x1d41a);
  } else {
    if (codePoint >= 0x1d434 && codePoint <= 0x1d44d) return String.fromCodePoint(65 + codePoint - 0x1d434);
    if (codePoint >= 0x1d44e && codePoint <= 0x1d467) return String.fromCodePoint(97 + codePoint - 0x1d44e);
    if (char === "ℎ") return "h";
  }
  return char;
}

export function formatSelectedText(text, kind) {
  if (kind === "underline") {
    const characters = Array.from(text.matchAll(/(?:\P{M}\p{M}*|\p{M})/gu), ([char]) => char);
    const visibleCharacters = characters.filter((char) => char.trim() && !/^\p{M}+$/u.test(char));
    const alreadyUnderlined = visibleCharacters.length > 0
      && visibleCharacters.every((char) => char.endsWith("\u0332"));
    return characters.map((char) => alreadyUnderlined
      ? char.replace(/\u0332+$/u, "")
      : `${char.replace(/\u0332+$/u, "")}\u0332`).join("");
  }

  const characters = Array.from(text);
  const letters = characters.filter((char) => /[A-Za-z]/u.test(char) || isStyledLetter(char, kind));
  const alreadyStyled = letters.length > 0 && letters.every((char) => isStyledLetter(char, kind));
  return characters.map((char) => alreadyStyled
    ? toPlainLetter(char, kind)
    : toStyledLetter(char, kind)).join("");
}
