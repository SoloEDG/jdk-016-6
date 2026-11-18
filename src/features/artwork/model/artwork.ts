import type {
  Artwork,
  ArtworkSnapshot,
  ArtworkState,
  Document,
  PaperSide,
} from "../../../shared/types";
import { setView } from "../../observe/model/camera";
import { ArtworkRejected, prepareArtwork } from "../lib/load";

const HISTORY_LIMIT = 12;
/** Keep the in-memory snapshot budget bounded even with large pictures. */
const HISTORY_BYTES = 24 * 1024 * 1024;

export function currentArtwork(doc: Document): Artwork | null {
  return doc.artworks[doc.artworks.side];
}

/** History keeps its own copy so later edits cannot rewrite a past state. */
function cloneArtwork(art: Artwork | null): Artwork | null {
  return art ? { ...art, transform: { ...art.transform } } : null;
}

function snapshot(state: ArtworkState): ArtworkSnapshot {
  return { front: cloneArtwork(state.front), back: cloneArtwork(state.back) };
}

function pushHistory(state: ArtworkState) {
  state.history.push(snapshot(state));
  while (state.history.length > HISTORY_LIMIT) state.history.shift();
  const bytes = (s: ArtworkSnapshot) =>
    (s.front?.bytes ?? 0) + (s.back?.bytes ?? 0);
  let total = state.history.reduce((n, s) => n + bytes(s), 0);
  while (state.history.length > 1 && total > HISTORY_BYTES) {
    total -= bytes(state.history.shift()!);
  }
}

export function setArtworkSide(doc: Document, side: PaperSide) {
  doc.artworks.side = side;
}

export function updateTransform(
  doc: Document,
  patch: Partial<Artwork["transform"]>,
) {
  const art = currentArtwork(doc);
  if (!art) return;
  art.transform = { ...art.transform, ...patch };
}

/**
 * Start an import. A monotonically increasing token guards against late
 * completions: switching paper, undoing or starting a new import invalidates
 * every earlier pending load.
 */
export function beginArtworkLoad(doc: Document, name: string) {
  const state = doc.artworks;
  state.token += 1;
  state.loading = {
    token: state.token,
    side: state.side,
    name,
    paperId: doc.paper.id,
  };
  return state.token;
}

export function cancelArtworkLoad(doc: Document) {
  doc.artworks.token += 1;
  doc.artworks.loading = null;
}

/**
 * Commit a decoded picture to a side. Every mutation of artwork data goes
 * through here so history, token and paper checks stay in one place.
 */
export function commitArtwork(
  doc: Document,
  token: number,
  side: PaperSide,
  name: string,
  prepared: import("../lib/load").PreparedArtwork,
): boolean {
  const state = doc.artworks;
  if (state.token !== token || state.loading?.token !== token) return false;
  if (doc.paper.id !== state.loading.paperId) {
    state.loading = null;
    return false;
  }
  pushHistory(state);
  state.loading = null;
  state[side] = {
    id: "art-" + Date.now().toString(36) + "-" + token.toString(36),
    name,
    src: prepared.src,
    width: prepared.width,
    height: prepared.height,
    bytes: prepared.bytes,
    original: prepared.original,
    transform: { x: 0, z: 0, scale: 0.62, rotation: 0 },
    createdAt: Date.now(),
  };
  return true;
}

export async function importArtwork(doc: Document, file: File) {
  const state = doc.artworks;
  const token = beginArtworkLoad(doc, file.name || "未命名图片");
  const loading = state.loading!;
  try {
    const prepared = await prepareArtwork(file);
    return commitArtwork(doc, token, loading.side, loading.name, prepared);
  } catch (error) {
    if (state.token === token) state.loading = null;
    if (error instanceof ArtworkRejected) return error.message;
    return "图片导入失败，已保持当前图案";
  }
}

/**
 * Explicit undo. While a decode is in flight it cancels that decode first;
 * either way the token is bumped so a slow load can never land on a state the
 * user has already stepped away from.
 */
export function undoArtwork(doc: Document): "cancelled" | "restored" | "empty" {
  const state = doc.artworks;
  state.token += 1;
  if (state.loading) {
    state.loading = null;
    return "cancelled";
  }
  const previous = state.history.pop();
  if (!previous) return "empty";
  state.front = previous.front;
  state.back = previous.back;
  return "restored";
}

export function removeArtwork(doc: Document, side: PaperSide = doc.artworks.side) {
  const state = doc.artworks;
  if (!state[side]) return false;
  state.token += 1;
  state.loading = null;
  pushHistory(state);
  state[side] = null;
  return true;
}

/** Show the chosen side head-on while keeping the current zoom. */
export function chooseArtworkSide(doc: Document, side: PaperSide) {
  setArtworkSide(doc, side);
  if (doc.view.mode === "flat") {
    doc.view.yaw = 0;
    doc.view.pitch = side === "front" ? 90 : -90;
    doc.view.preset = "flat";
  } else {
    setView(doc, "flat");
  }
}

export function resetTransform(doc: Document) {
  updateTransform(doc, { x: 0, z: 0, scale: 0.62, rotation: 0 });
}

export function transferArtwork(doc: Document) {
  const state = doc.artworks;
  const from: PaperSide = state.side,
    to: PaperSide = from === "front" ? "back" : "front";
  if (!state[from] || state[to]) return false;
  pushHistory(state);
  const copy: Artwork = {
    ...state[from]!,
    id: state[from]!.id + "-" + to,
    transform: { ...state[from]!.transform },
  };
  state[to] = copy;
  state.side = to;
  return true;
}

export function artworkBytes(doc: Document) {
  const a = doc.artworks.front?.bytes ?? 0,
    b = doc.artworks.back?.bytes ?? 0;
  return a + b;
}
