import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const GOAL_ML = 3000
const STORAGE_KEY = 'water-reminder-log'
const SETTINGS_KEY = 'water-reminder-settings'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLog(log) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log))
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw
      ? { ...defaultSettings(), ...JSON.parse(raw) }
      : defaultSettings()
  } catch {
    return defaultSettings()
  }
}

function defaultSettings() {
  return {
    goalMl: GOAL_ML,
    intervalMinutes: 90,
    activeStart: '08:00',
    activeEnd: '22:00',
    remindersEnabled: true,
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

function isWithinActiveWindow(settings) {
  const now = new Date()
  const [startH, startM] = settings.activeStart.split(':').map(Number)
  const [endH, endM] = settings.activeEnd.split(':').map(Number)
  const start = startH * 60 + startM
  const end = endH * 60 + endM
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return nowMinutes >= start && nowMinutes <= end
}

export function useWaterTracker() {
  const log = ref(loadLog())
  const settings = ref(loadSettings())
  const today = ref(todayKey())

  const totalToday = computed(() => log.value[today.value] ?? 0)
  const goalMl = computed(() => settings.value.goalMl)
  const progress = computed(() => Math.min(totalToday.value / goalMl.value, 1))
  const remainingMl = computed(() => Math.max(goalMl.value - totalToday.value, 0))

  function addWater(amount) {
    const key = todayKey()
    log.value = { ...log.value, [key]: (log.value[key] ?? 0) + amount }
    today.value = key
    saveLog(log.value)
  }

  function undoLast(amount) {
    const key = todayKey()
    log.value = { ...log.value, [key]: Math.max((log.value[key] ?? 0) - amount, 0) }
    saveLog(log.value)
  }

  function resetToday() {
    const key = todayKey()
    log.value = { ...log.value, [key]: 0 }
    saveLog(log.value)
  }

  function updateSettings(partial) {
    // Number inputs can briefly emit null/undefined while the user clears
    // the field to type a new value. Ignore those instead of persisting a
    // broken interval that would turn the reminder timer into a busy loop.
    if (
      'intervalMinutes' in partial &&
      (!Number.isFinite(Number(partial.intervalMinutes)) || Number(partial.intervalMinutes) <= 0)
    ) {
      const { intervalMinutes, ...rest } = partial
      partial = rest
    }

    settings.value = { ...settings.value, ...partial }
    saveSettings(settings.value)
  }

  let notifPermission = ref(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  )
  const permissionError = ref('')

  async function requestPermission() {
    permissionError.value = ''

    if (typeof Notification === 'undefined') {
      permissionError.value = 'This browser does not support notifications.'
      return
    }

    if (!window.isSecureContext) {
      permissionError.value =
        'Notifications require a secure context (https:// or localhost).'
      return
    }

    if (Notification.permission === 'denied') {
      permissionError.value =
        'Notifications were blocked previously. Click the padlock/site-info icon next to the address bar and allow notifications for this site, then reload.'
      notifPermission.value = 'denied'
      return
    }

    try {
      const result = await Notification.requestPermission()
      notifPermission.value = result
      if (result === 'denied') {
        permissionError.value =
          'Permission was denied. Enable notifications for this site in your browser settings.'
      } else if (result === 'default') {
        permissionError.value = 'The permission prompt was dismissed without a choice.'
      }
    } catch (err) {
      permissionError.value = `Could not request permission: ${err.message}`
    }
  }

  let swRegistration = null
  let tickTimer = null
  const nextReminderAt = ref(null)

  async function registerSW() {
    if (!('serviceWorker' in navigator)) return
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('sw-timeout')), 5000))
    swRegistration = await Promise.race([navigator.serviceWorker.ready, timeout])
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'LOG_WATER') {
        addWater(event.data.amount)
      }
    })
  }

  // Earlier builds of this app scheduled their own repeating alarm inside
  // the service worker. If a browser still has one of those old worker
  // versions registered, it keeps firing independently of anything this
  // page does. Purge every registration for this origin once, then let
  // registerSW() install a single fresh one from the current sw.js.
  async function purgeStaleServiceWorkers() {
    if (!('serviceWorker' in navigator)) return
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((reg) => reg.unregister()))
  }

  // Fixed-cadence reminder: fires every `intervalMinutes`, independent of
  // tab visibility or how much water was logged in between. Only stops
  // once the daily goal is reached, or the user isn't opted into notifications.
  function startReminderCadence() {
    if (tickTimer) clearInterval(tickTimer)
    nextReminderAt.value = null

    if (notifPermission.value !== 'granted') return
    if (!settings.value.remindersEnabled) return

    const minutes = Number(settings.value.intervalMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0) return

    const intervalMs = minutes * 60 * 1000
    nextReminderAt.value = Date.now() + intervalMs

    tickTimer = setInterval(() => {
      nextReminderAt.value = Date.now() + intervalMs

      if (remainingMl.value <= 0) return
      if (!isWithinActiveWindow(settings.value)) return

      fireNotification()
    }, intervalMs)
  }

  function stopReminderCadence() {
    if (tickTimer) clearInterval(tickTimer)
    tickTimer = null
    nextReminderAt.value = null
  }

  async function fireNotification() {
    const body = `You're at ${(totalToday.value / 1000).toFixed(2)}L of ${(goalMl.value / 1000).toFixed(1)}L today. Drink some water!`

    try {
      if (swRegistration) {
        await swRegistration.showNotification('Time to hydrate 💧', {
          body,
          icon: '/icons/icon.svg',
          badge: '/icons/icon.svg',
          tag: 'water-reminder',
          renotify: true,
          actions: [
            { action: 'add-250', title: '+250ml' },
            { action: 'add-500', title: '+500ml' },
          ],
        })
      } else {
        new Notification('Time to hydrate 💧', { body, icon: '/icons/icon.svg' })
      }
    } catch (err) {
      permissionError.value = `Reminder fired but showing it failed: ${err.message}`
    }
  }

  onMounted(() => {
    startReminderCadence()

    const SW_PURGE_KEY = 'water-reminder-sw-purged-v1'
    const purged = localStorage.getItem(SW_PURGE_KEY)
    const setup = purged ? Promise.resolve() : purgeStaleServiceWorkers()

    setup
      .then(() => {
        if (!purged) localStorage.setItem(SW_PURGE_KEY, '1')
        return registerSW()
      })
      .then(() => startReminderCadence())
      .catch(() => {})

    const params = new URLSearchParams(window.location.search)
    const addParam = params.get('add')
    if (addParam) {
      addWater(Number(addParam))
      window.history.replaceState({}, '', window.location.pathname)
    }

    document.addEventListener('visibilitychange', handleVisibility)
  })

  function handleVisibility() {
    if (document.visibilityState === 'visible') {
      const key = todayKey()
      if (key !== today.value) {
        today.value = key
      }
      if (!tickTimer) {
        startReminderCadence()
      }
    }
  }

  onUnmounted(() => {
    if (tickTimer) clearInterval(tickTimer)
    document.removeEventListener('visibilitychange', handleVisibility)
  })

  // Only settings/permission changes restart the cadence — drinking water
  // or switching tabs does not.
  watch(
    () => settings.value.intervalMinutes,
    () => startReminderCadence(),
  )
  watch(
    () => settings.value.remindersEnabled,
    (enabled) => {
      if (enabled) {
        startReminderCadence()
      } else {
        stopReminderCadence()
      }
    },
  )
  watch(notifPermission, () => {
    if (notifPermission.value === 'granted' && settings.value.remindersEnabled) {
      startReminderCadence()
    } else {
      stopReminderCadence()
    }
  })

  function toggleReminders(enabled) {
    updateSettings({ remindersEnabled: enabled })
  }

  return {
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
  }
}
