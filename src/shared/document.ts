import type { ArtworkState, Document, Paper, Step } from "./types";
export function createDocument(paper: Paper, steps: Step[]): Document {
  return {
    paper,
    front: "#e88459",
    back: "#f8dec2",
    texture: "fiber",
    selected: paper.creases[0]?.id ?? "",
    angles: { ...steps[1]?.angles },
    directions: Object.fromEntries(paper.creases.map((c) => [c.id, 1])),
    steps,
    step: 1,
    playing: false,
    speed: 1,
    view: {
      yaw: -35,
      pitch: 50,
      zoom: 1,
      grid: true,
      wire: true,
      mode: "fold",
      preset: "iso",
    },
    artworks: createArtworkState(),
  };
}
export function createArtworkState(): ArtworkState {
  return {
    front: null,
    back: null,
    side: "front",
    loading: null,
    token: 0,
    history: [],
  };
}
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
