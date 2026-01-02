<template>
  <div class="ocr-queue-container">
    <!-- Header -->
    <div class="queue-header">
      <div class="header-title">
        <span class="title-text">OCR Queue</span>
        <n-badge
          :value="store.ocrTaskCount"
          type="success"
        />
      </div>
      <div class="header-actions">
        <!-- Remove Selected -->
        <n-button
          v-if="hasSelection"
          size="tiny"
          type="error"
          secondary
          class="action-btn"
          @click="handleStopSelected"
        >
          <template #icon>
            <n-icon><CloseCircleOutline /></n-icon>
          </template>
          Cancel Selected
        </n-button>
        
        <!-- Remove All -->
        <n-button
          v-if="store.ocrTaskCount > 0"
          size="tiny"
          type="error"
          quaternary
          class="action-btn"
          @click="handleStopAll"
        >
          Cancel All
        </n-button>
      </div>
    </div>

    <!-- Task List -->
    <n-scrollbar style="max-height: 300px">
      <div
        v-if="store.ocrTaskCount === 0"
        class="empty-state"
      >
        <n-empty
          description="No active OCR tasks"
          size="small"
        />
      </div>
      
      <div
        v-else
        class="task-list"
      >
        <!-- Toolbar (Check All) -->
        <div class="list-toolbar">
          <n-checkbox
            :checked="isAllSelected"
            :indeterminate="isPartiallySelected"
            size="small"
            @update:checked="handleSelectAll"
          >
            Select All
          </n-checkbox>
        </div>

        <!-- Processing Tasks -->
        <div
          v-for="page in store.activeOCRTasks"
          :key="page.id"
          class="task-item processing"
        >
          <n-checkbox 
            :checked="selectedIds.has(page.id)"
            @update:checked="(v) => handleItemSelect(page.id, v)"
          />
          <div class="task-info">
            <n-spin size="small" />
            <div class="file-details">
              <span class="file-name">{{ page.fileName }}</span>
              <span class="status-text">Recognizing...</span>
            </div>
          </div>
          <n-button
            size="tiny"
            circle
            quaternary
            type="error"
            @click="handleStopSingle(page.id)"
          >
            <template #icon>
              <n-icon><CloseCircleOutline /></n-icon>
            </template>
          </n-button>
        </div>

        <!-- Queued Tasks -->
        <div
          v-for="page in store.queuedOCRTasks"
          :key="page.id"
          class="task-item queued"
        >
          <n-checkbox 
            :checked="selectedIds.has(page.id)"
            @update:checked="(v) => handleItemSelect(page.id, v)"
          />
          <div class="task-info">
            <n-icon
              size="18"
              color="#666"
            >
              <TimeOutline />
            </n-icon>
            <div class="file-details">
              <span class="file-name">{{ page.fileName }}</span>
              <span class="status-text">Waiting...</span>
            </div>
          </div>
          <n-button
            size="tiny"
            circle
            quaternary
            @click="handleStopSingle(page.id)"
          >
            <template #icon>
              <n-icon><CloseCircleOutline /></n-icon>
            </template>
          </n-button>
        </div>
      </div>
    </n-scrollbar>

    <!-- Footer -->
    <div class="queue-footer">
      <n-button
        size="small"
        block
        secondary
        @click="$emit('close')"
      >
        Close
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePagesStore } from '@/stores/pages'
import { NButton, NIcon, NBadge, NScrollbar, NEmpty, NCheckbox, NSpin, createDiscreteApi } from 'naive-ui'
import { CloseCircleOutline, TimeOutline } from '@vicons/ionicons5'

const store = usePagesStore()
const { message } = createDiscreteApi(['message'])

const emit = defineEmits<{
  (e: 'close'): void
}>()

// Local selection state
const selectedIds = ref<Set<string>>(new Set())

// Computed
const allTaskIds = computed(() => [
  ...store.activeOCRTasks.map(p => p.id),
  ...store.queuedOCRTasks.map(p => p.id)
])

const hasSelection = computed(() => selectedIds.value.size > 0)
const isAllSelected = computed(() => allTaskIds.value.length > 0 && selectedIds.value.size === allTaskIds.value.length)
const isPartiallySelected = computed(() => selectedIds.value.size > 0 && selectedIds.value.size < allTaskIds.value.length)

// Actions
function handleItemSelect(id: string, checked: boolean) {
  if (checked) {
    selectedIds.value.add(id)
  } else {
    selectedIds.value.delete(id)
  }
}

function handleSelectAll(checked: boolean) {
  if (checked) {
    allTaskIds.value.forEach(id => selectedIds.value.add(id))
  } else {
    selectedIds.value.clear()
  }
}

async function handleStopSingle(id: string) {
  await store.cancelOCRTasks([id])
  selectedIds.value.delete(id)
  message.info('Task cancelled')
}

// Unified action for "Remove Selected" (Batch)
async function handleStopSelected() {
  const ids = Array.from(selectedIds.value)
  if (ids.length === 0) return

  await store.cancelOCRTasks(ids)
  selectedIds.value.clear()
  message.success(`${ids.length} tasks cancelled`)
}

// Remove All
async function handleStopAll() {
  await store.cancelOCRTasks(allTaskIds.value)
  selectedIds.value.clear()
  message.success('All tasks cancelled')
}

defineExpose({
  selectedIds,
  allTaskIds,
  isAllSelected,
  isPartiallySelected,
  handleStopAll,
  handleStopSelected,
  handleStopSingle,
  handleSelectAll,
  handleItemSelect
})
</script>

<style scoped>
.ocr-queue-container {
  width: 400px;
  background: white;
  display: flex;
  flex-direction: column;
}

.queue-header {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.list-toolbar {
  padding: 8px 16px;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
}

.task-list {
  display: flex;
  flex-direction: column;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #f9f9f9;
  transition: background 0.2s;
}

.task-item:hover {
  background: #fdfdfd;
}

.task-item.processing {
  background: #f0fdf4; /* Green tint */
}

.task-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.file-details {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-text {
  font-size: 11px;
  color: #666;
}

.queue-footer {
  padding: 8px 16px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
}

.empty-state {
  padding: 40px 0;
}
</style>
