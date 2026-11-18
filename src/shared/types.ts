export type Vec3 = [number, number, number];
export interface Face {
  id: string;
  points: Vec3[];
  parent?: string;
  hinge?: [Vec3, Vec3];
  crease?: string;
}
export interface Crease {
  id: string;
  name: string;
  description: string;
  face: string;
  target: number;
}
export interface Paper {
  id: string;
  name: string;
  subtitle: string;
  size: number;
  faces: Face[];
  creases: Crease[];
}
export interface Step {
  id: string;
  title: string;
  note: string;
  angles: Record<string, number>;
  duration: number;
  /** True once the user saved this step; saved steps never snapshot artwork. */
  saved?: boolean;
}
export type PaperSide = "front" | "back";
export interface ArtworkTransform {
  x: number;
  z: number;
  scale: number;
  rotation: number;
}
export interface Artwork {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  bytes: number;
  original: { width: number; height: number; bytes: number };
  transform: ArtworkTransform;
  createdAt: number;
}
export interface ArtworkLoading {
  token: number;
  side: PaperSide;
  name: string;
  paperId: string;
}
export interface ArtworkSnapshot {
  front: Artwork | null;
  back: Artwork | null;
}
export interface ArtworkState {
  front: Artwork | null;
  back: Artwork | null;
  side: PaperSide;
  loading: ArtworkLoading | null;
  token: number;
  history: ArtworkSnapshot[];
}
export interface View {
  yaw: number;
  pitch: number;
  zoom: number;
  grid: boolean;
  wire: boolean;
  mode: "fold" | "flat";
  preset: "iso" | "top" | "front" | "flat";
}
export interface Document {
  paper: Paper;
  front: string;
  back: string;
  texture: string;
  selected: string;
  angles: Record<string, number>;
  directions: Record<string, number>;
  steps: Step[];
  step: number;
  playing: boolean;
  speed: number;
  view: View;
  artworks: ArtworkState;
}
export interface PoseFace {
  id: string;
  points: Vec3[];
  normal: Vec3;
}
