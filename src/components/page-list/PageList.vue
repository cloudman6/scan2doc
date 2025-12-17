<template>
  <div class="page-list">
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import draggable from 'vuedraggable'
import { usePagesStore } from '@/stores/pages'
import PageItem from '@/components/page-item/PageItem.vue'
import type { Page } from '@/stores/pages'

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
  gap: 8px;
}

/* Draggable ghost class for vuedraggable */
.ghost {
  opacity: 0.5;
  background: #e5e7eb;
}

/* Draggable chosen class for vuedraggable */
.chosen {
  cursor: grabbing;
}
</style>