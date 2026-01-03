<template>
  <div class="ocr-mode-selector">
    <n-button-group size="small">
      <n-button
        :type="buttonType"
        :loading="loading"
        :disabled="disabled"
        class="trigger-btn"
        @click="handleMainClick"
      >
        <template #icon>
          <n-icon>
            <component :is="currentIcon" />
          </n-icon>
        </template>
        {{ currentLabel }}
      </n-button>
      <n-dropdown
        trigger="click"
        :options="menuOptions"
        @select="handleSelect"
      >
        <n-button
          :type="buttonType"
          :disabled="disabled"
          class="dropdown-trigger"
        >
          <template #icon>
            <n-icon>
              <ChevronDownOutline />
            </n-icon>
          </template>
        </n-button>
      </n-dropdown>
    </n-button-group>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { NButton, NButtonGroup, NDropdown, NIcon } from 'naive-ui'
import type { DropdownOption } from 'naive-ui'
import { 
  DocumentTextOutline, 
  ScanOutline, 
  TextOutline, 
  ImageOutline, 
  ChatboxEllipsesOutline,
  SearchOutline,
  CreateOutline,
  ChevronDownOutline
} from '@vicons/ionicons5'
import type { OCRPromptType } from '@/services/ocr'

interface Props {
  loading?: boolean
  disabled?: boolean
}

interface Emits {
  (e: 'run', mode: OCRPromptType): void
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  disabled: false
})

const emit = defineEmits<Emits>()

const selectedMode = ref<OCRPromptType>('document')

const MODE_CONFIG: Record<OCRPromptType, { label: string, icon: import('vue').Component }> = {
  document: { label: 'Scan to Document', icon: DocumentTextOutline },
  ocr: { label: 'General OCR', icon: ScanOutline },
  free: { label: 'Extract Raw Text', icon: TextOutline },
  figure: { label: 'Parse Figure', icon: ImageOutline },
  describe: { label: 'Describe Image', icon: ChatboxEllipsesOutline },
  find: { label: 'Locate Object', icon: SearchOutline },
  freeform: { label: 'Custom Prompt', icon: CreateOutline }
}

const currentLabel = computed(() => MODE_CONFIG[selectedMode.value].label)
const currentIcon = computed(() => MODE_CONFIG[selectedMode.value].icon)
const buttonType = computed(() => props.loading ? 'info' : 'primary')

const menuOptions = computed<DropdownOption[]>(() => {
  return (Object.keys(MODE_CONFIG) as OCRPromptType[]).map(key => ({
    label: MODE_CONFIG[key].label,
    key: key,
    icon: () => h(NIcon, null, { default: () => h(MODE_CONFIG[key].icon) })
  }))
})

function handleMainClick() {
  emit('run', selectedMode.value)
}

function handleSelect(key: OCRPromptType) {
  selectedMode.value = key
  emit('run', key)
}
</script>

<style scoped>
.ocr-mode-selector {
  display: inline-flex;
}
</style>
