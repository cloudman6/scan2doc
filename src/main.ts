import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import '@/services/doc-gen' // Initialize DocumentService

const app = createApp(App)
app.use(createPinia())

app.mount('#app')

