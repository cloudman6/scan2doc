import type { OCRResult, OCRBox } from '@/services/ocr'

export class MarkdownAssembler {
    /**
     * Assemble OCR result and extracted images into a Markdown string.
     * Images are inserted in-place where <|det|> tags appear in raw_text,
     * matching coordinates to the extracted image boxes.
     * 
     * @param ocrResult The original OCR result containing text and boxes
     * @param imageMap A map of box index to extracted image ID
     * @returns The generated Markdown string
     */
    assemble(ocrResult: OCRResult, imageMap: Map<string, string>): string {
        if (!ocrResult.raw_text) {
            throw new Error('OCR result missing raw_text')
        }

        const insertedIndices = new Set<string>()
        let figureCount = 1

        // 1. Clean ref tags (remove noisy labels, unwrap others)
        let content = this.cleanRefTags(ocrResult.raw_text)

        // 2. Process det tags to insert images
        content = content.replace(/<\|det\|>\[\[(.*?)\]\]<\|\/det\|>/g, (_, coordsStr) => {
            try {
                // Parse coordinates "x1,y1,x2,y2"
                const coords = coordsStr.split(',').map(Number)
                if (coords.length !== 4) return '' // Invalid format, remove tag

                // Find matching box index
                const matchedIndex = this.findMatchingBoxIndex(coords, ocrResult.boxes, ocrResult.image_dims)

                if (matchedIndex !== -1) {
                    const indexStr = matchedIndex.toString()
                    const imageId = imageMap.get(indexStr)

                    if (imageId) {
                        insertedIndices.add(indexStr)
                        const caption = `Figure ${figureCount++}`
                        return `![${caption}](scan2doc-img:${imageId})`
                    }
                }

                // If no match or no image found, remove the tag
                return ''
            } catch (error) {
                console.warn('[MarkdownAssembler] Error processing det tag:', error)
                return ''
            }
        })

        // 3. Remove any remaining structural tags if necessary (like box)
        content = content.replace(/<\|box\|>[\s\S]*?<\|\/box\|>/g, '')

        // 4. Append remaining images (fallback)
        const sortedIndices = Array.from(imageMap.keys()).sort((a, b) => parseInt(a) - parseInt(b))
        const remainingImages: string[] = []

        for (const indexStr of sortedIndices) {
            if (!insertedIndices.has(indexStr)) {
                // We checked imageMap.keys(), so imageId is guaranteed
                const imageId = imageMap.get(indexStr)!
                const caption = `Figure ${figureCount++}`
                remainingImages.push(`![${caption}](scan2doc-img:${imageId})`)
            }
        }

        if (remainingImages.length > 0) {
            content += '\n\n## Figures\n'
            content += remainingImages.join('\n')
        }

        return content.trim()
    }

    private cleanRefTags(text: string): string {
        // Replace <|ref|>content<|/ref|>
        // If content is one of the noisy labels, remove it.
        // Otherwise, unwrap it (keep content).
        const noisyLabels = ['title', 'text', 'image', 'figure', 'table', 'caption', 'header', 'footer']

        return text.replace(/<\|ref\|>([\s\S]*?)<\|\/ref\|>/g, (match, content) => {
            const cleanContent = content.trim().toLowerCase()
            if (noisyLabels.includes(cleanContent)) {
                return ''
            }
            return content // Keep other references
        })
    }

    private findMatchingBoxIndex(
        targetCoords: number[],
        boxes: OCRBox[],
        imageDims: { w: number, h: number }
    ): number {
        // Target: [x1, y1, x2, y2]
        if (targetCoords.length < 4) return -1
        if (boxes.length === 0) return -1

        // Check if we need to scale targetCoords (0-1000) to absolute pixels
        // Heuristic: If ANY box coordinate > 1000, and ALL target coords <= 1000, we probably need to scale.
        // Or more robustly: Check IoU in both scales and pick best?
        // Let's assume normalized if max(target) <= 1000 and max(box) > 1000.

        let candidates = [
            targetCoords, // As-is
            // Scaled (assuming 0-1000 normalization)
            [
                (targetCoords[0] / 1000) * imageDims.w,
                (targetCoords[1] / 1000) * imageDims.h,
                (targetCoords[2] / 1000) * imageDims.w,
                (targetCoords[3] / 1000) * imageDims.h,
            ]
        ]

        const DELTA = 10 // pixels/units tolerance

        for (const coords of candidates) {
            for (let i = 0; i < boxes.length; i++) {
                const box = boxes[i].box
                if (
                    Math.abs(box[0] - coords[0]) <= DELTA &&
                    Math.abs(box[1] - coords[1]) <= DELTA &&
                    Math.abs(box[2] - coords[2]) <= DELTA &&
                    Math.abs(box[3] - coords[3]) <= DELTA
                ) {
                    return i
                }
            }
        }

        return -1
    }
}

export const markdownAssembler = new MarkdownAssembler()
