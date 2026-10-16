<script setup>
import { ref, computed, watch, onMounted, onUnmounted, useTemplateRef, nextTick } from 'vue'
import { animate, createTimeline } from 'animejs'
import {
  NCard,
  NButton,
  NButtonGroup,
  NInput,
  NInputNumber,
  NSpace,
  NAlert,
  NModal,
  NFormItem,
  NTag,
  NSwitch,
  useDialog,
  useMessage,
} from 'naive-ui'
import { useWaterTracker } from './useWaterTracker'

const {
  totalToday,
  goalMl,
  progress,
  remainingMl,
  settings,
  notifPermission,
  permissionError,
  nextReminderAt,
  addWater,
  undoLast,
  resetToday,
  updateSettings,
  requestPermission,
  toggleReminders,
} = useWaterTracker()

const dialog = useDialog()
const message = useMessage()

const showSettings = ref(false)
const customAmount = ref(null)

const deferredInstallPrompt = ref(null)
const isStandalone = ref(
  typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true),
)
const isIos = ref(/iphone|ipad|ipod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : ''))

function handleBeforeInstallPrompt(event) {
  event.preventDefault()
  deferredInstallPrompt.value = event
}

async function installApp() {
  if (!deferredInstallPrompt.value) return
  deferredInstallPrompt.value.prompt()
  const { outcome } = await deferredInstallPrompt.value.userChoice
  if (outcome === 'accepted') {
    message.success('Installed! Open it from your desktop/home screen for the most reliable reminders.')
  }
  deferredInstallPrompt.value = null
}

onMounted(() => {
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', () => {
    isStandalone.value = true
    deferredInstallPrompt.value = null
  })
})
onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
})

function litres(ml) {
  return (ml / 1000).toFixed(2)
}

const glassRef = useTemplateRef('glassRef')

function bounceGlass() {
  if (!glassRef.value) return
  animate(glassRef.value, {
    scale: [1, 1.06, 1],
    duration: 450,
    ease: 'outBack',
  })
}

function addWaterAnimated(amount) {
  addWater(amount)
  bounceGlass()
}

function addCustom() {
  if (customAmount.value > 0) {
    addWaterAnimated(customAmount.value)
    customAmount.value = null
  }
}

function confirmReset() {
  dialog.warning({
    title: 'Reset today\'s intake?',
    content: `This clears ${litres(totalToday.value)}L logged today. This can't be undone.`,
    positiveText: 'Yes, reset',
    negativeText: 'Cancel',
    onPositiveClick: () => {
      resetToday()
      message.success('Today\'s intake has been reset.')
    },
  })
}

const permissionTagType = computed(() => {
  if (notifPermission.value === 'granted') return 'success'
  if (notifPermission.value === 'denied') return 'error'
  return 'warning'
})

const fillPercent = computed(() => Math.round(progress.value * 100))

const encouragement = computed(() => {
  const p = fillPercent.value
  if (p >= 100) return "You're a hydration legend 🏆"
  if (p >= 75) return 'Almost there — keep sipping!'
  if (p >= 50) return 'Halfway there, nice pace 🌊'
  if (p >= 25) return "Good start, don't stop now"
  if (p > 0) return 'Every drop counts 💧'
  return 'Time for your first sip of the day'
})

const now = ref(Date.now())
let clockTimer = null
onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => clearInterval(clockTimer))

// Animated fill level driven by anime.js instead of a CSS transition, so we
// get a springy overshoot when water is added rather than a linear glide.
const fillLevel = ref(progress.value)
const displayedLitres = ref(totalToday.value)

watch(progress, (next) => {
  animate(fillLevel, {
    value: next,
    duration: 900,
    ease: 'outElastic(1, 0.6)',
  })
})

watch(totalToday, (next) => {
  animate(displayedLitres, {
    value: next,
    duration: 700,
    ease: 'outCubic',
  })
})

// Two wave layers drifting at different speeds/directions for a sense of
// depth, plus a handful of bubbles rising continuously through the water.
const waveBackEl = useTemplateRef('waveBackEl')
const waveFrontEl = useTemplateRef('waveFrontEl')

const bubbles = Array.from({ length: 6 }, (_, i) => ({
  id: i,
  cx: 30 + i * 20 + (i % 2 === 0 ? -6 : 6),
  r: 2 + (i % 3),
}))
const bubbleEls = useTemplateRef('bubbleEls')

onMounted(() => {
  if (waveBackEl.value) {
    animate(waveBackEl.value, {
      translateX: [0, -110],
      duration: 5200,
      loop: true,
      ease: 'linear',
    })
  }
  if (waveFrontEl.value) {
    animate(waveFrontEl.value, {
      translateX: [0, 100],
      duration: 3600,
      loop: true,
      ease: 'linear',
    })
  }

  const els = Array.isArray(bubbleEls.value) ? bubbleEls.value : bubbleEls.value ? [bubbleEls.value] : []
  els.forEach((el, i) => {
    animate(el, {
      cy: [200, -10],
      opacity: [0, 0.9, 0],
      duration: 3200 + i * 400,
      delay: i * 500,
      loop: true,
      ease: 'inOutSine',
    })
  })
})

