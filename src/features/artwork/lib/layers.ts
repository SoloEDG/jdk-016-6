import type {
  Artwork,
  Document,
  Face,
  PaperSide,
  PoseFace,
  View,
} from "../../../shared/types";
import { cameraPoint, project } from "../../observe/lib/projection";
import {
  artworkToScreen,
  expandPolygon,
  polygonString,
  svgMatrix,
} from "../lib/geometry";

export interface ArtworkLayer {
  faceId: string;
  side: PaperSide;
  art: Artwork;
  href: string;
  matrix: string;
  clip: string;
  depth: number;
}

/** Which printed side is currently facing the camera. Mirrors the material rule. */
export function visibleSide(posed: PoseFace, view: View): PaperSide {
  return cameraPoint(posed.normal, view)[2] > 0 ? "back" : "front";
}

/**
 * One clipped image per paper face. Every triangle shares the same global
 * sheet→image mapping (see `artworkToSheet`), so the picture stays continuous
 * across creases; the clip only trims it to that face.
 */
export function artworkLayers(
  paperFaces: Face[],
  pose: PoseFace[],
  view: View,
  artworks: Document["artworks"],
): ArtworkLayer[] {
  const layers: ArtworkLayer[] = [];
  for (const face of paperFaces) {
    const posed = pose.find((p) => p.id === face.id);
    if (!posed) continue;
    const side = visibleSide(posed, view);
    const art = artworks[side];
    if (!art) continue;
    const m = artworkToScreen(art, side, face, posed.points, view);
    if (!m) continue;
    const clip = expandPolygon(
      posed.points.map((p) => {
        const s = project(p, view);
        return { x: s.x, y: s.y };
      }),
      0.55,
    );
    layers.push({
      faceId: face.id,
      side,
      art,
      href: art.src,
      matrix: svgMatrix(m),
      clip: polygonString(clip),
      depth:
        posed.points.reduce((s, p) => s + project(p, view).z, 0) /
        posed.points.length,
    });
  }
  return layers;
}
