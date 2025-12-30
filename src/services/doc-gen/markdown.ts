import type { OCRResult } from '@/services/ocr'

export class MarkdownAssembler {
    /**
     * Assemble OCR result and extracted images into a Markdown string.
     * Currently, this appends all images to the end of the document under a "Figures" section.
     * 
     * @param ocrResult The original OCR result containing text and boxes
     * @param imageMap A map of box index to extracted image ID
     * @returns The generated Markdown string
     */
    assemble(ocrResult: OCRResult, imageMap: Map<string, string>): string {
        let content = ocrResult.text || ''

        // Check if we have any images to append
        if (imageMap.size === 0) {
            return content
        }

        const figuresSection: string[] = []

        // Sort keys (indices) numerically to maintain order
        // (Map keys iteration order is insertion order, which should be correct if sliced in order, 
        // but explicit sorting by index is safer)
        const sortedIndices = Array.from(imageMap.keys()).sort((a, b) => parseInt(a) - parseInt(b))

        let figureCount = 1

        for (const indexStr of sortedIndices) {
            const imageId = imageMap.get(indexStr)
            if (!imageId) continue

            // We can also check the label from ocrResult.boxes[index] if needed for caption
            // const box = ocrResult.boxes[parseInt(indexStr)]
            // const caption = box.label === 'table' ? `Table ${figureCount}` : `Figure ${figureCount}`

            // For now, simple numbering
            const caption = `Figure ${figureCount}`

            // Use custom scheme scan2doc-img:
            figuresSection.push(`![${caption}](scan2doc-img:${imageId})`)
            figureCount++
        }

        if (figuresSection.length > 0) {
            content += '\n\n## Figures\n'
            content += figuresSection.join('\n')
        }

        return content
    }
}

export const markdownAssembler = new MarkdownAssembler()
