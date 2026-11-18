<script setup lang="ts">
import { computed, ref } from "vue";
import type { Document, PaperSide } from "../../../shared/types";
import {
  artworkBytes,
  beginArtworkLoad,
  cancelArtworkLoad,
  chooseArtworkSide,
  commitArtwork,
  importArtwork,
  removeArtwork,
  resetTransform,
  transferArtwork,
  undoArtwork,
  updateTransform,
} from "../model/artwork";
import { createSampleArtwork } from "../lib/sample";

const props = defineProps<{ doc: Document }>();
const emit = defineEmits<{ notify: [text: string] }>();
const input = ref<HTMLInputElement>();
const busy = ref(false);
const side = computed(() => props.doc.artworks.side);
const art = computed(() => props.doc.artworks[side.value]);
const loading = computed(() => props.doc.artworks.loading);
const history = computed(() => props.doc.artworks.history.length);
const kb = (n: number) =>
  n >= 1024 * 1024
    ? (n / 1024 / 1024).toFixed(1) + " MB"
    : Math.max(1, Math.round(n / 1024)) + " KB";

function pick() {
  input.value?.click();
}

function chooseSide(value: PaperSide) {
  chooseArtworkSide(props.doc, value);
}

async function onFile(e: Event) {
  const el = e.target as HTMLInputElement;
  const file = el.files?.[0];
  el.value = "";
  if (!file) return;
  const target = side.value;
  busy.value = true;
  const result = await importArtwork(props.doc, file);
  busy.value = false;
  if (result === true)
    emit("notify", "图片已贴到" + (target === "front" ? "正面" : "背面"));
  else if (result === false) emit("notify", "图片加载期间作品已变更，本次贴图已取消");
  else emit("notify", String(result));
}

async function sample() {
  busy.value = true;
  const token = beginArtworkLoad(props.doc, "示例图案");
  const loading = props.doc.artworks.loading!;
  try {
    const prepared = await createSampleArtwork(loading.side);
    if (commitArtwork(props.doc, token, loading.side, loading.name, prepared))
      emit("notify", "已贴入示例图案");
  } catch {
    if (props.doc.artworks.loading?.token === token)
      props.doc.artworks.loading = null;
  } finally {
    busy.value = false;
  }
}

function undo() {
  const result = undoArtwork(props.doc);
  emit(
    "notify",
    result === "restored"
      ? "已撤销上一次贴图修改"
      : result === "cancelled"
        ? "已取消正在载入的图片"
        : "没有可撤销的贴图修改",
  );
}

function cancel() {
  cancelArtworkLoad(props.doc);
  emit("notify", "已取消本次贴图");
}

function remove() {
  emit("notify", removeArtwork(props.doc) ? "已移除当前面的图案" : "当前面没有图案");
}

function reset() {
  resetTransform(props.doc);
  emit("notify", "图案已回到居中位置");
}

function copyAcross() {
  emit("notify", transferArtwork(props.doc) ? "图案已复制到另一面" : "另一面已有图案或当前面为空");
}

function stepScale(delta: number) {
  const t = props.doc.artworks[side.value]?.transform;
  if (t)
    updateTransform(props.doc, {
      scale: Math.min(4, Math.max(0.05, Number((t.scale + delta).toFixed(2)))),
    });
}

function stepRotation(delta: number) {
  const t = props.doc.artworks[side.value]?.transform;
  if (t)
    updateTransform(props.doc, { rotation: Math.round(t.rotation + delta) });
}
</script>
<template>
  <section class="panel artwork-panel">
    <div class="section-heading">
      <span>03 / 贴图</span><small>ARTWORK</small>
    </div>
    <div class="art-side-switch" role="group" aria-label="编辑面">
      <button :class="{ active: side === 'front' }" @click="chooseSide('front')">正面</button>
      <button :class="{ active: side === 'back' }" @click="chooseSide('back')">背面</button>
    </div>
    <div v-if="loading" class="art-loading" role="status">
      <span class="art-spinner"></span>
      <div>
        <b>正在载入 {{ loading.name }}</b>
        <small>可继续换纸或撤销；迟到的图片不会覆盖新作品</small>
      </div>
      <span class="art-loading-actions">
        <button class="text-button" @click="cancel">取消</button>
        <button class="text-button" @click="undo">撤销</button>
      </span>
    </div>
    <template v-else>
      <div v-if="art" class="art-thumb">
        <img :src="art.src" :alt="art.name" />
        <div>
          <b>{{ art.name }}</b>
          <small>{{ art.width }} × {{ art.height }} · {{ kb(art.bytes) }}</small>
          <small
            v-if="
              art.original.width !== art.width ||
              art.original.height !== art.height
            "
          >
            原图 {{ art.original.width }} × {{ art.original.height }} ·
            已按显存上限优化
          </small>
        </div>
      </div>
      <p v-else class="muted small art-empty">
        这一面还没有图案。导入图片后可在展开图中缩放、旋转与移动，折起后仍连续贴合。
      </p>
      <div class="art-actions">
        <button class="primary full" :disabled="busy" @click="pick">
          导入图片<span>↥</span>
        </button>
        <button class="ghost full" :disabled="busy" @click="sample">
          贴入示例图案
        </button>
        <input
          ref="input"
          class="visually-hidden"
          type="file"
          accept="image/*"
          aria-label="选择图片"
          @change="onFile"
        />
      </div>
    </template>
    <div v-if="art" class="art-fields">
      <label class="art-field">
        <span>缩放 <b>{{ Math.round(art.transform.scale * 100) }}%</b></span>
        <input
          type="range"
          min="5"
          max="400"
          :value="Math.round(art.transform.scale * 100)"
          @input="updateTransform(doc, { scale: Number(($event.target as HTMLInputElement).value) / 100 })"
        />
      </label>
      <div class="art-nudge">
        <button title="缩小" @click="stepScale(-0.05)">−</button
        ><button title="放大" @click="stepScale(0.05)">＋</button>
      </div>
      <label class="art-field">
        <span>旋转 <b>{{ art.transform.rotation }}°</b></span>
        <input
          type="range"
          min="-180"
          max="180"
          step="1"
          :value="art.transform.rotation"
          @input="updateTransform(doc, { rotation: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
      <div class="art-nudge">
        <button title="逆时针 15°" @click="stepRotation(-15)">↺</button
        ><button title="顺时针 15°" @click="stepRotation(15)">↻</button>
      </div>
      <div class="art-position">
        <span>位置</span
        ><b>X {{ art.transform.x.toFixed(2) }} · Y {{ art.transform.z.toFixed(2) }}</b>
      </div>
      <div class="art-grid">
        <button @click="reset">居中复位</button>
        <button @click="copyAcross">复制到{{ side === "front" ? "背面" : "正面" }}</button>
        <button @click="remove">移除</button>
        <button :disabled="!history" @click="undo">撤销</button>
      </div>
      <p class="muted small">画面与步骤共用纸面坐标；折起后跨折痕的图案保持连续。</p>
      <div class="art-budget">
        <span>贴图占用</span><b>{{ kb(artworkBytes(doc)) }}</b>
      </div>
    </div>
  </section>
</template>
