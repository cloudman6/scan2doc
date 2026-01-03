import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import OCRResultOverlay from './OCRResultOverlay.vue'
import type { OCRBox } from '@/services/ocr'

describe('OCRResultOverlay.vue', () => {
    // Use pixel coordinates based on image dimensions (realistic scenario)
    const imageDims = { w: 1487, h: 2105 }

    const mockBoxes: OCRBox[] = [
        { box: [86, 69, 543, 279], label: 'title' },   // Pixel coords for ~1500x2100 image
        { box: [86, 1032, 1399, 1297], label: 'text' },
        { box: [0, 0, 1487, 2105], label: 'Custom' }   // Full image
    ]

    it('renders nothing when boxes is empty', () => {
        const wrapper = mount(OCRResultOverlay, {
            props: { boxes: [], imageDims }
        })
        expect(wrapper.findAll('.ocr-box').length).toBe(0)
    })

    it('renders correct number of boxes', () => {
        const wrapper = mount(OCRResultOverlay, {
            props: { boxes: mockBoxes, imageDims }
        })
        expect(wrapper.findAll('.ocr-box').length).toBe(3)
    })

    it('calculates style correctly using pixel coords and image dimensions', () => {
        const boxData = mockBoxes[0]
        if (!boxData) throw new Error('Mock data missing')

        const wrapper = mount(OCRResultOverlay, {
            props: { boxes: [boxData], imageDims }
        })
        const box = wrapper.find('.ocr-box')
        const style = box.attributes('style')

        // [86, 69, 543, 279] with imageDims {w:1487, h:2105}
        // left = 86/1487 * 100 ≈ 5.78%
        // top = 69/2105 * 100 ≈ 3.28%
        // width = (543-86)/1487 * 100 ≈ 30.73%
        // height = (279-69)/2105 * 100 ≈ 9.98%
        expect(style).toMatch(/left:\s*5\.7\d*%/)
        expect(style).toMatch(/top:\s*3\.2\d*%/)
        expect(style).toMatch(/width:\s*30\.7\d*%/)
        expect(style).toMatch(/height:\s*9\.9\d*%/)
    })

    it('falls back to 1000x1000 when imageDims is missing', () => {
        // Test backward compatibility with normalized 0-1000 coords
        const normalizedBox: OCRBox = { box: [100, 100, 200, 200], label: 'text' }

        const wrapper = mount(OCRResultOverlay, {
            props: { boxes: [normalizedBox] }
            // No imageDims - should fallback to 1000x1000
        })
        const box = wrapper.find('.ocr-box')
        const style = box.attributes('style')

        // [100, 100, 200, 200] / 1000 * 100 = 10%, 10%, 10%, 10%
        expect(style).toContain('left: 10%')
        expect(style).toContain('top: 10%')
        expect(style).toContain('width: 10%')
        expect(style).toContain('height: 10%')
    })

    it('assigns correct colors based on labels', () => {
        const wrapper = mount(OCRResultOverlay, {
            props: { boxes: mockBoxes, imageDims }
        })
        const boxes = wrapper.findAll('.ocr-box')

        // title -> #dc2626
        const label1 = boxes[0]!.find('.box-label').attributes('style')
        expect(label1).toContain('background-color: rgb(220, 38, 38)')

        // text -> #2563eb
        const label2 = boxes[1]!.find('.box-label').attributes('style')
        expect(label2).toContain('background-color: rgb(37, 99, 235)')
    })

    it('generates consistent color for unknown labels', () => {
        const wrapper = mount(OCRResultOverlay, {
            props: {
                boxes: [
                    { box: [0, 0, 100, 100], label: 'Unknown1' },
                    { box: [100, 100, 200, 200], label: 'Unknown1' }
                ],
                imageDims
            }
        })
        const labels = wrapper.findAll('.box-label')
        const color1 = labels[0]!.attributes('style')
        const color2 = labels[1]!.attributes('style')

        expect(color1).toBe(color2)
    })

    it('handles lowercase mapping', () => {
        const wrapper = mount(OCRResultOverlay, {
            props: {
                boxes: [{ box: [0, 0, 100, 100], label: 'TITLE' }],
                imageDims
            }
        })
        expect(wrapper.find('.box-label').attributes('style')!).toContain('rgb(220, 38, 38)')
    })
})
