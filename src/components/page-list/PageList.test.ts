import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import PageList from './PageList.vue'
import PageItem from '@/components/page-item/PageItem.vue'
import { usePagesStore } from '@/stores/pages'
import type { Page } from '@/stores/pages'

// Mock Naive UI components
vi.mock('naive-ui', () => ({
  NScrollbar: {
    name: 'NScrollbar',
    template: '<div><slot></slot></div>'
  },
  NEmpty: {
    name: 'NEmpty',
    props: ['description'],
    template: '<div><slot name="icon"></slot>{{ description }}</div>'
  },
  NCheckbox: {
    name: 'NCheckbox',
    props: ['checked', 'indeterminate', 'size'],
    template: '<input type="checkbox" :checked="checked" @change="$emit(\'update:checked\', $event.target.checked)" />'
  },
  NButton: {
    name: 'NButton',
    template: '<button><slot name="icon"></slot><slot></slot></button>'
  }
}))

// Mock vuedraggable
vi.mock('vuedraggable', () => ({
  default: {
    name: 'draggable',
    props: ['modelValue', 'itemKey'],
    template: '<div><div v-for="(item, index) in modelValue" :key="item[itemKey]"><slot name="item" :element="item" :index="index"></slot></div></div>'
  }
}))

// Mock PageItem
vi.mock('@/components/page-item/PageItem.vue', () => ({
  default: {
    name: 'PageItem',
    props: ['page', 'isActive'],
    template: '<div class="page-item-mock" :class="{ active: isActive }" @click="$emit(\'click\', page)" @delete="$emit(\'delete\', page)">{{ page.fileName }}</div>'
  }
}))

