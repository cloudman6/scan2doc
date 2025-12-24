import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import PageItem from './PageItem.vue'
import { usePagesStore } from '@/stores/pages'
import type { Page } from '@/stores/pages'

// Mock Naive UI components to simplify testing
vi.mock('naive-ui', () => ({
    NButton: {
        name: 'NButton',
        template: '<button><slot name="icon"></slot><slot></slot></button>'
    },
    NTag: {
        name: 'NTag',
        props: ['type', 'size'],
        template: '<span><slot></slot></span>'
    },
    NCheckbox: {
        name: 'NCheckbox',
        props: ['checked', 'size'],
        template: '<div><input type="checkbox" :checked="checked" @change="$emit(\'update:checked\', $event.target.checked)" /></div>'
    },
    NSpin: {
        name: 'NSpin',
        template: '<div>Spinning...</div>'
    }
}))

describe('PageItem.vue', () => {
    let mockPage: Page
    let pinia: any

    beforeEach(() => {
        mockPage = {
            id: 'page-1',
            fileName: 'test-file.pdf',
            fileSize: 1024 * 1024, // 1MB
            fileType: 'application/pdf',
            origin: 'upload',
            status: 'ready',
            progress: 100,
            order: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            outputs: [],
            logs: [],
            thumbnailData: 'data:image/png;base64,mock'
        }

        pinia = createTestingPinia({
            createSpy: vi.fn,
            initialState: {
                pages: {
                    selectedPageIds: []
                }
            }
        })
    })

    it('renders file name and formatted size correctly', () => {
        const wrapper = mount(PageItem, {
            props: { page: mockPage },
            global: {
                plugins: [pinia]
            }
        })

        expect(wrapper.find('.page-name').text()).toBe('test-file.pdf')
        // We expect the size to be formatted. Let's check if formatFileSize logic is triggered.
        // Since we don't know the exact implementation of formatFileSize in the component yet, 
        // we just check if it's rendered.
        expect(wrapper.find('.page-info').text()).toBeTruthy()
    })

    it('renders thumbnail when thumbnailData is present', () => {
        const wrapper = mount(PageItem, {
            props: { page: mockPage },
            global: {
                plugins: [pinia]
            }
        })

        expect(wrapper.find('.thumbnail-img').exists()).toBe(true)
        expect(wrapper.find('.thumbnail-img').attributes('src')).toBe(mockPage.thumbnailData)
    })

    it('renders placeholders for various statuses when thumbnailData is missing', async () => {
        const statuses: Page['status'][] = ['pending_render', 'rendering', 'error', 'ready']

        for (const status of statuses) {
            const page = { ...mockPage, thumbnailData: undefined, status }
            const wrapper = mount(PageItem, {
                props: { page },
                global: {
                    plugins: [pinia]
                }
            })

            expect(wrapper.find('.status-placeholder').exists()).toBe(true)
            expect(wrapper.find('.status-placeholder').classes()).toContain(status)

            if (status === 'rendering') {
                expect(wrapper.findComponent({ name: 'NSpin' }).exists()).toBe(true)
                expect(wrapper.find('.status-label').text()).toBe('Rendering')
            } else if (status === 'pending_render') {
                expect(wrapper.find('.pending-dot').exists()).toBe(true)
                expect(wrapper.find('.status-label').text()).toBe('Queued')
            } else if (status === 'error') {
                expect(wrapper.find('.error-sign').exists()).toBe(true)
                expect(wrapper.find('.status-label').text()).toBe('Error')
            } else {
                expect(wrapper.find('.status-label').text()).toBe('')
            }
        }
    })

    it('emits click event when clicked', async () => {
        const wrapper = mount(PageItem, {
            props: { page: mockPage },
            global: {
                plugins: [pinia]
            }
        })

        await wrapper.find('.page-item').trigger('click')
        expect(wrapper.emitted('click')).toBeTruthy()
        expect(wrapper.emitted('click')![0]).toEqual([mockPage])
    })

    it('emits delete event when delete button is clicked', async () => {
        const wrapper = mount(PageItem, {
            props: { page: mockPage },
            global: {
                plugins: [pinia]
            }
        })

        // Delete button is an NButton
        const deleteBtn = wrapper.findAllComponents({ name: 'NButton' }).find(c => c.attributes('title') === 'Delete page')
        expect(deleteBtn).toBeTruthy()
        await deleteBtn!.trigger('click')

        expect(wrapper.emitted('delete')).toBeTruthy()
        expect(wrapper.emitted('delete')![0]).toEqual([mockPage])
    })

    it('toggles selection in store when checkbox is changed', async () => {
        const wrapper = mount(PageItem, {
            props: { page: mockPage },
            global: {
                plugins: [pinia]
            }
        })

        const store = usePagesStore()
        const checkbox = wrapper.findComponent({ name: 'NCheckbox' })

        // Simulate checkbox change
        await checkbox.vm.$emit('update:checked', true)

        expect(store.togglePageSelection).toHaveBeenCalledWith(mockPage.id)
    })

    it('applies correct classes for active and dragging states', () => {
        const wrapper = mount(PageItem, {
            props: {
                page: mockPage,
                isActive: true,
                isDragging: true
            },
            global: {
                plugins: [pinia]
            }
        })

        const pageItem = wrapper.find('.page-item')
        expect(pageItem.classes()).toContain('active')
        expect(pageItem.classes()).toContain('dragging')
    })

    it('applies selected class when page is selected in store', async () => {
        const selectedPinia = createTestingPinia({
            createSpy: vi.fn,
            initialState: {
                pages: {
                    selectedPageIds: [mockPage.id]
                }
            }
        })

        const wrapper = mount(PageItem, {
            props: { page: mockPage },
            global: {
                plugins: [selectedPinia]
            }
        })

        expect(wrapper.find('.page-item').classes()).toContain('selected')
        expect(wrapper.findComponent({ name: 'NCheckbox' }).props('checked')).toBe(true)
    })

    describe('Helper functions', () => {
        // We can test the local helper functions indirectly through status types
        it('returns correct tag type for different statuses', async () => {
            const statusMap: Record<Page['status'], string> = {
                'completed': 'success',
                'ready': 'success',
                'rendering': 'info',
                'recognizing': 'info',
                'error': 'error',
                'pending_render': 'warning'
            }

            for (const [status, type] of Object.entries(statusMap)) {
                const wrapper = mount(PageItem, {
                    props: { page: { ...mockPage, status: status as Page['status'] } },
                    global: { plugins: [pinia] }
                })
                const tag = wrapper.findComponent({ name: 'NTag' })
                expect(tag.props('type')).toBe(type)
            }
        })

        it('formatFileSize formats sizes correctly', () => {
            // Test the indirect rendering of formatFileSize
            const testSizes = [
                { bytes: 0, expected: '0 B' },
                { bytes: 1024, expected: '1.0 KB' },
                { bytes: 1024 * 1024, expected: '1.0 MB' },
                { bytes: 1024 * 1024 * 1024, expected: '1.0 GB' }
            ]

            for (const { bytes, expected } of testSizes) {
                const wrapper = mount(PageItem, {
                    props: { page: { ...mockPage, fileSize: bytes } },
                    global: { plugins: [pinia] }
                })
                expect(wrapper.find('.page-info').text()).toBe(expected)
            }
        })
    })

    it('handles mouse hover for delete button visibility', async () => {
        const wrapper = mount(PageItem, {
            props: { page: mockPage },
            global: {
                plugins: [pinia]
            }
        })

        const pageItem = wrapper.find('.page-item')
        const deleteBtn = wrapper.findComponent({ name: 'NButton' })

        // Initial state
        expect(deleteBtn.attributes('style')).toContain('opacity: 0')

        // Mouse enter page
        await pageItem.trigger('mouseenter')
        expect(deleteBtn.attributes('style')).toContain('opacity: 1')

        // Mouse leave page
        await pageItem.trigger('mouseleave')
        expect(deleteBtn.attributes('style')).toContain('opacity: 0')

        // Mouse enter delete button
        await deleteBtn.trigger('mouseenter')
        expect(deleteBtn.attributes('style')).toContain('opacity: 1')
        expect(deleteBtn.attributes('style')).toContain('scale(1.1)')

        // Check delete icon switch
        const deleteIcon = deleteBtn.find('img')
        expect(deleteIcon.attributes('src')).toContain('delete_red.svg')

        await deleteBtn.trigger('mouseleave')
        expect(deleteIcon.attributes('src')).toContain('delete.svg')
    })
})
