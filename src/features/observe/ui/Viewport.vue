<script setup lang="ts">
import { computed, ref } from "vue";
import type { Document, PoseFace } from "../../../shared/types";
import { project, polygon } from "../lib/projection";
import { orbit, zoom, setView } from "../model/camera";
import { downloadView } from "../lib/export";
import { artworkLayers, visibleSide } from "../../artwork/lib/layers";
import {
  artworkQuad,
  artworkToScreen,
  flatPose,
  polygonString,
  sheetToScreenFlat,
} from "../../artwork/lib/geometry";
import {
  dragArtwork,
  hitArtwork,
  startDrag,
  type ArtworkDrag,
} from "../../artwork/model/interaction";
import {
  chooseArtworkSide,
} from "../../artwork/model/artwork";

const props = defineProps<{
  doc: Document;
  pose: PoseFace[];
  hinges: {
    id: string;
    a: [number, number, number];
    b: [number, number, number];
  }[];
}>();
defineEmits<{ select: [id: string] }>();
const svg = ref<SVGSVGElement>();
let drag: ArtworkDrag | null = null,
  orbiting = false,
  lastX = 0,
  lastY = 0;

const flat = computed(() => props.doc.view.mode === "flat");
/** Editing happens on the unfolded sheet; 3D observation uses the fold pose. */
const effectivePose = computed(() =>
  flat.value ? flatPose(props.doc.paper) : props.pose,
);
const art = computed(() => props.doc.artworks[props.doc.artworks.side]);
const faces = computed(() => {
  const view = props.doc.view;
  return effectivePose.value
    .map((f) => ({
      ...f,
      depth:
        f.points.reduce((s, p) => s + project(p, view).z, 0) / f.points.length,
      back: visibleSide(f, view) === "back",
    }))
    .sort((a, b) => a.depth - b.depth);
});
const layers = computed(() =>
  artworkLayers(
    props.doc.paper.faces,
    effectivePose.value,
    props.doc.view,
    props.doc.artworks,
  ),
);
const layerMap = computed(
  () => new Map(layers.value.map((l) => [l.faceId, l])),
);
const artMatrix = computed(() => {
  if (!flat.value || !art.value) return null;
  const face = props.doc.paper.faces[0];
  const posed = effectivePose.value.find((p) => p.id === face?.id);
  if (!face || !posed) return null;
  return artworkToScreen(
    art.value,
    props.doc.artworks.side,
    face,
    posed.points,
    props.doc.view,
  );
});
const handles = computed(() => {
  if (!artMatrix.value || !art.value) return null;
  const quad = artworkQuad(
    art.value,
    props.doc.artworks.side,
    artMatrix.value,
  );
  if (quad.length < 4) return null;
  const top = {
      x: (quad[0]!.x + quad[1]!.x) / 2,
      y: (quad[0]!.y + quad[1]!.y) / 2,
    },
    bottom = {
      x: (quad[3]!.x + quad[2]!.x) / 2,
      y: (quad[3]!.y + quad[2]!.y) / 2,
    };
  const cx = (quad[0]!.x + quad[2]!.x) / 2,
    cy = (quad[0]!.y + quad[2]!.y) / 2;
  const rotate = {
    x: cx + (top.x - cx) * 1.14,
    y: cy + (top.y - cy) * 1.14,
  };
  return { quad, rotate, bottom, top };
});
const imagePolygon = computed(() =>
  handles.value ? polygonString(handles.value.quad) : "",
);
/**
 * Crease guides of the unfolded sheet. They are reference lines, not texture
 * edges, and are painted beneath every face so they can never introduce a seam.
 */
const flatGuides = computed(() => {
  if (!flat.value || !props.doc.view.wire) return [];
  return props.doc.paper.faces
    .filter((f) => f.hinge)
    .map((f) => ({
      id: f.id,
      a: sheetToScreenFlat(f.hinge![0], props.doc.view),
      b: sheetToScreenFlat(f.hinge![1], props.doc.view),
    }));
});

function svgPoint(e: PointerEvent | MouseEvent) {
  const el = svg.value;
  if (!el) return { x: 0, y: 0 };
  const p = el.createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  const m = el.getScreenCTM();
  const out = m ? p.matrixTransform(m.inverse()) : p;
  return { x: out.x, y: out.y };
}

function within(
  p: { x: number; y: number },
  c: { x: number; y: number },
  r: number,
) {
  return Math.hypot(p.x - c.x, p.y - c.y) <= r;
}

