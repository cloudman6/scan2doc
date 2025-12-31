import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Preview from './Preview.vue'
import { db } from '@/db'
import { renderAsync } from 'docx-preview'

// Functional mock for Naive UI
vi.mock('naive-ui', () => ({
  NTabs: {
    template: '<div class="n-tabs"><slot></slot></div>',
    props: ['value'],
    emits: ['update:value']
  },
  NTabPane: { template: '<div class="n-tab-pane"><slot></slot></div>', props: ['name', 'tab'] },
  NEmpty: { template: '<div class="n-empty">{{ description }}</div>', props: ['description'] },
  NButton: { template: '<button class="n-button"><slot></slot></button>', props: ['disabled'] },
  NSpin: { template: '<div class="n-spin"><slot></slot></div>', props: ['description'] },
  NSwitch: { template: '<div class="n-switch"></div>', props: ['value'] },
  NIcon: { template: '<div></div>' },
  NSpace: { template: '<div><slot></slot></div>' },
  NTooltip: { template: '<span><slot name="trigger"></slot></span>', props: ['trigger'] }
}))

// Mock docx-preview
vi.mock('docx-preview', () => ({
  renderAsync: vi.fn().mockResolvedValue(undefined)
}))

// Mock DB
vi.mock('@/db', () => ({
  db: {
    getPageImage: vi.fn(),
    getPageMarkdown: vi.fn(),
    getPageExtractedImage: vi.fn(),
    getPageDOCX: vi.fn(),
    getPagePDF: vi.fn()
  }
}))

// Mock URL
globalThis.URL.createObjectURL = vi.fn((b) => `blob:mock-${b.type}`)
globalThis.URL.revokeObjectURL = vi.fn()

