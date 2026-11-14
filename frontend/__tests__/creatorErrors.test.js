import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import Creator from '../pages/create'

const mockRouter = { query: {}, push: jest.fn(), replace: jest.fn() }
const mockAuth = { token: 'creator-token', user: { id: 1 } }
jest.mock('next/router', () => ({ useRouter: () => mockRouter }))
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('../components/withAuth', () => ({ withAuth: component => component }))
jest.mock('../components/Logo', () => () => null)
jest.mock('../components/SearchBar', () => () => null)
jest.mock('../components/NotificationBell', () => () => null)
jest.mock('../components/tutorial', () => ({ useTutorial: () => ({ hasLoadedPersistedState: false }) }))
jest.mock('../utils/analytics', () => ({ trackTourStarted: jest.fn(), trackTourCompleted: jest.fn(), trackTourSkipped: jest.fn() }))

function response(body, ok = true) { return { ok, json: async () => body } }

beforeEach(() => {
  jest.clearAllMocks()
  mockRouter.query = {}
  global.fetch = jest.fn(async url => {
    if (url.endsWith('/api/ai/credits')) return response({ success: true, remaining: 1, limit: 1 })
    if (url.endsWith('/api/games/mine')) return response({ games: [{ id: 9, title: 'Saved game', status: 'draft' }] })
    return response({ error: 'Game is unavailable' }, false)
  })
})

test('CreatorArena shows a free daily allowance with no checkout', async () => {
  render(<Creator />)
  expect(await screen.findByText('free uses left today')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add credits' })).not.toBeInTheDocument()
  expect(screen.queryByText('$5')).not.toBeInTheDocument()
  expect(global.fetch.mock.calls.some(([url]) => url.includes('/purchase-credits'))).toBe(false)
})

test('a failed edit link shows the API error instead of silently opening a blank editor', async () => {
  mockRouter.query = { edit: '9' }
  render(<Creator />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Game is unavailable')
  expect(screen.queryByTitle('Game Preview')).not.toBeInTheDocument()
})

test('loading an unavailable saved game displays a recoverable error', async () => {
  render(<Creator />)
  fireEvent.click(screen.getByTitle('My Games'))
  fireEvent.click(await screen.findByRole('button', { name: /Saved game/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Game is unavailable')
})
