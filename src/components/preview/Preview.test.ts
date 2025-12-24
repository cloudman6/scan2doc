import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Preview from './Preview.vue'
import { db } from '@/db'

// Mock Naive UI components
vi.mock('naive-ui', () => ({
  NTabs: {
    name: 'NTabs',
    props: ['value', 'type', 'animated'],
    template: '<div><slot></slot></div>'
  },
  NTabPane: {
    name: 'NTabPane',
    props: ['name', 'tab'],
    template: '<div v-if="$parent.value === name"><slot></slot></div>'
  },
  NEmpty: {
    name: 'NEmpty',
    props: ['description'],
    template: '<div>{{ description }}</div>'
  }
}))

// Mock db
vi.mock('@/db', () => ({
  db: {
    getPageImage: vi.fn()
  }
}))

// Mock URL methods
const mockObjectUrl = 'blob:http://localhost/mock-preview-url'
global.URL.createObjectURL = vi.fn(() => mockObjectUrl)
global.URL.revokeObjectURL = vi.fn()

describe('Preview.vue', () => {
  let mockPage: any

  beforeEach(() => {
    mockPage = {
      id: 'page-1',
      status: 'ready',
      md: '# Hello Markdown',
      html: '<h1>Hello HTML</h1>',
      outputs: []
    }
    vi.clearAllMocks()
    vi.mocked(db.getPageImage).mockResolvedValue(new Blob(['mock-image'], { type: 'image/png' }))
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders image preview by default', async () => {
    const wrapper = mount(Preview, {
      props: { currentPage: mockPage }
    })

    expect(wrapper.vm.currentView).toBe('image')
    
    await vi.waitFor(() => {
      if (!wrapper.find('.preview-img').exists()) throw new Error('not found')
    })
    
    expect(wrapper.find('.preview-img').attributes('src')).toBe(mockObjectUrl)
  })

  it('displays markdown preview when switched', async () => {
    const wrapper = mount(Preview, {
      props: { currentPage: mockPage }
    })

    wrapper.vm.currentView = 'md'
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.markdown-preview').text()).toBe('# Hello Markdown')
  })

  it('displays html preview when switched', async () => {
    const wrapper = mount(Preview, {
      props: { currentPage: mockPage }
    })

    wrapper.vm.currentView = 'html'
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.html-preview').html()).toContain('<h1>Hello HTML</h1>')
  })

  it('shows empty state when no page is provided', () => {
    const wrapper = mount(Preview, {
      props: { currentPage: null }
    })

    expect(wrapper.find('.image-preview').text()).toContain('No image available')
  })

  it('shows rendering state when page is rendering', () => {
    const renderingPage = { ...mockPage, status: 'rendering' }
    const wrapper = mount(Preview, {
      props: { currentPage: renderingPage }
    })

    expect(wrapper.find('.image-preview').text()).toContain('Rendering...')
  })

  it('handles image loading error from DB', async () => {
    vi.mocked(db.getPageImage).mockRejectedValue(new Error('DB Error'))
    
    mount(Preview, {
      props: { currentPage: mockPage }
    })

    await vi.waitFor(() => {
      if (db.getPageImage.mock.calls.length === 0) throw new Error('not called')
    })
    
    // imageError state is not explicitly used in template but logged
  })

  it('revokes URL when current page changes', async () => {
    const wrapper = mount(Preview, {
      props: { currentPage: mockPage }
    })

    await vi.waitFor(() => {
      if (wrapper.vm.fullImageUrl === '') throw new Error('not loaded')
    })

    const oldUrl = wrapper.vm.fullImageUrl
    
    // Change page
    await wrapper.setProps({ currentPage: { ...mockPage, id: 'page-2' } })
    
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(oldUrl)
  })

  it('renders no content messages when data is missing', async () => {
    const wrapper = mount(Preview, {
      props: { currentPage: { ...mockPage, md: '', html: '' } }
    })

    wrapper.vm.currentView = 'md'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.markdown-preview').text()).toBe('No markdown content available')

    wrapper.vm.currentView = 'html'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.html-preview').text()).toBe('No HTML content available')
  })

  it('supports switching views via switchView function', async () => {
    const wrapper = mount(Preview, {
      props: { currentPage: mockPage }
    })

    // Initially image
    expect(wrapper.vm.currentView).toBe('image')

    // Switch to md
    wrapper.vm.switchView('md')
    expect(wrapper.vm.currentView).toBe('md')

    // Switch to html
    wrapper.vm.switchView('html')
    expect(wrapper.vm.currentView).toBe('html')
  })
})
