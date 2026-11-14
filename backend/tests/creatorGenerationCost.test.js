process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'

const mockAnthropicCreate = jest.fn()
jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({
  messages: { create: mockAnthropicCreate }
})))
jest.mock('express-rate-limit', () => () => (req, res, next) => next())
jest.mock('../routes/auth', () => ({ authMiddleware: (req, res, next) => {
  req.user = { sub: 7 }
  next()
} }))
jest.mock('../utils/contentFilter', () => ({ containsProfanityForGames: jest.fn(() => false) }))
jest.mock('../services/email', () => ({ sendReferralCompletedEmail: jest.fn() }))
jest.mock('../services/gameTemplates', () => ({
  MINIMAL_CANVAS_TEMPLATE: '<canvas></canvas>',
  MINIMAL_DOM_TEMPLATE: '<div></div>',
  MINIMAL_TEXT_TEMPLATE: '<input />',
  RELIABLE_PATTERNS: '',
  validateGameHtml: jest.fn(() => []),
  autoFixHtml: jest.fn(html => html)
}))
jest.mock('../db', () => ({
  getConsumerDailyUsage: jest.fn(),
  tryConsumeConsumerDailyUsage: jest.fn(),
  completeReferral: jest.fn(),
  getGameById: jest.fn(),
  incrementRevisionCount: jest.fn(),
  addGameVersion: jest.fn()
}))

const db = require('../db')
const aiRouter = require('../routes/ai')
const VALID_GAME_HTML = '<!DOCTYPE html><html><body><canvas id="game"></canvas><script>const canvas=document.getElementById("game");const ctx=canvas.getContext("2d");document.addEventListener("keydown",()=>{});function loop(){requestAnimationFrame(loop)}requestAnimationFrame(loop)</script></body></html>'
const FULL_PROMPT = 'Create a colorful browser puzzle game with scoring levels and keyboard controls'

async function invokeGenerate(body) {
  const layer = aiRouter.stack.find(entry => entry.route?.path === '/generate-game')
  const req = { body, headers: {}, method: 'POST' }
  let statusCode = 200
  let jsonBody
  const res = {
    status(code) { statusCode = code; return this },
    json(payload) { jsonBody = payload; return this }
  }
  for (const handler of layer.route.stack) {
    let nextCalled = false
    await handler.handle(req, res, () => { nextCalled = true })
    if (!nextCalled || jsonBody !== undefined) break
  }
  return { status: statusCode, body: jsonBody }
}

beforeEach(() => {
  jest.clearAllMocks()
  db.getConsumerDailyUsage.mockResolvedValue(1)
  db.tryConsumeConsumerDailyUsage.mockResolvedValue({ allowed: true })
  db.completeReferral.mockResolvedValue(null)
})

test('free generation reserves user and global daily capacity before any model call', async () => {
  mockAnthropicCreate
    .mockResolvedValueOnce({ content: [{ text: 'SAFE' }] })
    .mockResolvedValueOnce({ content: [{ text: VALID_GAME_HTML }] })

  const response = await invokeGenerate({ prompt: FULL_PROMPT, gameType: 'browser' })
  expect(response.status).toBe(200)
  expect(response.body).toMatchObject({ success: true, remaining: 0 })
  expect(db.tryConsumeConsumerDailyUsage).toHaveBeenCalledWith([
    { metric: 'creator_generation', subjectId: 'user:7', limit: 1 },
    { metric: 'creator_generation', subjectId: 'global', limit: 25 }
  ])
  expect(db.tryConsumeConsumerDailyUsage.mock.invocationCallOrder[0])
    .toBeLessThan(mockAnthropicCreate.mock.invocationCallOrder[0])
})

test('exhausted daily allowance blocks model calls and checkout', async () => {
  db.tryConsumeConsumerDailyUsage.mockResolvedValue({ allowed: false, reason: 'user_limit' })
  const response = await invokeGenerate({ prompt: FULL_PROMPT, gameType: 'browser' })
  expect(response.status).toBe(429)
  expect(response.body).toMatchObject({ code: 'CREATOR_DAILY_LIMIT', remaining: 0 })
  expect(mockAnthropicCreate).not.toHaveBeenCalled()
})

test('global budget exhaustion blocks model calls', async () => {
  db.tryConsumeConsumerDailyUsage.mockResolvedValue({ allowed: false, reason: 'global_limit' })
  const response = await invokeGenerate({ prompt: FULL_PROMPT, gameType: 'browser' })
  expect(response.status).toBe(429)
  expect(response.body.error).toMatch(/daily AI allowance/)
  expect(mockAnthropicCreate).not.toHaveBeenCalled()
})

test('revisions use the same daily free allowance and remain unsaved', async () => {
  db.getGameById.mockResolvedValue({ id: 99, creator_id: 7, revision_count: 0 })
  mockAnthropicCreate.mockResolvedValueOnce({ content: [{ text: VALID_GAME_HTML }] })
  const response = await invokeGenerate({
    prompt: 'Make the player movement smoother', gameType: 'browser',
    mode: 'revise', existingHtml: VALID_GAME_HTML, gameId: 99
  })
  expect(response.status).toBe(200)
  expect(db.incrementRevisionCount).toHaveBeenCalledWith(99)
  expect(db.addGameVersion).not.toHaveBeenCalled()
})

test('oversized prompts are rejected before consuming quota', async () => {
  const response = await invokeGenerate({ prompt: 'x'.repeat(4001), gameType: 'browser' })
  expect(response.status).toBe(413)
  expect(db.tryConsumeConsumerDailyUsage).not.toHaveBeenCalled()
  expect(mockAnthropicCreate).not.toHaveBeenCalled()
})
