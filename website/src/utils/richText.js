import { createElement } from "react";

const INLINE_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "BR", "SPAN"]);
const BLOCK_TAGS = new Set(["DIV", "P"]);

function isBlockTag(node) {
  return node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName);
}

function isDroppedTag(node) {
  return node.nodeType === Node.ELEMENT_NODE
    && ["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "MATH"].includes(node.tagName);
}

function textNode(value) {
  return { type: "text", value };
}

function decodeStyledCharacter(char) {
  const codePoint = char.codePointAt(0);
  if (codePoint >= 0x1d400 && codePoint <= 0x1d419) {
    return { type: "strong", value: String.fromCodePoint(65 + codePoint - 0x1d400) };
  }
  if (codePoint >= 0x1d41a && codePoint <= 0x1d433) {
    return { type: "strong", value: String.fromCodePoint(97 + codePoint - 0x1d41a) };
  }
  if (codePoint >= 0x1d434 && codePoint <= 0x1d44d) {
    return { type: "em", value: String.fromCodePoint(65 + codePoint - 0x1d434) };
  }
  if (codePoint >= 0x1d44e && codePoint <= 0x1d467) {
    return { type: "em", value: String.fromCodePoint(97 + codePoint - 0x1d44e) };
  }
  if (char === "ℎ") return { type: "em", value: "h" };
  return { type: "", value: char };
}

function textToAst(value) {
  const nodes = [];
  let runType = "";
  let runValue = "";
  const flushRun = () => {
    if (!runValue) return;
    nodes.push(runType ? { type: runType, children: [textNode(runValue)] } : textNode(runValue));
    runType = "";
    runValue = "";
  };
  const clusters = value.match(/(?:\P{M}\p{M}*|\p{M})/gu) || [];
  for (const cluster of clusters) {
    if (cluster.includes("\n")) {
      flushRun();
      const lines = cluster.split("\n");
      lines.forEach((line, index) => {
        if (index) nodes.push({ type: "br" });
        if (line) nodes.push(textNode(line));
      });
      continue;
    }
    const underlined = cluster.endsWith("\u0332");
    const plain = cluster.replace(/\u0332+$/u, "");
    const decoded = decodeStyledCharacter(plain);
    const type = underlined ? "u" : decoded.type;
    const content = underlined ? plain : decoded.value;
    if (type !== runType) flushRun();
    runType = type;
    runValue += content;
  }
  flushRun();
  return nodes;
}

function nodeToAst(node) {
  if (node.nodeType === Node.TEXT_NODE) return textToAst(node.nodeValue || "");
  if (node.nodeType !== Node.ELEMENT_NODE || isDroppedTag(node)) return [];
  const children = Array.from(node.childNodes).flatMap(nodeToAst);
  if (node.tagName === "BR") return [{ type: "br" }];
  if (!INLINE_TAGS.has(node.tagName)) return children;
  if (node.tagName === "SPAN") {
    const style = node.style;
    const textDecoration = `${style.textDecoration || ""} ${style.textDecorationLine || ""}`;
    const formats = [];
    if (style.fontWeight === "bold" || Number(style.fontWeight) >= 600) formats.push("strong");
    if (style.fontStyle === "italic" || style.fontStyle === "oblique") formats.push("em");
    if (/\bunderline\b/i.test(textDecoration)) formats.push("u");
    return formats.reduce((formatted, type) => [{ type, children: formatted }], children);
  }
  const type = {
    B: "strong",
    STRONG: "strong",
    I: "em",
    EM: "em",
    U: "u",
  }[node.tagName];
  return type ? [{ type, children }] : children;
}

function astText(nodes) {
  return nodes.map((node) => {
    if (node.type === "text") return node.value;
    if (node.type === "br") return "\n";
    return astText(node.children || []);
  }).join("");
}

function makeParagraph(nodes) {
  return { nodes, text: astText(nodes) };
}

export function parseRichTextParagraphs(value) {
  const source = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!source) return [];

  if (!/<[a-z][^>]*>/i.test(source)) {
    const parts = source.split(/\n\s*\n/);
    const lines = parts.length > 1 ? parts : source.split("\n");
    return lines.map((line) => makeParagraph(textToAst(line.trim()))).filter((paragraph) => paragraph.text.trim());
  }

  const document = new DOMParser().parseFromString(source, "text/html");
  const paragraphs = [];
  let inlineNodes = [];
  const flushInline = () => {
    if (inlineNodes.length) {
      paragraphs.push(makeParagraph(inlineNodes));
      inlineNodes = [];
    }
  };

  for (const node of Array.from(document.body.childNodes)) {
    if (isDroppedTag(node)) continue;
    if (isBlockTag(node)) {
      flushInline();
      const children = Array.from(node.childNodes).flatMap(nodeToAst);
      if (children.length) paragraphs.push(makeParagraph(children));
    } else {
      inlineNodes.push(...nodeToAst(node));
    }
  }
  flushInline();
  return paragraphs.filter((paragraph) => paragraph.text.trim());
}

export function renderRichTextNodes(nodes, keyPrefix = "rich-text") {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") return node.value;
    if (node.type === "br") return createElement("br", { key });
    const Tag = node.type;
    return createElement(Tag, { key }, renderRichTextNodes(node.children || [], key));
  });
}

export function sanitizeRichTextHtml(value) {
  const paragraphs = parseRichTextParagraphs(value);
  return paragraphs.map(({ nodes }) => {
    const renderNode = (node) => {
      if (node.type === "text") {
        return node.value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }
      if (node.type === "br") return "<br>";
      const tag = node.type;
      return `<${tag}>${(node.children || []).map(renderNode).join("")}</${tag}>`;
    };
    return `<p>${nodes.map(renderNode).join("")}</p>`;
  }).join("");
}

export function richTextToPlainText(value) {
  return parseRichTextParagraphs(value).map((paragraph) => paragraph.text).join("\n\n");
}
