import type { Document } from "../../../shared/types";
import { clamp } from "../../../shared/document";
import { leaveFlat } from "../../observe/model/camera";
export function seek(doc: Document, index: number) {
  doc.playing = false;
  // Steps are 3D observations; leave the flat editing view first.
  leaveFlat(doc);
  doc.step = clamp(index, 0, doc.steps.length - 1);
  doc.angles = { ...doc.steps[doc.step]!.angles };
  const c = doc.paper.creases[doc.step - 1];
  if (c) doc.selected = c.id;
}
/**
 * A saved step stores the fold recipe (crease angles) only. Artwork is never
 * baked into a step, so later picture edits keep every step's original folds
 * while all steps render the same current picture.
 */
export function captureStep(doc: Document) {
  const step = doc.steps[doc.step];
  if (step) {
    step.angles = { ...doc.angles };
    step.saved = true;
    step.note = "已保存当前折法，图案会跟随最新贴图显示。";
  }
}
