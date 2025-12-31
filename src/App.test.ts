import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { ComponentPublicInstance } from 'vue'
import App from './App.vue'
import type { Page } from '@/stores/pages'

import { createDiscreteApi } from 'naive-ui'
import { uiLogger } from '@/utils/logger'

// Helper types for testing
interface AppInstance extends ComponentPublicInstance {
  selectedPageId: string | null
  pageCountText: string
  handlePageSelected: (page: Page) => void
  handlePageDeleted: (page: Page) => Promise<void>
  handleBatchDeleted: (pages: Page[]) => Promise<void>
  handleFileAdd: () => Promise<void>
  handleDrop: (event: DragEvent) => Promise<void>
  handleDragOver: (event: DragEvent) => void
  showToast: (message: string, type: string, onUndo?: () => Promise<void>) => void
  pageListRef: { currentPage: Page } | null
}

interface MockStore {
  pages: Partial<Page>[]
  selectedPageIds: string[]
  loadPagesFromDB: ReturnType<typeof vi.fn>
  deletePages: ReturnType<typeof vi.fn>
  deletePagesFromDB: ReturnType<typeof vi.fn>
  undoDelete: ReturnType<typeof vi.fn>
  clearSelection: ReturnType<typeof vi.fn>
  addFiles: ReturnType<typeof vi.fn>
}

interface MockDiscreteApi {
  message: {
    error: ReturnType<typeof vi.fn>
    success: ReturnType<typeof vi.fn>
    info: ReturnType<typeof vi.fn>
  }
}

// Polyfill CSS.supports for jsdom
if (typeof window !== 'undefined') {
  if (!window.CSS) {
    (window as any).CSS = { supports: () => false };
  } else if (!window.CSS.supports) {
    (window as any).CSS.supports = () => false;
  }
}

// Mock ALL Naive UI components
vi.mock('naive-ui', async () => {
  const actual = await vi.importActual('naive-ui')
  return {
    ...actual,
    NLayout: { template: '<div class="n-layout-mock"><slot /></div>' },
    NLayoutHeader: { template: '<div class="n-layout-header-mock"><slot /></div>' },
    NLayoutSider: {
      props: ['collapsed'],
      template: '<div class="n-layout-sider-mock" :class="{ collapsed }"><slot /><slot name="trigger" :collapsed="collapsed" /></div>'
    },
    NSpace: { template: '<div class="n-space-mock"><slot /></div>' },
    NButton: { template: '<button class="n-button-mock"><slot /></button>' },
    NText: { template: '<span class="n-text-mock"><slot /></span>' },
    NTooltip: { template: '<div class="n-tooltip-mock"><slot name="trigger" /><slot /></div>' },
    createDiscreteApi: vi.fn(() => ({
      message: {
        error: vi.fn(),
        success: vi.fn(),
        info: vi.fn()
      },
      dialog: {
        warning: vi.fn(({ onPositiveClick }) => {
          if (onPositiveClick) onPositiveClick()
        })
      }
    }))
  }
})

// Mock child components
vi.mock('./components/page-list/PageList.vue', () => ({
  default: {
    name: 'PageList',
    template: '<div class="page-list-mock"></div>',
    props: ['pages', 'currentPage']
  }
}))


vi.mock('./components/preview/Preview.vue', () => ({
  default: {
    name: 'Preview',
    template: '<div class="preview-mock"></div>',
    props: ['currentPage']
  }
}))

vi.mock('./components/page-viewer/PageViewer.vue', () => ({
  default: {
    name: 'PageViewer',
    template: '<div class="page-viewer-mock"></div>',
    props: ['currentPage']
  }
}))

import { reactive } from 'vue'

// Mock Store Instance
const mockStore: MockStore = reactive({
  pages: [],
  selectedPageIds: [],
  loadPagesFromDB: vi.fn(),
  deletePages: vi.fn(),
  deletePagesFromDB: vi.fn(),
  undoDelete: vi.fn(),
  clearSelection: vi.fn(),
  addFiles: vi.fn()
})

vi.mock('./stores/pages', () => ({
  usePagesStore: vi.fn(() => mockStore)
}))

