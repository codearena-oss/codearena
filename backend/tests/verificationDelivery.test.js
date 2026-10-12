jest.mock('otplib', () => ({ generateSecret: jest.fn(), generateURI: jest.fn(), verifySync: jest.fn() }))
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }))
jest.mock('../services/email', () => ({ sendEmail: jest.fn() }))
jest.mock('../db', () => ({
  getUserByEmail: jest.fn(), isUsernameAvailable: jest.fn(), createUser: jest.fn(),
  setEmailPreferences: jest.fn(), createEmailVerification: jest.fn(), isUserEmailVerified: jest.fn()
}))

const db = require('../db')
const { sendEmail } = require('../services/email')
const router = require('../routes/auth')
const handler = path => router.stack.find(layer => layer.route?.path === path).route.stack.at(-1).handle
const user = { id: 42, email: 'player@example.com', username: 'player42', avatar: 'default-1', created_at: '2026-10-12' }
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() })

beforeEach(() => {
  jest.clearAllMocks()
  db.getUserByEmail.mockResolvedValue(null)
  db.isUsernameAvailable.mockResolvedValue(true)
  db.createUser.mockResolvedValue(user)
  db.setEmailPreferences.mockResolvedValue()
  db.createEmailVerification.mockResolvedValue()
  db.isUserEmailVerified.mockResolvedValue(false)
})

test.each([{ success: false, error: 'private provider diagnostic' }, undefined, {}])('registration preserves the account but does not claim delivery on provider failure: %p', async result => {
  sendEmail.mockResolvedValue(result)
  const res = response()
  const next = jest.fn()
  await handler('/register')({ body: { email: user.email, username: user.username, password: 'TestOnly-Password-42!' } }, res, next)
  expect(next).not.toHaveBeenCalled()
  expect(db.createUser).toHaveBeenCalledTimes(1)
  expect(res.status).toHaveBeenCalledWith(201)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, verification_email_sent: false, message: expect.stringContaining('could not send') }))
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('private provider diagnostic')
})

test('registration reports provider acceptance without returning the verification token', async () => {
  sendEmail.mockResolvedValue({ success: true, id: 'test-message' })
  const res = response()
  await handler('/register')({ body: { email: user.email, username: user.username, password: 'TestOnly-Password-42!' } }, res, jest.fn())
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ verification_email_sent: true }))
  expect(db.createEmailVerification).toHaveBeenCalled()
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('verify-email?token=')
})

test.each([{ success: false }, undefined, {}])('resend fails honestly and preserves retry on provider failure: %p', async result => {
  db.getUserByEmail.mockResolvedValue(user)
  sendEmail.mockResolvedValueOnce(result).mockResolvedValueOnce({ success: true })
  const failed = response()
  await handler('/resend-verification')({ body: { email: user.email } }, failed, jest.fn())
  expect(failed.status).toHaveBeenCalledWith(503)
  expect(failed.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'verification_email_unavailable' }))
  const retried = response()
  await handler('/resend-verification')({ body: { email: user.email } }, retried, jest.fn())
  expect(retried.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
})

test('unknown addresses retain the generic response and trigger no email', async () => {
  const res = response()
  await handler('/resend-verification')({ body: { email: user.email } }, res, jest.fn())
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: expect.stringContaining('If an account exists') }))
  expect(sendEmail).not.toHaveBeenCalled()
})
