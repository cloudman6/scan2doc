<template>
  <n-modal
    :show="show"
    preset="dialog"
    :title="title"
    :positive-text="confirmText"
    negative-text="Cancel"
    @update:show="$emit('update:show', $event)"
    @positive-click="handleSubmit"
    @negative-click="$emit('update:show', false)"
  >
    <div class="ocr-input-content">
      <n-input
        v-model:value="inputValue"
        type="textarea"
        :placeholder="placeholder"
        :rows="3"
        autofocus
        @keydown.enter.prevent="handleSubmit"
      />
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NModal, NInput } from 'naive-ui'
import type { OCRPromptType } from '@/services/ocr'

interface Props {
  show: boolean
  mode: OCRPromptType
}

interface Emits {
  (e: 'update:show', v: boolean): void
  (e: 'submit', value: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const inputValue = ref('')

const isFind = computed(() => props.mode === 'find')

const title = computed(() => isFind.value ? 'Locate Object' : 'Custom Prompt')
const placeholder = computed(() => isFind.value 
  ? 'Enter the object name to locate (e.g., "signature", "red stamp")' 
  : 'Enter your custom prompt for the OCR model'
)
const confirmText = computed(() => isFind.value ? 'Locate' : 'Run OCR')

// Reset input when opening
watch(() => props.show, (val) => {
  if (val) {
    inputValue.value = ''
  }
})

function handleSubmit() {
  if (!inputValue.value.trim()) return
  emit('submit', inputValue.value)
  emit('update:show', false)
}
</script>

<style scoped>
.ocr-input-content {
  margin-top: 12px;
}
</style>