describe('PageList.vue', () => {
  let mockPages: Page[]
  let pinia: any

  beforeEach(() => {
    mockPages = [
      {
        id: 'page-1',
        fileName: 'file1.pdf',
        fileSize: 1024,
        fileType: 'application/pdf',
        origin: 'upload',
        status: 'ready',
        progress: 100,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        outputs: [],
        logs: []
      },
      {
        id: 'page-2',
        fileName: 'file2.pdf',
        fileSize: 2048,
        fileType: 'application/pdf',
        origin: 'upload',
        status: 'ready',
        progress: 100,
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        outputs: [],
        logs: []
      }
    ]

    pinia = createTestingPinia({
      createSpy: vi.fn,
      initialState: {
        pages: {
          selectedPageIds: []
        }
      }
    })
  })

  it('renders a list of pages', () => {
    const wrapper = mount(PageList, {
      props: { pages: mockPages },
      global: {
        plugins: [pinia]
      }
    })

    const items = wrapper.findAll('.page-item-mock')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toBe('file1.pdf')
    expect(items[1].text()).toBe('file2.pdf')
  })

  it('shows empty state when no pages are provided', () => {
    const wrapper = mount(PageList, {
      props: { pages: [] },
      global: {
        plugins: [pinia]
      }
    })

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.find('.empty-state').text()).toContain('No pages added')
  })

  it('marks the first page as active by default', () => {
    const wrapper = mount(PageList, {
      props: { pages: mockPages },
      global: {
        plugins: [pinia]
      }
    })

    const items = wrapper.findAll('.page-item-mock')
    expect(items[0].classes()).toContain('active')
    expect(items[1].classes()).not.toContain('active')
  })

  it('emits pageSelected and updates active state when a page is clicked', async () => {
    const wrapper = mount(PageList, {
      props: { pages: mockPages },
      global: {
        plugins: [pinia]
      }
    })

    const pageItems = wrapper.findAllComponents({ name: 'PageItem' })
    // Click second item
    await pageItems[1].trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('pageSelected')).toBeTruthy()
    const emittedPage = wrapper.emitted('pageSelected')![0][0] as Page
    expect(emittedPage.id).toBe(mockPages[1].id)
  })

  it('emits pageDeleted when delete event is received from PageItem', async () => {
    const wrapper = mount(PageList, {
      props: { pages: mockPages },
      global: {
        plugins: [pinia]
      }
    })

    const firstItem = wrapper.findComponent({ name: 'PageItem' })
    await firstItem.vm.$emit('delete', mockPages[0])

    expect(wrapper.emitted('pageDeleted')).toBeTruthy()
    expect(wrapper.emitted('pageDeleted')![0]).toEqual([mockPages[0]])
  })

  it('handles batch selection (select all / clear selection)', async () => {
    const wrapper = mount(PageList, {
      props: { pages: mockPages },
      global: {
        plugins: [pinia]
      }
    })

    const store = usePagesStore()

    // Select all
    const checkboxComponent = wrapper.findComponent({ name: 'NCheckbox' })
    await checkboxComponent.vm.$emit('update:checked', true)
    expect(store.selectAllPages).toHaveBeenCalled()

    // Clear selection
    await checkboxComponent.vm.$emit('update:checked', false)
    expect(store.clearSelection).toHaveBeenCalled()
  })

  it('shows batch delete button only when pages are selected', async () => {
    const wrapper = mount(PageList, {
      props: { pages: mockPages },
      global: {
        plugins: [pinia]
      }
    })

    // Initially no selection
    expect(wrapper.find('.delete-selected-btn').exists()).toBe(false)

    // Select some pages
    const store = usePagesStore()
    // @ts-ignore
    store.selectedPageIds = ['page-1']
    
    // We need to trigger a re-render because createTestingPinia doesn't always 
    // trigger reactive updates automatically depending on how it's used.
    // In Vue 3, computed based on pinia state should update.
    await wrapper.vm.$nextTick()
    
    // Since we are using createTestingPinia, we might need to update the prop or state manually if it's not reactive.
    // Actually, createTestingPinia makes state reactive if stubActions is false, but default is true.
    // Let's just re-mount with initial state to be sure or use a real store if needed.
    
    const selectedPinia = createTestingPinia({
      initialState: {
        pages: {
          selectedPageIds: ['page-1']
        }
      }
    })
    
    const wrapper2 = mount(PageList, {
      props: { pages: mockPages },
      global: {
        plugins: [selectedPinia]
      }
    })
    
    expect(wrapper2.find('.delete-selected-btn').exists()).toBe(true)
  })

  it('emits batchDeleted with selected pages when batch delete button is clicked', async () => {
    const selectedPinia = createTestingPinia({
      initialState: {
        pages: {
          selectedPageIds: ['page-1', 'page-2']
        }
      },
      stubActions: false // Allow getters like selectedPages to work if they exist
    })

    // Manually mock the getter for testing purpose as createTestingPinia handles state but getters might need help
    const store = usePagesStore(selectedPinia)
    // @ts-ignore
    Object.defineProperty(store, 'selectedPages', {
      get: () => mockPages
    })

    const wrapper = mount(PageList, {
      props: { pages: mockPages },
      global: {
        plugins: [selectedPinia]
      }
    })

    await wrapper.find('.delete-selected-btn').trigger('click')
    expect(wrapper.emitted('batchDeleted')).toBeTruthy()
    expect(wrapper.emitted('batchDeleted')![0]).toEqual([mockPages])
  })

  it('updates local pages when props pages change', async () => {
    const wrapper = mount(PageList, {
      props: { pages: mockPages },
      global: { plugins: [pinia] }
    })

    const newPages = [...mockPages, { ...mockPages[0], id: 'page-3' }]
    await wrapper.setProps({ pages: newPages })
    
    expect(wrapper.findAllComponents({ name: 'PageItem' })).toHaveLength(3)
  })

  it('resets current page if it is removed from pages prop', async () => {
    const wrapper = mount(PageList, {
      props: { pages: mockPages },
      global: { plugins: [pinia] }
    })

    // Click second page to make it active
    const pageItems = wrapper.findAllComponents({ name: 'PageItem' })
    await pageItems[1].trigger('click')
    await wrapper.vm.$nextTick()
    
    // Check emitted event instead of internal state
    expect(wrapper.emitted('pageSelected')![0][0].id).toBe('page-2')

    // Remove page-2 from props
    await wrapper.setProps({ pages: [mockPages[0]] })
    await wrapper.vm.$nextTick()
    
    // Check if first page is now active
    const updatedItems = wrapper.findAllComponents({ name: 'PageItem' })
    expect(updatedItems).toHaveLength(1)
    expect(updatedItems[0].props('isActive')).toBe(true)
  })

  it('calls reorderPages when drag ends at a different index', async () => {
    const wrapper = mount(PageList, {
      props: { pages: mockPages },
      global: { plugins: [pinia] }
    })

    const store = usePagesStore()
    const draggable = wrapper.findComponent({ name: 'draggable' })
    
    // Simulate reordering
    await draggable.vm.$emit('end', { oldIndex: 0, newIndex: 1 })
    
    expect(store.reorderPages).toHaveBeenCalled()
    const callArgs = vi.mocked(store.reorderPages).mock.calls[0][0]
    expect(callArgs).toHaveLength(2)
    expect(callArgs[0].id).toBe('page-1')
  })

  it('does not call reorderPages if drag ends at same index', async () => {
    const wrapper = mount(PageList, {
      props: { pages: mockPages },
      global: { plugins: [pinia] }
    })

    const store = usePagesStore()
    const draggable = wrapper.findComponent({ name: 'draggable' })
    
    await draggable.vm.$emit('end', { oldIndex: 1, newIndex: 1 })
    
    expect(store.reorderPages).not.toHaveBeenCalled()
  })

  it('handles batch delete button hover state', async () => {
    const selectedPinia = createTestingPinia({
      initialState: { pages: { selectedPageIds: ['page-1'] } }
    })
    const wrapper = mount(PageList, {
      props: { pages: mockPages },
      global: { plugins: [selectedPinia] }
    })

    const deleteBtn = wrapper.find('.delete-selected-btn')
    const img = deleteBtn.find('img')
    
    // Initial state
    expect(img.attributes('src')).toContain('delete.svg')
    
    // Hover
    await deleteBtn.trigger('mouseenter')
    expect(img.attributes('src')).toContain('delete_red.svg')
    
    // Leave
    await deleteBtn.trigger('mouseleave')
    expect(img.attributes('src')).toContain('delete.svg')
  })

  it('renders empty state with icon when no pages', () => {
    const wrapper = mount(PageList, {
      props: { pages: [] },
      global: { plugins: [pinia] }
    })

    const empty = wrapper.findComponent({ name: 'NEmpty' })
    expect(empty.exists()).toBe(true)
    // Check if SVG icon in slot is rendered
    expect(wrapper.find('svg').exists()).toBe(true)
  })
})
