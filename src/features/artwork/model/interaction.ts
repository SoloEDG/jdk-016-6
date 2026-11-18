import type {
  Document,
  Face,
  PaperSide,
  PoseFace,
  View,
} from "../../../shared/types";
import {
  artworkQuad,
  artworkToScreen,
  insidePolygon,
  screenDeltaToDesign,
} from "../lib/geometry";
import { project } from "../../observe/lib/projection";
import { currentArtwork, updateTransform } from "../model/artwork";

export interface ArtworkDrag {
  mode: "move" | "rotate" | "scale";
  startX: number;
  startY: number;
  transform: { x: number; z: number; scale: number; rotation: number };
  origin: { x: number; y: number };
}

export function hitArtwork(
  point: { x: number; y: number },
  artSide: PaperSide,
  faces: Face[],
  pose: PoseFace[],
  view: View,
  art: NonNullable<Document["artworks"]["front"]>,
) {
  for (const face of faces) {
    const posed = pose.find((p) => p.id === face.id);
    if (!posed) continue;
    const m = artworkToScreen(art, artSide, face, posed.points, view);
    if (!m) continue;
    const quad = artworkQuad(art, artSide, m);
    const outline = posed.points.map((p) => project(p, view));
    if (insidePolygon(point, quad) && insidePolygon(point, outline))
      return face.id;
  }
  return null;
}

export function startDrag(
  doc: Document,
  point: { x: number; y: number },
  art: NonNullable<Document["artworks"]["front"]>,
  mode: ArtworkDrag["mode"],
  pose: PoseFace[],
): ArtworkDrag | null {
  const face = doc.paper.faces[0];
  const posed = pose.find((p) => p.id === face?.id);
  if (!face || !posed) return null;
  const m = artworkToScreen(art, doc.artworks.side, face, posed.points, doc.view);
  if (!m) return null;
  const q = artworkQuad(art, doc.artworks.side, m);
  const origin = q.reduce(
    (s, p) => ({ x: s.x + p.x / q.length, y: s.y + p.y / q.length }),
    { x: 0, y: 0 },
  );
  return {
    mode,
    startX: point.x,
    startY: point.y,
    transform: { ...art.transform },
    origin,
  };
}

export function dragArtwork(
  doc: Document,
  drag: ArtworkDrag,
  point: { x: number; y: number },
  pose: PoseFace[],
) {
  const art = currentArtwork(doc);
  const face = doc.paper.faces[0];
  const posed = pose.find((p) => p.id === face?.id);
  if (!art || !face || !posed) return;
  const dx = point.x - drag.startX,
    dy = point.y - drag.startY;
  if (drag.mode === "move") {
    const delta = screenDeltaToDesign(
      face,
      posed.points,
      doc.view,
      doc.artworks.side,
      dx,
      dy,
    );
    updateTransform(doc, {
      x: drag.transform.x + delta.x,
      z: drag.transform.z + delta.y,
    });
    return;
  }
  if (drag.mode === "rotate") {
    const a0 = Math.atan2(drag.startY - drag.origin.y, drag.startX - drag.origin.x);
    const a1 = Math.atan2(point.y - drag.origin.y, point.x - drag.origin.x);
    // Both sides compose to a non-mirrored screen map, so the screen-space
    // angle delta applies to the design rotation unchanged.
    const deg = ((a1 - a0) * 180) / Math.PI;
    updateTransform(doc, {
      rotation: Math.round(drag.transform.rotation + deg),
    });
    return;
  }
  const d0 = Math.hypot(drag.startX - drag.origin.x, drag.startY - drag.origin.y);
  const d1 = Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y);
  if (d0 < 4) return;
  const scale = Math.min(4, Math.max(0.05, (drag.transform.scale * d1) / d0));
  updateTransform(doc, { scale: Number(scale.toFixed(3)) });
}

