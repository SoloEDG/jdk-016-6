import type { Document, Paper } from "../../../shared/types";
export function replacePaper(doc: Document, paper: Paper) {
  // Any in-flight artwork decode now targets a paper that no longer exists.
  doc.artworks.token += 1;
  doc.artworks.loading = null;
  doc.paper = paper;
  doc.angles = {};
  doc.selected = paper.creases[0]?.id ?? "";
  doc.directions = Object.fromEntries(paper.creases.map((c) => [c.id, 1]));
  doc.playing = false;
  doc.step = 0;
}
export function setMaterial(doc: Document, front: string, back: string) {
  doc.front = front;
  doc.back = back;
}
