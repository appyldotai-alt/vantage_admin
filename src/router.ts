import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'inbox', component: () => import('./pages/InboxPage.vue'), meta: { title: 'Inbox' } },
    { path: '/inbox/:id', name: 'thread', component: () => import('./pages/InboxPage.vue'), meta: { title: 'Inbox' } },
    { path: '/platform', name: 'platform', component: () => import('./pages/PlatformPage.vue'), meta: { title: 'Platform' } },
    { path: '/users', name: 'users', component: () => import('./pages/UsersPage.vue'), meta: { title: 'Users' } },
    { path: '/mailboxes', name: 'mailboxes', component: () => import('./pages/MailboxesPage.vue'), meta: { title: 'Mailboxes' } },
    { path: '/delivery', name: 'delivery', component: () => import('./pages/DeliveryPage.vue'), meta: { title: 'Delivery' } },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
});
