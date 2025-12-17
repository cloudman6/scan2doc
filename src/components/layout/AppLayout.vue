<template>
  <div class="app-layout">
    <AppHeader />
    <div class="layout-body">
      <AppSidebar />
      <AppMain />
    </div>
  </div>
</template>

<script setup lang="ts">
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import AppMain from './AppMain.vue'
</script>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.layout-body {
  display: flex;
  flex: 1;
  height: calc(100vh - 60px);
  overflow: hidden;
}
</style>