// Mock Logger
vi.mock('@/utils/logger', () => ({
  uiLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

// Mock PDF Service
vi.mock('./services/pdf', () => ({
  pdfService: {
    resumeProcessing: vi.fn(() => Promise.resolve())
  }
}))

describe('App.vue', () => {
  let mockMessage: MockDiscreteApi['message']

  beforeEach(() => {
    setActivePinia(createPinia())

    // Reset store data strictly
    mockStore.pages = []
    mockStore.selectedPageIds = []

    mockStore.loadPagesFromDB.mockReset()
    mockStore.loadPagesFromDB.mockResolvedValue(undefined)

    // reset others
    if (mockStore.deletePages.mockReset) mockStore.deletePages.mockReset()
    if (mockStore.deletePagesFromDB.mockReset) mockStore.deletePagesFromDB.mockReset()
    mockStore.deletePagesFromDB.mockResolvedValue(undefined)

    if (mockStore.undoDelete.mockReset) mockStore.undoDelete.mockReset()
    if (mockStore.addFiles.mockReset) mockStore.addFiles.mockReset()
    if (mockStore.clearSelection.mockReset) mockStore.clearSelection.mockReset()


    mockMessage = {
      error: vi.fn(),
      success: vi.fn(),
      info: vi.fn()
    }
    const mockDialog = {
      warning: vi.fn(({ onPositiveClick }) => {
        if (onPositiveClick) onPositiveClick()
      })
    }
    vi.mocked(createDiscreteApi).mockReturnValue({ message: mockMessage, dialog: mockDialog } as any)

    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('mounts and loads pages from DB', async () => {
    mount(App)
    await flushPromises()
    expect(mockStore.loadPagesFromDB).toHaveBeenCalled()
  })

  it('handles page selection correctly', async () => {
    mockStore.pages = [
      { id: 'p1', fileName: 'f1.png' },
      { id: 'p2', fileName: 'f2.png' }
    ]
    mockStore.selectedPageIds = ['p1']

    const wrapper = mount(App)
    const page: Partial<Page> = { id: 'p2', fileName: 'f2.png' }

      ; (wrapper.vm as AppInstance).handlePageSelected(page as Page)

    expect(mockStore.clearSelection).toHaveBeenCalled()
    expect((wrapper.vm as AppInstance).selectedPageId).toBe('p2')
  })

  it('handles page selection for already selected page', async () => {
    const page: Partial<Page> = { id: 'p1', fileName: 'f1.png' }
    mockStore.pages = [page]
    mockStore.selectedPageIds = ['p1']

    const wrapper = mount(App)
      ; (wrapper.vm as AppInstance).handlePageSelected(page as Page)

    expect(mockStore.selectedPageIds).toEqual(['p1'])
    expect(mockStore.clearSelection).not.toHaveBeenCalled()
  })

  describe('Deletions and Undo', () => {
    const mockPage: Partial<Page> = { id: 'p1', fileName: 'test.png' }

    beforeEach(() => {
      mockStore.pages = [mockPage]
    })

    it('handles single page deletion after confirmation', async () => {
      mockStore.deletePages.mockReturnValue(mockPage)
      const mockDialog = {
        warning: vi.fn(({ onPositiveClick }) => {
          if (onPositiveClick) onPositiveClick()
        })
      }
      vi.mocked(createDiscreteApi).mockReturnValue({ message: mockMessage, dialog: mockDialog } as any)

      const wrapper = mount(App)

      await (wrapper.vm as AppInstance).handlePageDeleted(mockPage as Page)

      expect(mockDialog.warning).toHaveBeenCalled()
      expect(mockStore.deletePages).toHaveBeenCalledWith(['p1'])
      expect(mockStore.deletePagesFromDB).toHaveBeenCalledWith(['p1'])
      expect(mockMessage.success).toHaveBeenCalledWith('Page "test.png" deleted')
    })

    it('handles batch deletion after confirmation', async () => {
      const pages: Partial<Page>[] = [mockPage, { id: 'p2', fileName: 'p2.png' }]
      mockStore.deletePages.mockReturnValue(pages)
      const mockDialog = {
        warning: vi.fn(({ onPositiveClick }) => {
          if (onPositiveClick) onPositiveClick()
        })
      }
      vi.mocked(createDiscreteApi).mockReturnValue({ message: mockMessage, dialog: mockDialog } as any)

      const wrapper = mount(App)

      await (wrapper.vm as AppInstance).handleBatchDeleted(pages as Page[])

      expect(mockDialog.warning).toHaveBeenCalled()
      expect(mockMessage.success).toHaveBeenCalledWith('2 pages deleted')
    })

    it('handles deletion cancel', async () => {
      const mockDialog = {
        warning: vi.fn(({ onNegativeClick }) => {
          if (onNegativeClick) onNegativeClick()
        })
      }
      vi.mocked(createDiscreteApi).mockReturnValue({ message: mockMessage, dialog: mockDialog } as any)

      const wrapper = mount(App)
      await (wrapper.vm as AppInstance).handlePageDeleted(mockPage as Page)

      expect(mockStore.deletePages).not.toHaveBeenCalled()
    })

    it('updates selectedPageId if current page is deleted', async () => {
      const p1 = { id: 'p1', fileName: 'f1' }
      const p2 = { id: 'p2', fileName: 'f2' }
      mockStore.pages = [p1, p2]
      mockStore.deletePages.mockReturnValue(p1)

      const wrapper = mount(App)
        ; (wrapper.vm as any).selectedPageId = 'p1'

      // We need to simulate the dialog confirm
      const mockDialog = {
        warning: vi.fn(({ onPositiveClick }) => {
          if (onPositiveClick) onPositiveClick()
        })
      }
      vi.mocked(createDiscreteApi).mockReturnValue({ message: mockMessage, dialog: mockDialog } as any)

      // Remove p1 from mock store so that the watch/logic can find the next one
      mockStore.pages = [p2]

      await (wrapper.vm as any).handlePageDeleted(p1 as Page)

      expect((wrapper.vm as any).selectedPageId).toBe('p2')
    })

    it('handles deletion error', async () => {
      const mockPage: Partial<Page> = { id: 'p1', fileName: 'test.png' }
      mockStore.deletePages.mockReturnValue(mockPage)
      mockStore.deletePagesFromDB.mockRejectedValue(new Error('Delete DB failed'))
      const mockDialog = {
        warning: vi.fn(({ onPositiveClick }) => {
          if (onPositiveClick) onPositiveClick()
        })
      }
      vi.mocked(createDiscreteApi).mockReturnValue({ message: mockMessage, dialog: mockDialog } as any)

      const wrapper = mount(App)

      await (wrapper.vm as AppInstance).handlePageDeleted(mockPage as Page)

      expect(mockMessage.error).toHaveBeenCalledWith('Failed to delete page')
      expect(uiLogger.error).toHaveBeenCalled()
    })
  })

  describe('File Management', () => {
    it('handles handleFileAdd success', async () => {
      const mockPage: Partial<Page> = { id: 'new-p', fileName: 'new.png' }
      mockStore.addFiles.mockResolvedValue({
        success: true,
        pages: [mockPage]
      })

      const wrapper = mount(App)
      await (wrapper.vm as AppInstance).handleFileAdd()

      // Store updated, computed should update
      expect((wrapper.vm as AppInstance).selectedPageId).toBe('new-p')
    })

    it('handles handleFileAdd with multiple files', async () => {
      mockStore.addFiles.mockResolvedValue({
        success: true,
        pages: [{ id: 'p1' }, { id: 'p2' }]
      })

      const wrapper = mount(App)
      await (wrapper.vm as AppInstance).handleFileAdd()

      expect(mockStore.addFiles).toHaveBeenCalled()
    })

    it('handles handleFileAdd cancellation', async () => {
      mockStore.addFiles.mockResolvedValue({
        success: false,
        error: 'No files selected'
      })

      const wrapper = mount(App)
      await (wrapper.vm as AppInstance).handleFileAdd()

      expect(mockMessage.error).not.toHaveBeenCalled()
    })

    it('handles handleFileAdd error', async () => {
      mockStore.addFiles.mockResolvedValue({
        success: false,
        error: 'Unsupported type'
      })

      const wrapper = mount(App)
      await (wrapper.vm as AppInstance).handleFileAdd()

      expect(mockMessage.error).toHaveBeenCalledWith('Unsupported type')
    })

    it('handles handleFileAdd throw', async () => {
      mockStore.addFiles.mockRejectedValue(new Error('Crash'))
      const wrapper = mount(App)
      await (wrapper.vm as AppInstance).handleFileAdd()

      expect(mockMessage.error).toHaveBeenCalledWith('Add failed. Please try again.')
    })

    it('handles handleDrop', async () => {
      const mockPage: Partial<Page> = { id: 'dropped-p', fileName: 'drop.png' }
      mockStore.addFiles.mockResolvedValue({
        success: true,
        pages: [mockPage]
      })

      const wrapper = mount(App)
      const event: Partial<DragEvent> = {
        preventDefault: vi.fn(),
        dataTransfer: {
          files: [new File([], 'drop.png')]
        } as unknown as DataTransfer
      }

      await (wrapper.vm as AppInstance).handleDrop(event as DragEvent)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockStore.addFiles).toHaveBeenCalled()
    })

    it('handles handleDrop with zero files', async () => {
      const wrapper = mount(App)
      const event: Partial<DragEvent> = {
        preventDefault: vi.fn(),
        dataTransfer: {
          files: []
        } as unknown as DataTransfer
      }
      await (wrapper.vm as AppInstance).handleDrop(event as DragEvent)
      expect(mockStore.addFiles).not.toHaveBeenCalled()
    })

    it('handleDragOver prevents default', () => {
      const wrapper = mount(App)
      const event: Partial<DragEvent> = { preventDefault: vi.fn() }
        ; (wrapper.vm as AppInstance).handleDragOver(event as DragEvent)
      expect(event.preventDefault).toHaveBeenCalled()
    })
  })

  it('handles resume processing error', async () => {
    const { pdfService } = await import('./services/pdf')
    vi.mocked(pdfService.resumeProcessing).mockRejectedValue(new Error('Resume failed'))

    mount(App)
    await flushPromises()

    expect(uiLogger.error).toHaveBeenCalledWith('Error resuming PDF processing:', expect.any(Error))
  })

  describe('Watchers', () => {
    it('updates selection when selected page is removed', async () => {
      mockStore.pages = [{ id: 'p1' }, { id: 'p2' }]
      mockStore.selectedPageIds = ['p1']
      const wrapper = mount(App)

        ; (wrapper.vm as AppInstance).selectedPageId = 'p1'

      // Remove p1
      mockStore.pages = [{ id: 'p2' }]
      await wrapper.vm.$nextTick()

      expect((wrapper.vm as AppInstance).selectedPageId).toBe('p2')
    })

    it('selects first page if none selected and pages added', async () => {
      mockStore.pages = []
      const wrapper = mount(App)
      expect((wrapper.vm as AppInstance).selectedPageId).toBeNull()

      // Add pages
      mockStore.pages = [{ id: 'p1' }]
      await wrapper.vm.$nextTick()

      expect((wrapper.vm as AppInstance).selectedPageId).toBe('p1')
    })
  })

  describe('Layout Toggles', () => {
    beforeEach(() => {
      mockStore.pages = [{ id: 'p1', fileName: 'test.png' }]
    })

    it('toggles pageViewerCollapsed and previewCollapsed via divider buttons', async () => {
      const wrapper = mount(App)
      await flushPromises()

      // Initially both expanded
      expect(wrapper.find('.page-viewer-panel').exists()).toBe(true)
      expect(wrapper.find('.preview-panel').exists()).toBe(true)

      // 1. Collapse PageViewer via button in divider
      const dividerButtons = wrapper.findAll('.panel-divider button')
      await dividerButtons[0]!.trigger('click')
      expect((wrapper.vm as any).pageViewerCollapsed).toBe(true)

      await wrapper.vm.$nextTick()
      expect(wrapper.find('.page-viewer-panel').exists()).toBe(false)

      // 2. Now expand it back
      const expandViewerBtn = wrapper.find('.panel-divider button')
      await expandViewerBtn.trigger('click')
      expect((wrapper.vm as any).pageViewerCollapsed).toBe(false)

      await wrapper.vm.$nextTick()
      expect(wrapper.find('.page-viewer-panel').exists()).toBe(true)

      // 3. Collapse Preview
      const collapsePreviewBtn = wrapper.findAll('.panel-divider button')[1]
      await collapsePreviewBtn!.trigger('click')
      expect((wrapper.vm as any).previewCollapsed).toBe(true)

      await wrapper.vm.$nextTick()
      expect(wrapper.find('.preview-panel').exists()).toBe(false)

      // 4. Expand Preview via right-edge trigger
      const expandPreviewBtn = wrapper.find('.right-edge-trigger button')
      await expandPreviewBtn.trigger('click')
      expect((wrapper.vm as any).previewCollapsed).toBe(false)

      await wrapper.vm.$nextTick()
      expect(wrapper.find('.preview-panel').exists()).toBe(true)
    })

    it('toggles sider collapse via custom trigger', async () => {
      const wrapper = mount(App)
      await flushPromises()

      const triggerBtn = wrapper.find('.sider-trigger-container button')
      expect(triggerBtn.exists()).toBe(true)

      // Initially expanded
      expect((wrapper.vm as any).pageListCollapsed).toBe(false)

      await triggerBtn.trigger('click')

      // After click, should be collapsed
      expect((wrapper.vm as any).pageListCollapsed).toBe(true)

      // Click again to expand
      await triggerBtn.trigger('click')
      expect((wrapper.vm as any).pageListCollapsed).toBe(false)
    })
  })
})