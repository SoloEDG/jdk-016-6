import { prepareArtwork, type PreparedArtwork } from "./load";

/**
 * Built-in demo picture. Asymmetric on purpose (text + a single corner mark)
 * so mirrored / shifted placement is obvious while testing.
 */
export async function createSampleArtwork(
  side: "front" | "back",
): Promise<PreparedArtwork> {
  const width = 1200,
    height = 840;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("无法创建示例图案");
  const grad = c.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#f6e7ce");
  grad.addColorStop(0.5, "#efc9a4");
  grad.addColorStop(1, "#d98a63");
  c.fillStyle = grad;
  c.fillRect(0, 0, width, height);
  c.strokeStyle = "rgba(97,64,48,.28)";
  c.lineWidth = 10;
  for (let x = -height; x < width + height; x += 92) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x + height, height);
    c.stroke();
  }
  c.beginPath();
  c.arc(width * 0.3, height * 0.56, 208, 0, Math.PI * 2);
  c.fillStyle = "rgba(63,88,68,.2)";
  c.fill();
  c.strokeStyle = "#3f5646";
  c.lineWidth = 7;
  c.stroke();
  c.fillStyle = "#3d5445";
  c.font = "700 112px 'Noto Serif SC', serif";
  c.fillText(side === "front" ? "折间 · 正" : "折间 · 背", 96, height - 126);
  c.font = "500 44px 'Noto Sans SC', sans-serif";
  c.fillText(
    side === "front" ? "ORI FRONT / 山" : "ORI BACK / 谷",
    100,
    height - 58,
  );
  c.fillStyle = "#c45f3d";
  c.beginPath();
  c.moveTo(width - 168, 78);
  c.lineTo(width - 72, 78);
  c.lineTo(width - 72, 174);
  c.closePath();
  c.fill();
  c.fillStyle = "#fdf6e7";
  c.font = "600 30px 'Noto Sans SC', sans-serif";
  c.fillText("A", width - 136, 136);
  const src = canvas.toDataURL("image/webp", 0.9);
  return prepareArtwork(
    await fetch(src)
      .then((r) => r.blob())
      .then((b) => new File([b], `示例图案-${side}.webp`, { type: b.type })),
  );
}
