import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCharacterStore } from '@/stores/characterStore'

describe('characterStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with empty character', () => {
    const store = useCharacterStore()
    expect(store.name).toBe('')
    expect(store.description).toBe('')
  })

  it('should reset character', () => {
    const store = useCharacterStore()
    store.name = 'Test Character'
    store.description = 'Test Description'
    
    store.reset()
    
    expect(store.name).toBe('')
    expect(store.description).toBe('')
  })

  it('should apply generated character data', () => {
    const store = useCharacterStore()
    const payload = {
      name: 'Generated Character',
      description: 'Auto-generated',
      personality: 'Friendly',
      scenario: 'Test scenario',
      first_mes: 'Hello!',
      mes_example: 'Example message',
    }

    store.applyGenerated(payload)

    expect(store.name).toBe('Generated Character')
    expect(store.description).toBe('Auto-generated')
  })
})