function down(e: PointerEvent) {
  if ((e.target as Element).closest(".hinge")) return;
  const point = svgPoint(e);
  const target = e.currentTarget as Element;
  if (flat.value && art.value) {
    const h = handles.value;
    if (h && within(point, h.rotate, 17)) {
      drag = startDrag(props.doc, point, art.value, "rotate", effectivePose.value);
    } else if (h && within(point, h.bottom, 15)) {
      drag = startDrag(props.doc, point, art.value, "scale", effectivePose.value);
    } else {
      const face = hitArtwork(
        point,
        props.doc.artworks.side,
        props.doc.paper.faces,
        effectivePose.value,
        props.doc.view,
        art.value,
      );
      if (face) {
        drag = startDrag(props.doc, point, art.value, "move", effectivePose.value);
      }
    }
    if (drag) {
      target.setPointerCapture(e.pointerId);
      return;
    }
  }
  orbiting = true;
  lastX = e.clientX;
  lastY = e.clientY;
  target.setPointerCapture(e.pointerId);
}

function move(e: PointerEvent) {
  if (drag) {
    dragArtwork(props.doc, drag, svgPoint(e), effectivePose.value);
    return;
  }
  if (!orbiting) return;
  orbit(props.doc, e.clientX - lastX, e.clientY - lastY);
  lastX = e.clientX;
  lastY = e.clientY;
}

function up() {
  drag = null;
  orbiting = false;
}
</script>

