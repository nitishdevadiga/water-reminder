import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import 'vfonts/Lato.css'
import './style.css'
import App from './App.vue'

registerSW({ immediate: true })

createApp(App).mount('#app')
