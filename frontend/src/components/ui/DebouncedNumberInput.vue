<script setup lang="ts">
import { ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";

type Props = {
  modelValue?: number | null;
  min?: number;
  max?: number;
  debounceMs?: number;
  placeholder?: string;
  allowEmpty?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
  debounceMs: 250,
  allowEmpty: true,
});

const emit = defineEmits<{
  (e: "update:modelValue", v: number | undefined): void;
}>();

defineOptions({ inheritAttrs: false });

const draft = ref("");
const focused = ref(false);

function toStr(v: any) {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

function syncFromModel() {
  if (focused.value) return;
  draft.value = toStr(props.modelValue);
}

watch(() => props.modelValue, syncFromModel, { immediate: true });

function parseIntDraft() {
  const raw = String(draft.value ?? "").trim();
  if (!raw) return { kind: "empty" as const };
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return { kind: "invalid" as const };
  return { kind: "number" as const, n };
}

function inRange(n: number) {
  const min = props.min ?? -Infinity;
  const max = props.max ?? Infinity;
  return n >= min && n <= max;
}

function clamp(n: number) {
  const min = props.min ?? n;
  const max = props.max ?? n;
  return Math.min(max, Math.max(min, n));
}

function commitSoft() {
  const p = parseIntDraft();
  if (p.kind === "empty") {
    if (props.allowEmpty) emit("update:modelValue", undefined);
    return;
  }
  if (p.kind === "invalid") return;
  if (!inRange(p.n)) return;
  emit("update:modelValue", p.n);
}

function commitHard() {
  const p = parseIntDraft();
  if (p.kind === "empty") {
    if (props.allowEmpty) emit("update:modelValue", undefined);
    syncFromModel();
    return;
  }
  if (p.kind === "invalid") {
    syncFromModel();
    return;
  }
  const n = clamp(p.n);
  emit("update:modelValue", n);
  draft.value = String(n);
}

const debouncedSoftCommit = useDebounceFn(commitSoft, props.debounceMs);

function onInput(e: Event) {
  draft.value = (e.target as HTMLInputElement).value;
  debouncedSoftCommit();
}

function onFocus() {
  focused.value = true;
}

function onBlur() {
  focused.value = false;
  commitHard();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
}
</script>

<template>
  <input
    v-bind="$attrs"
    class="input"
    inputmode="numeric"
    :value="draft"
    :placeholder="placeholder"
    @input="onInput"
    @focus="onFocus"
    @blur="onBlur"
    @keydown="onKeydown"
  />
</template>
