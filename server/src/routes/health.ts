import { Router } from 'express'

export const healthRouter = Router()

healthRouter.get('/', (req: any, res: any) => {
  res.json({ ok: true, service: 'ccg-server', ts: new Date().toISOString() })
})