describe('Preview.vue', () => {
  const mockPage = {
    id: 'p1',
    status: 'ready',
    fileName: 'test.png',
    ocrText: 'fallback text',
    pageNumber: 1
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.getPageMarkdown).mockResolvedValue({ content: '# MD Content' } as any)
    vi.mocked(db.getPagePDF).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    vi.mocked(db.getPageDOCX).mockResolvedValue(new Blob(['docx'], { type: 'application/docx' }))
  })

  it('mounts and renders initial state', async () => {
    const wrapper = mount(Preview, { props: { currentPage: mockPage } })
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
    const vm = wrapper.vm as any
    await vi.waitFor(() => expect(vm.mdContent).toBe('# MD Content'))
  })

  it('covers UI template branches (tabs and buttons)', async () => {
    const wrapper = mount(Preview, { props: { currentPage: mockPage } })
    const vm = wrapper.vm as any

    // Switch to DOCX view
    vm.currentView = 'docx'
    await flushPromises()
    expect(wrapper.find('.docx-wrapper').exists()).toBe(true)

    // Switch to PDF view
    vm.currentView = 'pdf'
    await flushPromises()
    expect(wrapper.find('.binary-preview').exists()).toBe(true)

    // Exercise download buttons in template
    const downloadBtns = wrapper.findAll('.n-button')
    for (const btn of downloadBtns) {
      await btn.trigger('click')
    }
  })

  it('handles binary status check and rendering paths', async () => {
    const wrapper = mount(Preview, { props: { currentPage: mockPage } })
    const vm = wrapper.vm as any

    // Test checkBinaryStatus
    await vm.checkBinaryStatus('p1', 'pdf')
    expect(vm.hasBinary).toBe(true)

    // Test render paths directly
    vm.wordPreviewContainer = document.createElement('div')
    vm.docxBlob = new Blob(['docx'])
    await vm.renderDocx()
    expect(vi.mocked(renderAsync)).toHaveBeenCalled()
  })

  it('covers all download logic paths', async () => {
    const wrapper = mount(Preview, { props: { currentPage: mockPage } })
    const vm = wrapper.vm as any
    await flushPromises()

    const mockAnchor = { href: '', download: '', click: vi.fn(), setAttribute: vi.fn(), remove: vi.fn() } as any
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => ({} as any))
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => ({} as any))

    // MD Download branch in downloadBinary
    await vm.downloadBinary('md')
    expect(mockAnchor.click).toHaveBeenCalled()

    // DOCX Download branch
    await vm.downloadBinary('docx')
    expect(mockAnchor.download).toBe('test.docx')

    // PDF Download branch
    await vm.downloadBinary('pdf')
    expect(mockAnchor.download).toBe('test.pdf')

    // Missing page branch
    await wrapper.setProps({ currentPage: null })
    await vm.downloadBinary('pdf')

    vi.restoreAllMocks()
  })

  it('handles edge cases in markdown loading', async () => {
    vi.mocked(db.getPageMarkdown).mockResolvedValue(undefined)
    const wrapper = mount(Preview, { props: { currentPage: mockPage } })
    const vm = wrapper.vm as any

    // Test OCR text fallback
    await vm.loadMarkdown('p1')
    expect(vm.mdContent).toBe('fallback text')

    // Test error path
    vi.mocked(db.getPageMarkdown).mockRejectedValueOnce(new Error('Fail'))
    await vm.loadMarkdown('p1')
    expect(vm.mdContent).toBe('Failed to load content.')
  })

  it('handles image protocol and cleanup', async () => {
    vi.mocked(db.getPageExtractedImage).mockResolvedValue({ blob: new Blob(['img']) } as any)
    vi.mocked(db.getPageMarkdown).mockResolvedValue({ content: '![img](scan2doc-img:id1)' } as any)

    const wrapper = mount(Preview, { props: { currentPage: mockPage } })
    const vm = wrapper.vm as any

    await vm.loadMarkdown('p1')
    await flushPromises()

    // Unmount cleanup
    vm.pdfPreviewUrl = 'blob:test'
    wrapper.unmount()
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('covers UI template branches (switch and md)', async () => {
    const wrapper = mount(Preview, { props: { currentPage: mockPage } })
    const vm = wrapper.vm as any
    vm.currentView = 'md'
    await flushPromises()

    // Toggle mdViewMode (Source/Preview switch)
    vm.mdViewMode = true
    await flushPromises()
    expect(wrapper.find('.markdown-body').exists()).toBe(true)

    vm.mdViewMode = false
    await flushPromises()
    expect(wrapper.find('pre').exists()).toBe(true)
  })

  it('covers loadMarkdown fallback to ocrText', async () => {
    vi.mocked(db.getPageMarkdown).mockResolvedValue(null as any)
    const wrapper = mount(Preview, { props: { currentPage: mockPage } })
    const vm = wrapper.vm as any
    vm.mdContent = ''
    await vm.loadMarkdown('p1')
    expect(vm.mdContent).toBe('fallback text')
  })

  it('covers renderDocx error path', async () => {
    const wrapper = mount(Preview, { props: { currentPage: mockPage } })
    const vm = wrapper.vm as any

    // Set container manually
    const container = document.createElement('div')
    vm.wordPreviewContainer = container
    vm.docxBlob = new Blob(['docx'])

    vi.mocked(renderAsync).mockRejectedValueOnce(new Error('Render Fail'))
    await vm.renderDocx()
    // The implementation logs the error but doesn't update container innerHTML
    // Verify the error was handled (no exception thrown)
    expect(vm.wordPreviewContainer).toBe(container)
  })

  it('covers checkBinaryStatus pdf cleanup and error path', async () => {
    const wrapper = mount(Preview, { props: { currentPage: mockPage } })
    const vm = wrapper.vm as any
    vm.pdfPreviewUrl = 'blob:old'

    vi.mocked(db.getPagePDF).mockResolvedValue(new Blob(['new']))
    await vm.checkBinaryStatus('p1', 'pdf')
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:old')

    // Error path
    vi.mocked(db.getPagePDF).mockRejectedValueOnce(new Error('Check Fail'))
    await vm.checkBinaryStatus('p1', 'pdf')
    expect(vm.hasBinary).toBe(false)
  })

  it('covers cleanupPdfUrl and handlePreviewUpdate branches', async () => {
    const wrapper = mount(Preview, { props: { currentPage: mockPage } })
    const vm = wrapper.vm as any

    // cleanupPdfUrl
    vm.pdfPreviewUrl = 'blob:pdf'
    vm.cleanupPdfUrl()
    expect(vm.pdfPreviewUrl).toBe('')

    // resetPreviewState
    vm.resetPreviewState()
    expect(vm.mdContent).toBe('')
    expect(vm.hasBinary).toBe(false)
  })
})
