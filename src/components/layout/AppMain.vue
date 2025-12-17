<template>
  <main class="app-main">
    <div class="main-content">
      <!-- Main content area -->
      <div class="placeholder-message">
        <h2>Main Content Area</h2>
        <p>Document processing and preview will be displayed here</p>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
// AppMain component - placeholder implementation
</script>

<style scoped>
.app-main {
  flex: 1;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.placeholder-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: #666;
}

.placeholder-message h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 500;
}

.placeholder-message p {
  margin: 0;
  font-size: 14px;
}
</style>