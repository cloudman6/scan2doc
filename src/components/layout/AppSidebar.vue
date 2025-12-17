<template>
  <aside class="app-sidebar">
    <div class="sidebar-section">
      <h3 class="section-title">Pages</h3>
      <div class="section-content">
        <!-- Page list will go here -->
      </div>
    </div>

    <div class="sidebar-section">
      <h3 class="section-title">Export</h3>
      <div class="section-content">
        <!-- Export options will go here -->
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
// AppSidebar component - placeholder implementation
</script>

<style scoped>
.app-sidebar {
  width: 280px;
  height: 100%;
  background: #f8f9fa;
  border-right: 1px solid #e5e5e5;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.sidebar-section {
  padding: 16px;
  border-bottom: 1px solid #e5e5e5;
}

.section-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-content {
  min-height: 100px;
}
</style>