import { Hono } from 'hono'
import { AccessToken } from 'livekit-server-sdk'
import { serve } from '@hono/node-server'

const app = new Hono()

app.get('/', (c) => c.text('LiveKit Token Server is running!'))

app.get('/api/token', async (c) => {
  const room = c.req.query('room')
  const identity = c.req.query('identity')

  if (!room || !identity) 
  {
    return c.json({ error: 'room and identity are required' }, 400)
  }

  const apiKey = process.env.LIVEKIT_API_KEY || 'devkey'
  const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret'

  const at = new AccessToken(apiKey, apiSecret, {
    identity: identity,
  })

  at.addGrant({ roomJoin: true, room: room })
  const token = await at.toJwt()
  return c.json({ token }, 200, {
    'Access-Control-Allow-Origin': '*'
  })
})

const port = Number(process.env.PORT) || 3001

serve({
  fetch: app.fetch,
  port
})
