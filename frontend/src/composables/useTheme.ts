import { computed, watchEffect } from 'vue'
import { useLocalStorage } from '@vueuse/core'

/**
 * Composable for managing application theme
 * Persists theme preference to localStorage and applies to DOM
 * 
 * @returns {Object} Theme management utilities
 */
export function useTheme() {
  const theme = useLocalStorage<'light' | 'dark'>('ccg_theme', 'dark')

  const isDark = computed({
    get: () => theme.value === 'dark',
    set: (value: boolean) => {
      theme.value = value ? 'dark' : 'light'
    },
  })

  // Apply theme to DOM
  watchEffect(() => {
    document.documentElement.dataset.theme = theme.value
    document.documentElement.classList.toggle('dark', theme.value === 'dark')
  })

  const toggleTheme = () => {
    isDark.value = !isDark.value
  }

  return {
    theme,
    isDark,
    toggleTheme,
  }
}