const shellRef = useTemplateRef('shellRef')
onMounted(() => {
  nextTick(() => {
    if (!shellRef.value) return
    createTimeline({ defaults: { ease: 'outQuad' } })
      .add(
        shellRef.value.querySelectorAll('.n-card'),
        {
          opacity: [0, 1],
          translateY: [24, 0],
          delay: (_el, i) => i * 90,
          duration: 500,
        },
        0,
      )
  })
})

function litresLive(ml) {
  return (ml / 1000).toFixed(2)
}

const countdownLabel = computed(() => {
  if (!nextReminderAt.value) return null
  const diffMs = nextReminderAt.value - now.value
  if (diffMs <= 0) return 'any moment now…'
  const totalSeconds = Math.ceil(diffMs / 1000)
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
})
</script>

<template>
  <div class="page">
    <div class="shell" ref="shellRef">
      <header class="header">
        <h1>💧 Water Reminder</h1>
        <n-button quaternary circle @click="showSettings = true">⚙️</n-button>
      </header>

      <n-card v-if="!isStandalone" class="install-card">
        <n-space align="center" justify="space-between" :wrap="false">
          <div class="install-copy">
            <strong>Install as an app</strong>
            <p>Runs in its own window, so reminders keep working without a browser tab open.</p>
          </div>
          <n-button
            v-if="deferredInstallPrompt"
            type="primary"
            size="small"
            @click="installApp"
          >
            Install
          </n-button>
          <n-tag v-else-if="isIos" type="info" size="small">
            Share → Add to Home Screen
          </n-tag>
        </n-space>
      </n-card>

      <n-card class="tracker-card">
        <n-space vertical align="center" :size="16">
          <div class="glass" ref="glassRef" :class="{ full: fillPercent >= 100 }">
            <svg class="glass-shape" viewBox="0 0 160 200" preserveAspectRatio="none">
              <defs>
                <clipPath id="glassClip">
                  <path d="M20 8 H140 L124 190 A8 8 0 0 1 116 197 H44 A8 8 0 0 1 36 190 Z" />
                </clipPath>
                <linearGradient id="waterGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#7dd3fc" />
                  <stop offset="100%" stop-color="#0284c7" />
                </linearGradient>
              </defs>

              <path
                class="glass-outline"
                d="M20 8 H140 L124 190 A8 8 0 0 1 116 197 H44 A8 8 0 0 1 36 190 Z"
              />

              <g clip-path="url(#glassClip)">
                <g :transform="`translate(0, ${-6 + (200 - 8) * (1 - fillLevel)})`" class="water-layers">
                  <path
                    ref="waveBackEl"
                    class="water-wave water-wave-back"
                    d="M-100 10 C -75 0, -65 20, -40 10 S 0 0, 25 10 S 60 20, 85 10 S 125 0, 150 10 S 185 20, 210 10
                       L210 400 L-100 400 Z"
                  />
                  <path
                    ref="waveFrontEl"
                    class="water-wave water-wave-front"
                    d="M-100 14 C -80 4, -60 24, -40 14 S 0 4, 20 14 S 55 24, 80 14 S 115 4, 140 14 S 175 24, 200 14
                       L200 400 L-100 400 Z"
                  />
                </g>

                <circle
                  v-for="bubble in bubbles"
                  :key="bubble.id"
                  ref="bubbleEls"
                  class="bubble"
                  :cx="bubble.cx"
                  :r="bubble.r"
                  :cy="200"
                />
              </g>
            </svg>

            <div class="glass-label">
              <strong>{{ litresLive(displayedLitres) }}L</strong>
              <span>of {{ litres(goalMl) }}L</span>
            </div>
          </div>

          <p class="encouragement">{{ encouragement }}</p>

          <p v-if="remainingMl > 0" class="remaining">
            {{ litres(remainingMl) }}L left to reach your goal today
          </p>
          <p v-else class="remaining done">🎉 Goal reached — great job staying hydrated!</p>

          <n-button-group>
            <n-button type="primary" @click="addWaterAnimated(250)">+250ml</n-button>
            <n-button type="primary" @click="addWaterAnimated(500)">+500ml</n-button>
            <n-button type="primary" @click="addWaterAnimated(1000)">+1L</n-button>
          </n-button-group>

          <n-space :size="8" style="width: 100%">
            <n-input-number
              v-model:value="customAmount"
              placeholder="Custom ml"
              :min="1"
              style="flex: 1"
              @keyup.enter="addCustom"
            />
            <n-button @click="addCustom">Add</n-button>
          </n-space>

          <n-space :size="16">
            <n-button v-if="totalToday > 0" text @click="undoLast(250)">Undo 250ml</n-button>
            <n-button v-if="totalToday > 0" text type="error" @click="confirmReset">
              Reset today
            </n-button>
          </n-space>
        </n-space>
      </n-card>

      <n-card class="notif-card" title="Notifications">
        <n-space vertical :size="12">
          <n-space align="center" :size="8">
            <span>Status:</span>
            <n-tag :type="permissionTagType" round>{{ notifPermission }}</n-tag>
          </n-space>

          <n-alert v-if="permissionError" type="warning" :show-icon="true">
            {{ permissionError }}
          </n-alert>

          <n-space v-if="notifPermission === 'granted'" align="center" justify="space-between">
            <span>Reminders</span>
            <n-switch
              :value="settings.remindersEnabled"
              @update:value="toggleReminders"
            />
          </n-space>

          <p v-if="notifPermission === 'granted' && !settings.remindersEnabled" class="countdown">
            Reminders are turned off.
          </p>
          <p
            v-else-if="notifPermission === 'granted' && countdownLabel"
            class="countdown"
          >
            Next reminder in <strong>{{ countdownLabel }}</strong>
            (every {{ settings.intervalMinutes }} min, {{ settings.activeStart }}–{{ settings.activeEnd }})
          </p>
          <p v-else-if="notifPermission === 'granted' && remainingMl <= 0" class="countdown">
            No reminders scheduled — you've already hit today's goal 🎉
          </p>

          <n-button
            v-if="notifPermission !== 'granted'"
            type="primary"
            @click="requestPermission"
          >
            Enable Notifications
          </n-button>

          <p class="hint" v-if="notifPermission === 'denied'">
            Your browser already blocked notifications for this site, so clicking the button
            can't re-prompt. Click the site info / padlock icon in the address bar → Site
            settings → Notifications → Allow, then reload this page.
          </p>
        </n-space>
      </n-card>
    </div>

    <n-modal v-model:show="showSettings">
      <n-card title="Settings" style="width: min(420px, 92vw)" closable @close="showSettings = false">
        <n-space vertical :size="16">
          <n-form-item label="Daily goal (ml)">
            <n-input-number
              :value="settings.goalMl"
              style="width: 100%"
              @update:value="(v) => updateSettings({ goalMl: v })"
            />
          </n-form-item>

          <n-form-item label="Reminder interval (minutes)">
            <n-input-number
              :value="settings.intervalMinutes"
              :min="1"
              style="width: 100%"
              @update:value="(v) => updateSettings({ intervalMinutes: v })"
            />
          </n-form-item>

          <n-form-item label="Active window start">
            <n-input
              :value="settings.activeStart"
              type="text"
              placeholder="08:00"
              @update:value="(v) => updateSettings({ activeStart: v })"
            />
          </n-form-item>

          <n-form-item label="Active window end">
            <n-input
              :value="settings.activeEnd"
              type="text"
              placeholder="22:00"
              @update:value="(v) => updateSettings({ activeEnd: v })"
            />
          </n-form-item>

          <p class="hint">
            Reminders only fire between the active window, roughly every interval, until you hit
            your daily goal. Keep this tab (or an installed app window) open in the background
            for the most reliable delivery.
          </p>
        </n-space>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  padding: 24px 16px 48px;
}

