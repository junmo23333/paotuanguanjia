import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/campaign/:id',
      name: 'campaign',
      component: () => import('../views/CampaignView.vue'),
    },
  ],
})

export default router
