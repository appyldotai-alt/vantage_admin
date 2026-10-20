import { createApp } from 'vue';
import { Quasar } from 'quasar';
import 'quasar/src/css/index.sass';
import './css/app.css';
import App from './App.vue';
import { router } from './router';

createApp(App).use(Quasar).use(router).mount('#app');
