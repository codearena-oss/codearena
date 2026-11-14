import React, { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import VerifyEmailChange from '../pages/verify-email-change';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/router';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('next/router', () => ({ useRouter: jest.fn() }));
jest.mock('../components/ui/Logo', () => () => null);
jest.mock('../components/ui/FloatingOrbs', () => () => null);
jest.mock('../components/ui/Motion', () => ({ FadeIn: ({ children }) => children, Float: ({ children }) => children }));
jest.mock('framer-motion', () => ({ motion: { div: ({ children }) => children, header: ({ children }) => children } }));

let auth;
let router;
beforeEach(() => {
  auth = { verifyEmailChange: jest.fn().mockResolvedValue({ success: true }), verifyEmail: jest.fn(), isAuthenticated: false, setEmailVerified: jest.fn() };
  router = { isReady: true, pathname: '/verify-email-change', query: { token: 'test-verification-token' }, push: jest.fn() };
  useAuth.mockImplementation(() => auth);
  useRouter.mockImplementation(() => router);
});

test('issued email-change links use the correct endpoint once, including StrictMode and auth updates', async () => {
  const view = render(<StrictMode><VerifyEmailChange /></StrictMode>);
  await waitFor(() => expect(auth.verifyEmailChange).toHaveBeenCalledTimes(1));
  expect(auth.verifyEmailChange).toHaveBeenCalledWith('test-verification-token');
  expect(auth.verifyEmail).not.toHaveBeenCalled();
  auth = { ...auth, isAuthenticated: true };
  view.rerender(<StrictMode><VerifyEmailChange /></StrictMode>);
  expect(auth.verifyEmailChange).toHaveBeenCalledTimes(1);
});

test.each([undefined, ['first', 'second']])('missing or ambiguous tokens never call either endpoint: %p', token => {
  router.query.token = token;
  render(<VerifyEmailChange />);
  expect(screen.getByText('No verification token provided')).toBeInTheDocument();
  expect(auth.verifyEmailChange).not.toHaveBeenCalled();
  expect(auth.verifyEmail).not.toHaveBeenCalled();
});

test('expired email-change tokens show an error without attempting account verification', async () => {
  auth.verifyEmailChange.mockRejectedValue(new Error('Invalid or expired verification link'));
  render(<VerifyEmailChange />);
  expect(await screen.findByText('Invalid or expired verification link')).toBeInTheDocument();
  expect(auth.verifyEmail).not.toHaveBeenCalled();
});

test('ordinary signup verification still uses its own endpoint', async () => {
  router.pathname = '/verify-email';
  auth.verifyEmail.mockResolvedValue({ success: true });
  render(<VerifyEmailChange />);
  expect(await screen.findByText('Email Verified!')).toBeInTheDocument();
  expect(auth.verifyEmail).toHaveBeenCalledWith('test-verification-token');
  expect(auth.verifyEmailChange).not.toHaveBeenCalled();
});
