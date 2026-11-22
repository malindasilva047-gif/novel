function canvasToImageFile(canvas, baseName, quality = 0.84) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((webpBlob) => {
      if (webpBlob?.type === "image/webp") {
        resolve(new File([webpBlob], `${baseName}.webp`, {
          type: "image/webp",
          lastModified: Date.now(),
        }));
        return;
      }

      canvas.toBlob((jpegBlob) => {
        if (!jpegBlob) {
          reject(new Error("The cover image could not be encoded."));
          return;
        }
        resolve(new File([jpegBlob], `${baseName}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        }));
      }, "image/jpeg", quality);
    }, "image/webp", quality);
  });
}

function drawWrappedTitle(context, title, maxWidth, maxLines) {
  const words = String(title || "Untitled Story").trim().split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.…]+$/, "")}…`;
  }
  return lines;
}

export async function createDefaultCoverFile(title, author) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Cover generation is not available in this browser.");

  const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, "#0D1914");
  background.addColorStop(0.55, "#17211D");
  background.addColorStop(1, "#0D1914");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const glow = context.createRadialGradient(930, 290, 30, 930, 290, 790);
  glow.addColorStop(0, "rgba(22, 133, 106, 0.42)");
  glow.addColorStop(1, "rgba(22, 133, 106, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "rgba(53, 164, 134, 0.55)";
  context.lineWidth = 3;
  context.strokeRect(70, 70, canvas.width - 140, canvas.height - 140);
  context.strokeStyle = "rgba(245, 245, 245, 0.12)";
  context.lineWidth = 1;
  context.strokeRect(92, 92, canvas.width - 184, canvas.height - 184);

  context.textAlign = "center";
  context.fillStyle = "#35A486";
  context.font = "700 30px sans-serif";
  context.letterSpacing = "10px";
  context.fillText("WINGSAGA", canvas.width / 2, 250);
  context.letterSpacing = "0px";

  context.beginPath();
  context.arc(canvas.width / 2, 500, 48, 0, Math.PI * 2);
  context.strokeStyle = "rgba(53, 164, 134, 0.65)";
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = "#35A486";
  context.font = "700 40px Georgia, serif";
  context.fillText("W", canvas.width / 2, 514);

  const maxWidth = 900;
  let fontSize = 104;
  let lines = [];
  do {
    context.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`;
    lines = drawWrappedTitle(context, title, maxWidth, 5);
    if (lines.every((line) => context.measureText(line).width <= maxWidth) || fontSize <= 60) break;
    fontSize -= 6;
  } while (fontSize > 54);

  const lineHeight = fontSize * 1.18;
  const firstLineY = 870 - ((lines.length - 1) * lineHeight) / 2;
  context.fillStyle = "#F5F5F5";
  context.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`;
  lines.forEach((line, index) => {
    context.fillText(line, canvas.width / 2, firstLineY + index * lineHeight, maxWidth);
  });

  context.fillStyle = "#929792";
  context.font = "500 32px sans-serif";
  context.fillText(String(author || "Wingsaga Author").trim().slice(0, 48), canvas.width / 2, 1350, 900);
  context.fillStyle = "#35A486";
  context.font = "600 22px sans-serif";
  context.fillText("A STORY BEGINS HERE", canvas.width / 2, 1580);

  return canvasToImageFile(canvas, "wingsaga-cover", 0.84);
}

export async function optimizeCoverFile(file) {
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("This cover image could not be opened."));
      image.src = objectUrl;
    });

    const scale = Math.min(1, 1200 / image.naturalWidth, 1800 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cover image optimization is not available in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasToImageFile(canvas, "wingsaga-cover", 0.84);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
