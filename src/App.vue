<script setup lang="ts">
import { onMounted } from 'vue'
import { useCampaignStore } from './stores/campaign'
import AppHeader from './components/AppHeader.vue'

const store = useCampaignStore()

onMounted(async () => {
  await store.loadConfig()
  await store.loadCampaignList()
})
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <main class="app-main">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.app-main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