.shell {
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.shell :deep(.n-card) {
  background: color-mix(in srgb, var(--surface) 78%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.install-card :deep(.n-card__content) {
  padding: 12px 16px;
}

.install-copy strong {
  display: block;
  font-size: 0.9rem;
}

.install-copy p {
  margin: 2px 0 0;
  font-size: 0.78rem;
  opacity: 0.7;
}

.header h1 {
  font-size: 1.4rem;
  margin: 0;
}

.glass {
  position: relative;
  width: 160px;
  height: 200px;
  filter: drop-shadow(0 8px 20px rgba(14, 165, 233, 0.25));
}

.glass-shape {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.glass-outline {
  fill: rgba(255, 255, 255, 0.03);
  stroke: var(--border);
  stroke-width: 3;
}

.water-layers {
  transition: transform 0.3s ease;
}

.water-wave-back {
  fill: #0369a1;
  opacity: 0.75;
}

.water-wave-front {
  fill: url(#waterGradient);
  opacity: 0.95;
}

.bubble {
  fill: rgba(255, 255, 255, 0.55);
  opacity: 0;
}

.glass.full .water-wave-back {
  fill: #15803d;
}

.glass.full .water-wave-front {
  fill: #22c55e;
}

.glass-label {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}

.glass-label strong {
  font-size: 1.7rem;
  color: #fff;
}

.glass-label span {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.85);
}

.encouragement {
  margin: 0;
  font-size: 0.9rem;
  font-style: italic;
  opacity: 0.8;
  text-align: center;
}

.remaining {
  text-align: center;
  margin: 0;
  opacity: 0.85;
}

.remaining.done {
  font-weight: 600;
}

.countdown {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.8;
}

.hint {
  font-size: 0.8rem;
  opacity: 0.65;
  line-height: 1.4;
  margin: 0;
}
</style>
