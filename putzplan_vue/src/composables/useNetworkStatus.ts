import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Composable für Online/Offline Status Detection
 *
 * Tracked den Netzwerk-Status des Browsers und bietet Events für Reconnect.
 * Nutzt die native Browser API `navigator.onLine` und Window Events.
 *
 * @returns {Object} Network status state und callbacks
 */
export function useNetworkStatus() {
  // Reactive State - Initial von Browser API
  const isOnline = ref(navigator.onLine)

  // Event Handler für Online-Event
  const handleOnline = () => {
    console.log('🌐 Network: Online')
    isOnline.value = true
  }

  // Event Handler für Offline-Event
  const handleOffline = () => {
    console.log('📴 Network: Offline')
    isOnline.value = false
  }

  // Setup - Event Listeners registrieren
  onMounted(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    console.log('🌐 Network Status Tracker initialized:', isOnline.value ? 'Online' : 'Offline')
  })

  // Cleanup - Event Listeners entfernen
  onUnmounted(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  })

  return {
    isOnline,
  }
}
