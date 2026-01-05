
export interface AppConfig {
    ocrApiEndpoint: string
}

export const config: AppConfig = {
    // OCR API Endpoint (Cloudflare Tunnel to Local Backend)
    ocrApiEndpoint: 'https://ocr.cloudmantools.top/ocr',
}
