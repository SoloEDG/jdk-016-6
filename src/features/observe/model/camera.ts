import type { Document } from "../../../shared/types";
import { clamp } from "../../../shared/document";

export function setView(doc: Document, preset: string) {
  const name =
    preset === "flat"
      ? "flat"
      : preset === "top"
        ? "top"
        : preset === "front"
          ? "front"
          : "iso";
  doc.view.preset = name;
  doc.view.mode = name === "flat" ? "flat" : "fold";
  if (preset === "top") {
    doc.view.yaw = 0;
    doc.view.pitch = 90;
  } else if (preset === "front") {
    doc.view.yaw = 0;
    doc.view.pitch = 15;
  } else if (preset === "flat") {
    doc.view.yaw = 0;
    doc.view.pitch = doc.artworks.side === "front" ? 90 : -90;
  } else {
    doc.view.yaw = -35;
    doc.view.pitch = 50;
  }
  doc.view.zoom = preset === "flat" ? 1.05 : 1;
}

/** Leave flat editing and go back to a foldable 3D view. */
export function leaveFlat(doc: Document) {
  if (doc.view.mode === "flat") setView(doc, "iso");
}

export function orbit(doc: Document, dx: number, dy: number) {
  if (doc.view.mode === "flat") return;
  doc.view.yaw += dx * 0.45;
  doc.view.pitch = clamp(doc.view.pitch + dy * 0.35, -85, 90);
  doc.view.preset = "iso";
}

export function zoom(doc: Document, delta: number) {
  doc.view.zoom = clamp(doc.view.zoom + delta, 0.5, 2.2);
}
