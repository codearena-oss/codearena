import React from 'react';
import { act, render, screen } from '@testing-library/react';
import ProblemPage, { getStaticProps } from '../pages/problems/[slug]';
import { useAuth } from '../contexts/AuthContext';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../components/Header', () => () => null);
jest.mock('../config/env', () => ({ config: { backend_url: 'http://localhost:3999' } }));

// This route is the public summary; the editor and execution controls live in /practice.
const problem = {
  id: 'add-pair',
  title: 'Add a pair',
  difficulty: 'Easy',
  tags: ['Arithmetic'],
  description: 'Return the **sum** of two integers.',
  examples: [{ input: '4, 7', output: '11', explanation: 'Adding four and seven gives eleven.' }],
  constraints: ['Both integers are between 0 and 20.'],
};
const solution = { code: 'function add(a, b) { return a + b; }', language: 'javascript' };

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  fetch.mockReset();
  useAuth.mockReturnValue({ token: null });
});

test('shows the public problem details and links to the library, practice and battles', () => {
  render(<ProblemPage problem={problem} />);

  expect(screen.getByRole('heading', { name: 'Add a pair', level: 1 })).toBeVisible();
  expect(screen.getByText('Easy')).toBeVisible();
  expect(screen.getByText('Arithmetic')).toBeVisible();
  expect(screen.getByRole('main')).toHaveTextContent('Return the sum of two integers.');
  expect(screen.getByRole('heading', { name: 'Examples' })).toBeVisible();
  expect(screen.getByText('4, 7')).toBeVisible();
  expect(screen.getByText('11')).toBeVisible();
  expect(screen.getByText('Adding four and seven gives eleven.')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Constraints' })).toBeVisible();
  expect(screen.getByText('Both integers are between 0 and 20.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Problem library' })).toHaveAttribute('href', '/problems');
  expect(screen.getByRole('link', { name: 'Warm up with this problem' })).toHaveAttribute('href', '/practice?problem=add-pair');
  expect(screen.getByRole('link', { name: 'Battle on it' })).toHaveAttribute('href', '/matchmaking');
  expect(screen.queryByRole('heading', { name: /Your accepted solution/ })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

test.each([[], undefined])('omits empty or missing optional sections (%p) while keeping the problem available', value => {
  render(<ProblemPage problem={{ ...problem, tags: value, examples: value, constraints: value }} />);

  expect(screen.getByRole('heading', { name: 'Add a pair' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Warm up with this problem' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Examples' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Constraints' })).not.toBeInTheDocument();
  expect(screen.queryByText('Arithmetic')).not.toBeInTheDocument();
});

test('keeps the problem readable while loading, then shows the signed-in player’s accepted code and language', async () => {
  useAuth.mockReturnValue({ token: 'test-token' });
  const request = deferred();
  fetch.mockReturnValueOnce(request.promise);
  render(<ProblemPage problem={problem} />);

  expect(screen.getByRole('heading', { name: 'Add a pair' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: /Your accepted solution/ })).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith('http://localhost:3999/api/practice/solution/add-pair', {
    headers: { Authorization: 'Bearer test-token' },
  });

  await act(async () => {
    request.resolve({ ok: true, json: async () => ({ success: true, solution }) });
  });

  expect(screen.getByRole('heading', { name: 'Your accepted solution (JavaScript)' })).toBeVisible();
  expect(screen.getByText(solution.code)).toBeVisible();
});

test.each([
  ['no saved solution', { success: true, solution: null }],
  ['empty saved code', { success: true, solution: { ...solution, code: '' } }],
  ['unsuccessful response', { success: false, solution }],
])('keeps the public problem available without an accepted-solution panel for %s', async (_name, data) => {
  useAuth.mockReturnValue({ token: 'test-token' });
  fetch.mockResolvedValueOnce({ ok: true, json: async () => data });

  await act(async () => { render(<ProblemPage problem={problem} />); });

  expect(screen.getByRole('heading', { name: 'Add a pair' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Warm up with this problem' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: /Your accepted solution/ })).not.toBeInTheDocument();
  expect(screen.queryByText(solution.code)).not.toBeInTheDocument();
});

test('does not display solution data from a failed HTTP response', async () => {
  useAuth.mockReturnValue({ token: 'test-token' });
  fetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ success: true, solution }) });

  await act(async () => { render(<ProblemPage problem={problem} />); });

  expect(screen.getByRole('heading', { name: 'Add a pair' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: /Your accepted solution/ })).not.toBeInTheDocument();
  expect(screen.queryByText(solution.code)).not.toBeInTheDocument();
});

test('keeps the public details and practice link usable when the solution request rejects', async () => {
  useAuth.mockReturnValue({ token: 'test-token' });
  fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

  await act(async () => { render(<ProblemPage problem={problem} />); });

  expect(screen.getByRole('heading', { name: 'Add a pair' })).toBeVisible();
  expect(screen.getByText('4, 7')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Warm up with this problem' })).toHaveAttribute('href', '/practice?problem=add-pair');
  expect(screen.queryByRole('heading', { name: /Your accepted solution/ })).not.toBeInTheDocument();
});

test('removes a loaded accepted solution when the player signs out', async () => {
  useAuth.mockReturnValue({ token: 'test-token' });
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, solution }) });
  const { rerender } = render(<ProblemPage problem={problem} />);
  expect(await screen.findByText(solution.code)).toBeVisible();

  useAuth.mockReturnValue({ token: null });
  rerender(<ProblemPage problem={problem} />);

  expect(screen.queryByRole('heading', { name: /Your accepted solution/ })).not.toBeInTheDocument();
  expect(screen.queryByText(solution.code)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Add a pair' })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('does not reveal a late accepted solution after the player signs out', async () => {
  useAuth.mockReturnValue({ token: 'test-token' });
  const request = deferred();
  fetch.mockReturnValueOnce(request.promise);
  const { rerender } = render(<ProblemPage problem={problem} />);

  useAuth.mockReturnValue({ token: null });
  rerender(<ProblemPage problem={problem} />);
  await act(async () => {
    request.resolve({ ok: true, json: async () => ({ success: true, solution }) });
  });

  expect(screen.queryByRole('heading', { name: /Your accepted solution/ })).not.toBeInTheDocument();
  expect(screen.queryByText(solution.code)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Add a pair' })).toBeVisible();
});

test('an older problem response cannot overwrite the current problem’s accepted solution', async () => {
  useAuth.mockReturnValue({ token: 'test-token' });
  const oldRequest = deferred();
  const currentSolution = { code: 'def double(n): return n * 2', language: 'python' };
  fetch.mockReturnValueOnce(oldRequest.promise)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, solution: currentSolution }) });
  const { rerender } = render(<ProblemPage problem={problem} />);

  rerender(<ProblemPage problem={{ ...problem, id: 'double', title: 'Double a number' }} />);
  expect(await screen.findByText(currentSolution.code)).toBeVisible();
  await act(async () => {
    oldRequest.resolve({ ok: true, json: async () => ({ success: true, solution }) });
  });

  expect(screen.getByRole('heading', { name: 'Double a number' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Your accepted solution (Python)' })).toBeVisible();
  expect(screen.getByText(currentSolution.code)).toBeVisible();
  expect(screen.queryByText(solution.code)).not.toBeInTheDocument();
});

describe('getStaticProps', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('returns a permanent not-found result for a 404 without retrying', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404 });
    const result = getStaticProps({ params: { slug: problem.id } });

    await jest.runAllTimersAsync();

    expect(await result).toEqual({ notFound: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('exhausts three attempts on server errors and allows a later revalidation', async () => {
    fetch.mockResolvedValue({ ok: false, status: 503 });
    const result = getStaticProps({ params: { slug: problem.id } });

    await jest.runAllTimersAsync();

    expect(await result).toEqual({ notFound: true, revalidate: 30 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('retries a server error and returns the recovered public problem', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ problem }) });
    const result = getStaticProps({ params: { slug: problem.id } });

    await jest.runAllTimersAsync();

    expect(await result).toEqual({ props: { problem }, revalidate: 3600 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:3999/api/problems/add-pair');
  });

  test.each(['wrapped', 'direct'])('excludes execution tests and starter code from %s problem props', async format => {
    const fullProblem = {
      ...problem,
      testCases: [{ input: [4, 7], expectedOutput: 11 }],
      starterCode: { javascript: 'function add(a, b) {}' },
    };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => format === 'wrapped' ? { problem: fullProblem } : fullProblem,
    });

    const result = await getStaticProps({ params: { slug: problem.id } });

    expect(result).toEqual({ props: { problem }, revalidate: 3600 });
    expect(result.props.problem).not.toHaveProperty('testCases');
    expect(result.props.problem).not.toHaveProperty('starterCode');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
