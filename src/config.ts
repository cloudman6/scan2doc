
export interface AppConfig {
    ocrApiEndpoint: string
}

export const config: AppConfig = {
    // ocrApiEndpoint: 'https://ocr.cloudmantools.top/ocr'
    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    ocrApiEndpoint: 'http://192.168.1.14:8001/ocr'

}
