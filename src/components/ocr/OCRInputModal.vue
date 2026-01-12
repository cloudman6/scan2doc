<template>
  <NModal
    :show="show"
    preset="dialog"
    :title="title"
    :positive-text="confirmText"
    :negative-text="t('common.cancel')"
    @update:show="$emit('update:show', $event)"
    @positive-click="handleSubmit"
    @negative-click="$emit('update:show', false)"
  >
    <div class="ocr-input-content">
      <NInput
        v-model:value="inputValue"
        type="textarea"
        :placeholder="placeholder"
        :rows="3"
        autofocus
        @keydown.enter.prevent="handleSubmit"
      />
    </div>
  </NModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
const inputValue = ref('')

const isFind = computed(() => props.mode === 'find')

const title = computed(() => isFind.value ? t('ocrInputModal.locateObject') : t('ocrInputModal.customPrompt'))
const placeholder = computed(() => isFind.value
  ? t('ocrInputModal.locatePlaceholder')
  : t('ocrInputModal.promptPlaceholder')
)
const confirmText = computed(() => isFind.value ? t('ocrInputModal.locate') : t('ocrInputModal.runOCR'))

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
