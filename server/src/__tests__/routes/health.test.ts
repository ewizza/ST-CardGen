import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../app.js'

describe('Health Route', () => {
  const app = createApp()

  it('should return 200 on health check', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200)

    expect(response.body).toHaveProperty('ok', true)
  })
})