<template>
  <section class="viewport">
    <div class="viewport-top">
      <div class="view-tabs">
        <button
          :class="{ active: doc.view.preset === 'iso' }"
          @click="setView(doc, 'iso')"
          >立体视图</button
        ><button
          :class="{ active: doc.view.preset === 'top' }"
          @click="setView(doc, 'top')"
          >俯视</button
        ><button
          :class="{ active: doc.view.preset === 'front' }"
          @click="setView(doc, 'front')"
          >正视</button
        ><button
          :class="{ active: doc.view.preset === 'flat' }"
          @click="setView(doc, 'flat')"
          >展开图</button
        >
      </div>
      <span v-if="flat" class="flat-tools">
        <button
          :class="{ active: doc.artworks.side === 'front' }"
          @click="chooseArtworkSide(doc, 'front')"
          >编辑正面</button
        ><button
          :class="{ active: doc.artworks.side === 'back' }"
          @click="chooseArtworkSide(doc, 'back')"
          >编辑背面</button
        >
      </span>
      <span v-else class="live"><i></i> 实时预览</span>
    </div>
    <svg
      ref="svg"
      class="paper-scene"
      :class="{ editing: flat }"
      viewBox="0 0 800 560"
      aria-label="三维折纸预览"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @wheel.prevent="zoom(doc, -$event.deltaY * 0.001)"
    >
      <defs>
        <pattern id="grid" width="35" height="35" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="#d4d9d0" />
        </pattern>
        <pattern
          id="fiber"
          width="13"
          height="17"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M1 2l3 1M8 11l2 -2M3 14l1 -2"
            stroke="#fff"
            stroke-opacity=".22"
            stroke-width=".7"
          />
        </pattern>
        <pattern id="dots" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r=".65" fill="#fff" fill-opacity=".4" />
        </pattern>
        <clipPath
          v-for="l in layers"
          :id="'art-clip-' + l.faceId"
          :key="l.faceId"
        >
          <polygon :points="l.clip" />
        </clipPath>
        <filter id="shadow"><feGaussianBlur stdDeviation="15" /></filter>
      </defs>
      <rect width="800" height="560" fill="#f6f7f2" />
      <rect v-if="doc.view.grid" width="800" height="560" fill="url(#grid)" />
      <ellipse
        cx="400"
        cy="401"
        rx="180"
        ry="32"
        fill="#63705a"
        opacity=".15"
        filter="url(#shadow)"
      />
      <g v-for="f in faces" :key="f.id" :data-face="f.id">
        <polygon
          :points="polygon(f.points, doc.view)"
          :fill="f.back ? doc.back : doc.front"
          stroke-linejoin="round"
        />
        <polygon
          v-if="doc.texture !== 'plain'"
          :points="polygon(f.points, doc.view)"
          :fill="'url(#' + doc.texture + ')'"
        />
        <g
          v-if="layerMap.get(f.id)"
          :clip-path="'url(#art-clip-' + f.id + ')'"
          style="pointer-events: none"
        >
          <image
            :href="layerMap.get(f.id)!.href"
            :transform="layerMap.get(f.id)!.matrix"
            preserveAspectRatio="none"
            :width="layerMap.get(f.id)!.art.width"
            :height="layerMap.get(f.id)!.art.height"
          />
        </g>
        <polygon
          v-if="layerMap.get(f.id)"
          :points="polygon(f.points, doc.view)"
          fill="#314638"
          opacity=".05"
          style="pointer-events: none"
        />
        <polygon
          v-if="!layerMap.get(f.id)"
          :points="polygon(f.points, doc.view)"
          fill="none"
          stroke="#785945"
          stroke-opacity=".35"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
      </g>
      <g v-if="flatGuides.length" style="pointer-events: none">
        <line
          v-for="g in flatGuides"
          :key="g.id"
          :x1="g.a.x"
          :y1="g.a.y"
          :x2="g.b.x"
          :y2="g.b.y"
          stroke="#785945"
          stroke-opacity=".4"
          stroke-width="1"
          stroke-dasharray="5 4"
        />
      </g>
      <g v-if="flat && art && handles" class="artwork-overlay">
        <polygon
          :points="imagePolygon"
          fill="none"
          stroke="#3f5646"
          stroke-opacity=".55"
          stroke-width="1.4"
          stroke-dasharray="7 6"
          style="pointer-events: none"
        />
        <line
          :x1="handles.top.x"
          :y1="handles.top.y"
          :x2="handles.rotate.x"
          :y2="handles.rotate.y"
          stroke="#3f5646"
          stroke-opacity=".6"
          stroke-width="1.4"
          style="pointer-events: none"
        />
        <circle
          :cx="handles.rotate.x"
          :cy="handles.rotate.y"
          r="10"
          fill="#3f5646"
          stroke="#fffaf0"
          stroke-width="2.2"
          class="art-handle"
        />
        <path
          :d="`M${handles.rotate.x - 4} ${handles.rotate.y + 2.5}a4.5 4.5 0 1 1 1.2 2.4`"
          fill="none"
          stroke="#fffaf0"
          stroke-width="1.5"
          style="pointer-events: none"
        />
        <rect
          :x="handles.bottom.x - 8"
          :y="handles.bottom.y - 8"
          width="16"
          height="16"
          rx="2"
          fill="#3f5646"
          stroke="#fffaf0"
          stroke-width="2.2"
          class="art-handle"
        />
      </g>
      <g v-if="doc.view.wire && !flat">
        <g
          v-for="(h, i) in hinges"
          :key="h.id"
          class="hinge"
          @click.stop="$emit('select', h.id)"
        >
          <line
            :x1="project(h.a, doc.view).x"
            :y1="project(h.a, doc.view).y"
            :x2="project(h.b, doc.view).x"
            :y2="project(h.b, doc.view).y"
            stroke="transparent"
            stroke-width="18"
          />
          <line
            :x1="project(h.a, doc.view).x"
            :y1="project(h.a, doc.view).y"
            :x2="project(h.b, doc.view).x"
            :y2="project(h.b, doc.view).y"
            :stroke="h.id === doc.selected ? '#fff8d9' : '#746f57'"
            :stroke-width="h.id === doc.selected ? 2.5 : 1.2"
            stroke-dasharray="5 4"
          />
          <circle
            :cx="(project(h.a, doc.view).x + project(h.b, doc.view).x) / 2"
            :cy="(project(h.a, doc.view).y + project(h.b, doc.view).y) / 2"
            r="11"
            :fill="h.id === doc.selected ? '#384d3f' : '#f7f6ee'"
          />
          <text
            :x="(project(h.a, doc.view).x + project(h.b, doc.view).x) / 2"
            :y="(project(h.a, doc.view).y + project(h.b, doc.view).y) / 2 + 3.5"
            text-anchor="middle"
            font-size="10"
            :fill="h.id === doc.selected ? 'white' : '#555'"
          >
            {{ i + 1 }}
          </text>
        </g>
      </g>
      <g transform="translate(58,475)" stroke-width="1.5">
        <path d="M0 0l28 12" stroke="#be806c" />
        <path d="M0 0v-30" stroke="#839b72" />
        <path d="M0 0l-18 15" stroke="#839eae" />
        <text x="32" y="17" font-size="10" fill="#ad7a69">X</text>
        <text x="-3" y="-37" font-size="10" fill="#789069">Y</text>
        <text x="-28" y="23" font-size="10" fill="#839eae">Z</text>
      </g>
    </svg>
    <div class="scene-caption">
      <span v-if="flat"
        >展开图 · 拖动图案移动 · 右上圆点旋转 · 右下方块缩放</span
      >
      <span v-else>拖动旋转视角 · 滚轮缩放</span
      ><b>{{ Math.round(doc.view.zoom * 100) }}%</b>
    </div>
    <div class="scene-tools">
      <button
        :class="{ selected: doc.view.grid }"
        title="网格"
        @click="doc.view.grid = !doc.view.grid"
      >
        ▦</button
      ><button
        :class="{ selected: doc.view.wire }"
        title="折痕"
        @click="doc.view.wire = !doc.view.wire"
      >
        ⌁</button
      ><i></i><button title="放大" @click="zoom(doc, 0.1)">＋</button
      ><button title="缩小" @click="zoom(doc, -0.1)">−</button
      ><button title="重置视角" @click="setView(doc, 'iso')">⤢</button><i></i
      ><button title="下载观察图" @click="svg && downloadView(svg)">↓</button>
    </div>
  </section>
</template>
