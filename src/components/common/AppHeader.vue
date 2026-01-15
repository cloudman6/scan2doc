<template>
  <NLayoutHeader
    data-testid="app-header"
    class="app-header"
    bordered
  >
    <!-- Left: Branding -->
    <div class="header-brand">
      <NIcon
        size="24"
        :color="PRIMARY_COLOR"
        class="brand-icon"
      >
        <DocumentText />
      </NIcon>
      <span
        class="app-title"
        data-testid="app-title"
      >
        {{ $t('header.scan2Doc') }}
      </span>
    </div>

    <!-- Center: OCR Queue Status -->
    <div class="header-center">
      <NPopover
        v-if="store.ocrTaskCount > 0 || showQueue"
        v-model:show="showQueue"
        trigger="click"
        placement="bottom"
        :show-arrow="false"
        raw
      >
        <template #trigger>
          <div
            v-show="store.ocrTaskCount > 0"
            class="status-pill"
            data-testid="ocr-queue-badge"
          >
            <NSpin
              size="small"
              :stroke-width="20"
              class="status-spinner"
            />
            <span class="status-text">
              {{ $t('header.processing') }}: {{ store.activeOCRTasks.length }} | {{ $t('header.waiting') }}: {{ store.queuedOCRTasks.length }}
            </span>
          </div>
        </template>
        <OCRQueuePopover @close="showQueue = false" />
      </NPopover>
    </div>

    <!-- Right: Actions -->
    <div class="header-actions">
      <!-- Language Selector -->
      <LanguageSelector />

      <!-- Page Count Badge -->
      <NTag
        v-if="pageCount > 0"
        round
        :bordered="false"
        type="info"
        size="small"
        class="page-count-badge"
        data-testid="page-count-badge"
      >
        {{ pageCountText }}
      </NTag>

      <!-- Primary CTA -->
      <NButton
        type="primary"
        size="medium"
        class="add-btn"
        data-testid="import-files-button"
        @click="handleAddFiles"
      >
        <template #icon>
          <NIcon>
            <CloudUpload />
          </NIcon>
        </template>
        {{ $t('header.importFiles') }}
      </NButton>
    </div>
  </NLayoutHeader>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NLayoutHeader, NButton, NIcon, NTag, NPopover, NSpin } from 'naive-ui'
import { DocumentText, CloudUpload } from '@vicons/ionicons5'
import { usePagesStore } from '@/stores/pages'
import OCRQueuePopover from '@/components/common/OCRQueuePopover.vue'
import LanguageSelector from '@/components/common/LanguageSelector.vue'
import { PRIMARY_COLOR } from '@/theme/vars'

const props = defineProps<{
  pageCount: number
}>()

const emit = defineEmits<{
  (e: 'add-files'): void
}>()

const { t } = useI18n()
const store = usePagesStore()
const showQueue = ref(false)

const pageCountText = computed(() => {
  return props.pageCount > 1
    ? t('header.pagesLoaded', [props.pageCount])
    : t('header.pageLoaded', [props.pageCount])
})

const handleAddFiles = () => {
  emit('add-files')
}

defineExpose({
  showQueue,
  handleAddFiles
})
</script>

<style scoped>
.app-header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background-color: #f6f7f8;
  position: relative; /* For absolute center positioning */
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  user-select: none;
  z-index: 1;
}

.brand-icon {
  display: flex;
}

.app-title {
  font-size: 18px;
  font-weight: 700;
  color: #333;
  letter-spacing: -0.5px;
}

.header-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  z-index: 2;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 20px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #333;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  transition: all 0.2s;
}

.status-pill:hover {
  background: #fafafa;
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
}

.status-spinner {
  --n-size: 14px !important;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 1;
}

.page-count-badge {
  font-weight: 600;
}
</style>
