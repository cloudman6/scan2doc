import { config } from '@/config'
import type { OCRProvider, OCRResult, OCROptions } from './index'

export class DeepSeekOCRProvider implements OCRProvider {
    name = 'deepseek'

    private async createFormData(imageData: Blob | string, options?: OCROptions): Promise<FormData> {
        const formData = new FormData()

        // Handle both Blob (from file/canvas) and base64 string (legacy/other sources)
        if (imageData instanceof Blob) {
            formData.append('file', imageData, 'image.jpg')
        } else {
            const blob = await (await fetch(imageData)).blob()
            formData.append('file', blob, 'image.jpg')
        }

        const promptType = options?.prompt_type || 'document'
        formData.append('prompt_type', promptType)

        if (options?.custom_prompt && promptType === 'freeform') {
            formData.append('custom_prompt', options.custom_prompt)
        }

        if (options?.find_term && promptType === 'find') {
            formData.append('find_term', options.find_term)
        }

        const grounding = this.resolveGrounding(options, promptType)
        formData.append('grounding', String(grounding))

        return formData
    }

    private resolveGrounding(options: OCROptions | undefined, promptType: string): boolean {
        if (options?.grounding !== undefined) return options.grounding
        return ['document', 'ocr', 'find'].includes(promptType)
    }

    async process(imageData: Blob | string, options?: OCROptions): Promise<OCRResult> {
        const formData = await this.createFormData(imageData, options)

        try {
            const response = await fetch(config.ocrApiEndpoint, {
                method: 'POST',
                body: formData,
                signal: options?.signal
            })

            if (!response.ok) {
                throw new Error(`OCR API Error: ${response.status} ${response.statusText}`)
            }

            const result = await response.json()

            // Map raw API response to OCRResult
            // API currently matches the interface exactly, but explicit mapping is safer
            return {
                success: result.success,
                text: result.text,
                raw_text: result.raw_text,
                boxes: result.boxes || [],
                image_dims: result.image_dims || { w: 0, h: 0 },
                prompt_type: result.prompt_type
            }
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Unknown error during OCR processing');
        }
    }
}
