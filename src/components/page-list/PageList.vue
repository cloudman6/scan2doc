<template>
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
          :is-active="page.id === currentPage?.id"
          @click="selectPage"
          @delete="handlePageDeleted"
        />
      </template>
    </draggable>

    <!-- Empty state when no pages -->
    <n-empty v-if="localPages.length === 0" description="No pages added" class="empty-state">
      <template #icon>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="12" y2="12"/>
          <line x1="15" y1="15" x2="12" y2="12"/>
        </svg>
      </template>
    </n-empty>
  </n-scrollbar>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import draggable from 'vuedraggable'
import { usePagesStore } from '@/stores/pages'
import PageItem from '@/components/page-item/PageItem.vue'
import type { Page } from '@/stores/pages'
import { NScrollbar, NEmpty } from 'naive-ui'

const props = defineProps<{
  pages: Page[]
}>()

const emit = defineEmits<{
  pageSelected: [page: Page]
  pageDeleted: [page: Page]
}>()

const pagesStore = usePagesStore()
const currentPage = ref<Page | null>(props.pages[0] || null)

// Local copy of pages for drag and drop
const localPages = ref<Page[]>([...props.pages])

// Watch for changes in props.pages and update local copy
watch(() => props.pages, (newPages) => {
  // Only update if the arrays are actually different (prevents unnecessary updates)
  if (JSON.stringify(localPages.value.map(p => p.id)) !== JSON.stringify(newPages.map(p => p.id))) {
    localPages.value = [...newPages]
  }
  // Update current page if it's no longer in the list
  if (currentPage.value && !newPages.find(p => p.id === currentPage.value?.id)) {
    currentPage.value = newPages[0] || null
  }
}, { deep: true, immediate: true })

function selectPage(page: Page) {
  currentPage.value = page
  emit('pageSelected', page)
}

function handlePageDeleted(page: Page) {
  emit('pageDeleted', page)
}

async function handleDragEnd(event: any) {
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

// Expose current page for parent components
defineExpose({
  currentPage: computed(() => currentPage.value)
})
</script>

<style scoped>
.page-list {
  display: flex;
  flex-direction: column;
  height: 100%;
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