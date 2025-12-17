<template>
  <header class="app-header">
    <div class="header-left">
      <h1 class="app-title">Scan2Doc</h1>
    </div>
    <div class="header-center">
      <!-- Project name will go here -->
    </div>
    <div class="header-right">
      <!-- Settings and actions will go here -->
    </div>
  </header>
</template>

<script setup lang="ts">
// AppHeader component - placeholder implementation
</script>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 60px;
  border-bottom: 1px solid #e5e5e5;
  background: #fff;
}

.header-left,
.header-center,
.header-right {
  display: flex;
  align-items: center;
  min-width: 0;
}

.header-center {
  flex: 1;
  justify-content: center;
}

.app-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}
</style>