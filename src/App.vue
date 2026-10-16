<script setup>
import { onMounted, useTemplateRef } from 'vue'
import { animate } from 'animejs'
import { NConfigProvider, NGlobalStyle, NDialogProvider, NMessageProvider, darkTheme } from 'naive-ui'
import Tracker from './Tracker.vue'

const bgImage = useTemplateRef('bgImage')

onMounted(() => {
  if (!bgImage.value) return
  animate(bgImage.value, {
    scale: [1.08, 1.18],
    translateX: [0, -12],
    translateY: [0, -8],
    duration: 30000,
    direction: 'alternate',
    loop: true,
    ease: 'inOutSine',
  })
})
</script>

<template>
  <n-config-provider :theme="darkTheme">
    <n-global-style />
    <div class="sea-bg">
      <img ref="bgImage" src="/images/sea-bg.jpg" alt="" />
    </div>
    <n-dialog-provider>
      <n-message-provider>
        <Tracker />
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>
