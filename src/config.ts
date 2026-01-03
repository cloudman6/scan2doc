
export interface AppConfig {
    ocrApiEndpoint: string
}

export const config: AppConfig = {
    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    ocrApiEndpoint: 'http://192.168.1.14:8001/ocr'
}
