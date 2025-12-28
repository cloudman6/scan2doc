<template>
  <div class="page-list-container">
    <!-- Selection Toolbar -->
    <div
      v-if="pages.length > 0"
      class="selection-toolbar"
    >
      <NCheckbox
        :checked="isAllSelected"
        :indeterminate="isPartiallySelected"
        size="small"
        @update:checked="handleSelectAll"
      />
      <NButton
        v-if="hasSelection"
        text
        size="tiny"
        circle
        :style="{
          transform: isDeleteHovered ? 'scale(1.1)' : 'scale(1)',
          transition: 'all 0.2s ease'
        }"
        title="Delete selected pages"
        class="delete-selected-btn"
        @click="handleBatchDelete"
        @mouseenter="isDeleteHovered = true"
        @mouseleave="isDeleteHovered = false"
      >
        <template #icon>
          <n-icon
            size="18"
            :color="isDeleteHovered ? '#d03050' : '#666'"
          >
            <TrashOutline />
          </n-icon>
        </template>
      </NButton>
    </div>

    <n-scrollbar class="page-list">
      <draggable
        v-model="localPages"
        item-key="id"
        ghost-class="ghost"
        chosen-class="chosen"
        @end="handleDragEnd"
      >
        <template #item="{ element: page }">
          <PageItem
            :page="page"
            :is-active="page.id === selectedId"
            @click="selectPage"
            @delete="handlePageDeleted"
          />
        </template>
      </draggable>

      <!-- Empty state when no pages -->
      <n-empty
        v-if="localPages.length === 0"
        description="No pages added"
        class="empty-state"
      >
        <template #icon>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line
              x1="12"
              y1="18"
              x2="12"
              y2="12"
            />
            <line
              x1="9"
              y1="15"
              x2="12"
              y2="12"
            />
            <line
              x1="15"
              y1="15"
              x2="12"
              y2="12"
            />
          </svg>
        </template>
      </n-empty>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import draggable from 'vuedraggable'
import { usePagesStore } from '@/stores/pages'
import PageItem from '@/components/page-item/PageItem.vue'
import type { Page } from '@/stores/pages'
import { TrashOutline } from '@vicons/ionicons5'
import { NScrollbar, NEmpty, NCheckbox, NButton, NIcon } from 'naive-ui'

const props = defineProps<{
  pages: Page[]
  selectedId: string | null
}>()

const emit = defineEmits<{
  pageSelected: [page: Page]
  pageDeleted: [page: Page]
  batchDeleted: [pages: Page[]]
}>()

const pagesStore = usePagesStore()
const isDeleteHovered = ref(false)

// Local copy of pages for drag and drop
const localPages = ref<Page[]>([...props.pages])

// Watch for changes in props.pages and update local copy
watch(() => props.pages, (newPages) => {
  localPages.value = [...newPages]
}, { deep: true, immediate: true })

// Computed properties for selection state
const hasSelection = computed(() => pagesStore.selectedPageIds.length > 0)
const isAllSelected = computed(() =>
  props.pages.length > 0 && pagesStore.selectedPageIds.length === props.pages.length
)
const isPartiallySelected = computed(() =>
  pagesStore.selectedPageIds.length > 0 && pagesStore.selectedPageIds.length < props.pages.length
)

function selectPage(page: Page) {
  emit('pageSelected', page)
}

function handlePageDeleted(page: Page) {
  emit('pageDeleted', page)
}

function handleSelectAll(checked: boolean) {
  if (checked) {
    pagesStore.selectAllPages()
  } else {
    pagesStore.clearSelection()
  }
}

function handleBatchDelete() {
  const selectedPages = pagesStore.selectedPages
  if (selectedPages.length > 0) {
    // Emit batch delete event
    emit('batchDeleted', selectedPages)
  }
}

interface DragEndEvent {
  oldIndex: number
  newIndex: number
}

async function handleDragEnd(event: DragEndEvent) {
  const { oldIndex, newIndex } = event

  if (oldIndex !== newIndex) {
    // Create new order mapping
    const newOrder = localPages.value.map((page, index) => ({
      id: page.id,
      order: index
    }))

    // Update store and database
    await pagesStore.reorderPages(newOrder)
  }
}

// Expose nothing for now as currentPage is controlled by parent
defineExpose({})
</script>

<style scoped>
.page-list-container {
  display: flex;
  padding: 8px 0 8px 8px;
  flex-direction: column;
  height: 100%;
}

.selection-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 18px; /* Align with page checkboxes: drag-handle(8px) + checkbox margin-left(8px) */
  border-bottom: 1px solid #f0f0f0;
  min-height: 40px;
}

.delete-selected-btn {
  margin-left: auto;
  margin-right: 8px;
}

.page-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 8px;
  padding: 8px 8px 8px 8px;
  padding-right: 12px; /* Extra space to prevent page item borders from overlapping scrollbar */
}

/* Draggable ghost class for vuedraggable */
.ghost {
  opacity: 0.5;
  background: var(--n-pressed-color);
}

/* Draggable chosen class for vuedraggable */
.chosen {
  cursor: grabbing;
}

.empty-state {
  padding: 32px 16px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>