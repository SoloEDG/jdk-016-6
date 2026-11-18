import type {
  Artwork,
  Face,
  Paper,
  PaperSide,
  PoseFace,
  Vec3,
  View,
} from "../../../shared/types";
import { cross, sub, unit } from "../../../shared/vector";
import { project } from "../../observe/lib/projection";

export interface Point2 {
  x: number;
  y: number;
}

/** 2D affine transform: x' = a*x + b*y + c, y' = d*x + e*y + f. */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 };

/** The flat sheet uses (x, z) as its two texture axes. */
export const sheetPoint = (p: Vec3): Point2 => ({ x: p[0], y: p[2] });

export function applyMatrix(m: Matrix, p: Point2): Point2 {
  return { x: m.a * p.x + m.b * p.y + m.c, y: m.d * p.x + m.e * p.y + m.f };
}

export function combine(outer: Matrix, inner: Matrix): Matrix {
  return {
    a: outer.a * inner.a + outer.b * inner.d,
    b: outer.a * inner.b + outer.b * inner.e,
    c: outer.a * inner.c + outer.b * inner.f + outer.c,
    d: outer.d * inner.a + outer.e * inner.d,
    e: outer.d * inner.b + outer.e * inner.e,
    f: outer.d * inner.c + outer.e * inner.f + outer.f,
  };
}

/** SVG matrix() expects column-major order: a b c d e f where b/d are the skew terms. */
export function svgMatrix(m: Matrix) {
  const n = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Number(v.toFixed(4)));
  return `matrix(${n(m.a)} ${n(m.d)} ${n(m.b)} ${n(m.e)} ${n(m.c)} ${n(m.f)})`;
}

export function linearInverse(m: Matrix): { ia: number; ib: number; id: number; ie: number } {
  const det = m.a * m.e - m.b * m.d;
  const safe = Math.abs(det) < 1e-9 ? 1e-9 : det;
  return { ia: m.e / safe, ib: -m.b / safe, id: -m.d / safe, ie: m.a / safe };
}

/**
 * Affine mapping from the flat sheet's (x, z) coordinates of a face to its
 * projected screen coordinates. Because the renderer is orthographic and each
 * paper face is rigid, this mapping is exact for the whole triangle.
 */
export function faceToScreen(
  face: Face,
  pose: Vec3[],
  view: View,
): Matrix | null {
  if (face.points.length < 3 || pose.length < 3) return null;
  const q0 = sheetPoint(face.points[0]!),
    q1 = sheetPoint(face.points[1]!),
    q2 = sheetPoint(face.points[2]!);
  const s0 = project(pose[0]!, view),
    s1 = project(pose[1]!, view),
    s2 = project(pose[2]!, view);
  const qx1 = q1.x - q0.x,
    qy1 = q1.y - q0.y,
    qx2 = q2.x - q0.x,
    qy2 = q2.y - q0.y;
  const det = qx1 * qy2 - qx2 * qy1;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-10) return null;
  const sx1 = s1.x - s0.x,
    sx2 = s2.x - s0.x,
    sy1 = s1.y - s0.y,
    sy2 = s2.y - s0.y;
  const a = (sx1 * qy2 - sx2 * qy1) / det,
    b = (sx2 * qx1 - sx1 * qx2) / det,
    d = (sy1 * qy2 - sy2 * qy1) / det,
    e = (sy2 * qx1 - sy1 * qx2) / det;
  return {
    a,
    b,
    c: s0.x - a * q0.x - b * q0.y,
    d,
    e,
    f: s0.y - d * q0.x - e * q0.y,
  };
}

const MIRROR_Z: Matrix = { a: 1, b: 0, c: 0, d: 0, e: -1, f: 0 };

/**
 * Pixel-space of the source image → flat sheet space, including the
 * viewer-facing orientation of the chosen side.
 *
 * Front artwork is laid out directly on the sheet. Back artwork is laid out in
 * the "back view" frame (the sheet seen from the reverse). Mirroring its z axis
 * is what makes the reverse design read naturally from the back instead of
 * arriving mirrored. Both mappings stay global across every triangle, so a
 * picture spanning a crease never shifts at the seam.
 */
export function artworkToSheet(art: Artwork, side: PaperSide): Matrix {
  const fit = 2 / Math.max(1, art.width, art.height);
  const s = fit * art.transform.scale;
  const r = (art.transform.rotation * Math.PI) / 180;
  const cos = Math.cos(r),
    sin = Math.sin(r);
  const tx = art.transform.x,
    tz = art.transform.z;
  const w = art.width / 2,
    h = art.height / 2;
  const layout: Matrix = {
    a: s * cos,
    b: -s * sin,
    c: tx - s * cos * w + s * sin * h,
    d: s * sin,
    e: s * cos,
    f: tz - s * sin * w - s * cos * h,
  };
  return side === "front" ? layout : combine(MIRROR_Z, layout);
}

export function artworkToScreen(
  art: Artwork,
  side: PaperSide,
  face: Face,
  pose: Vec3[],
  view: View,
): Matrix | null {
  const faceMap = faceToScreen(face, pose, view);
  if (!faceMap) return null;
  return combine(faceMap, artworkToSheet(art, side));
}

/** The screen-space quad covered by the artwork (for selection handles / bounds). */
export function artworkQuad(art: Artwork, side: PaperSide, m: Matrix): Point2[] {
  const corners: Point2[] = [
    { x: 0, y: 0 },
    { x: art.width, y: 0 },
    { x: art.width, y: art.height },
    { x: 0, y: art.height },
  ];
  return corners.map((p) => applyMatrix(m, p));
}

export function polygonString(points: Point2[]) {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

/** Nudge a clip polygon outward by a fraction of a pixel to hide AA hairlines. */
export function expandPolygon(points: Point2[], amount = 0.6): Point2[] {
  const c = points.reduce(
    (s, p) => ({ x: s.x + p.x / points.length, y: s.y + p.y / points.length }),
    { x: 0, y: 0 },
  );
  return points.map((p) => {
    const dx = p.x - c.x,
      dy = p.y - c.y,
      len = Math.hypot(dx, dy);
    if (len < 1e-6) return p;
    return {
      x: p.x + (dx / len) * amount,
      y: p.y + (dy / len) * amount,
    };
  });
}

export function insidePolygon(point: Point2, polygon: Point2[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Sheet (x, z) point → screen, for the unfolded sheet. */
export function sheetToScreenFlat(p: Vec3, view: View): Point2 {
  const s = project(p, view);
  return { x: s.x, y: s.y };
}

/** Unfolded pose, in the very same sheet coordinates used by the fold solver. */
export function flatPose(paper: Paper): PoseFace[] {
  return paper.faces.map((f) => {
    const points = f.points.map((p) => [p[0], p[1], p[2]] as Vec3);
    return {
      id: f.id,
      points,
      normal: unit(
        cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!)),
      ),
    };
  });
}

/**
 * Screen-space delta → artwork-design-space delta for direct manipulation in
 * the flattened view. Works for both sides (the back view mirrored x axis).
 */
export function screenDeltaToDesign(
  face: Face,
  pose: Vec3[],
  view: View,
  side: PaperSide,
  dx: number,
  dy: number,
): Point2 {
  const m = faceToScreen(face, pose, view);
  if (!m) return { x: 0, y: 0 };
  const sideLinear: Matrix =
    side === "front"
      ? { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
      : { a: 1, b: 0, c: 0, d: 0, e: -1, f: 0 };
  const inv = linearInverse(combine(m, sideLinear));
  return {
    x: inv.ia * dx + inv.ib * dy,
    y: inv.id * dx + inv.ie * dy,
  };
}
