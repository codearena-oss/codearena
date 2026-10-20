'use strict'

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { LANGUAGES } = require('./harness')

// Every executor resolves to { status, stdout, stderr, timeMs }.
// status: "ok" | "compile_error" | "runtime_error" | "time_limit" | "unavailable"
// "unavailable" means the runner itself failed. Callers must never count it
// against the player.

// Judge0 (self-hosted or hosted). Untrusted code only ever runs here.
function judge0Executor({ url, authToken, rapidApiKey, rapidApiHost, timeoutMs = 20000, fetcher = fetch }) {
  if (!url) throw new Error('JUDGE0_URL is required for the judge0 executor')
  const base = url.replace(/\/+$/, '')
  const headers = { 'Content-Type': 'application/json' }
  if (authToken) headers['X-Auth-Token'] = authToken
  if (rapidApiKey) {
    headers['X-RapidAPI-Key'] = rapidApiKey
    headers['X-RapidAPI-Host'] = rapidApiHost || new URL(base).host
  }
  const b64 = text => Buffer.from(text || '', 'utf8').toString('base64')
  const unb64 = text => (text ? Buffer.from(text, 'base64').toString('utf8') : '')

  return async function execute({ language, source, stdin, timeLimitSeconds = 3 }) {
    const started = Date.now()
    let response
    try {
      response = await fetcher(`${base}/submissions?base64_encoded=true&wait=true`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          language_id: LANGUAGES[language].judge0Id,
          source_code: b64(source),
          stdin: b64(stdin),
          cpu_time_limit: timeLimitSeconds,
          wall_time_limit: timeLimitSeconds * 3,
          memory_limit: 256000,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      return { status: 'unavailable', stdout: '', stderr: `Runner unreachable: ${error.message}`, timeMs: Date.now() - started }
    }
    if (!response.ok) {
      return { status: 'unavailable', stdout: '', stderr: `Runner returned HTTP ${response.status}`, timeMs: Date.now() - started }
    }
    const body = await response.json()
    const statusId = body.status && body.status.id
    const stdout = unb64(body.stdout)
    const stderr = unb64(body.stderr) || unb64(body.compile_output) || unb64(body.message)
    const timeMs = body.time ? Math.round(Number(body.time) * 1000) : Date.now() - started
    if (statusId === 3) return { status: 'ok', stdout, stderr, timeMs }
    if (statusId === 5) return { status: 'time_limit', stdout, stderr, timeMs }
    if (statusId === 6) return { status: 'compile_error', stdout, stderr, timeMs }
    if (statusId >= 7 && statusId <= 12) return { status: 'runtime_error', stdout, stderr, timeMs }
    return { status: 'unavailable', stdout, stderr: stderr || `Runner status ${statusId}`, timeMs }
  }
}

// Runs code directly on this machine with node/python3/go. NOT a sandbox.
// Only for validating the trusted reference solutions and local development.
function localExecutor({ allowUntrusted = false } = {}) {
  if (!allowUntrusted && process.env.NODE_ENV === 'production') {
    throw new Error('The local executor is not a sandbox and cannot run in production')
  }
  const commands = {
    javascript: { command: 'node', ext: 'js' },
    typescript: { command: 'node', ext: 'js' },
    python: { command: 'python3', ext: 'py' },
  }
  return async function execute({ language, source, stdin, timeLimitSeconds = 3 }) {
    const started = Date.now()

    // Handle Go separately to support explicit compilation, type-checking errors as compile_error, and reliable process cleanup
    if (language === 'go') {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codearena-run-'))
      const srcFile = path.join(dir, 'solution.go')
      const binFile = path.join(dir, 'solution' + (os.platform() === 'win32' ? '.exe' : ''))
      fs.writeFileSync(srcFile, source)

      try {
        const buildResult = await new Promise((resolve) => {
          const compiler = spawn('go', ['build', '-o', binFile, srcFile])
          let stderr = ''
          let spawnError = null

          compiler.stderr.on('data', chunk => { stderr += chunk })
          compiler.on('error', err => {
            spawnError = err
            resolve({ code: -1, stderr: err.message })
          })
          compiler.on('close', code => {
            if (!spawnError) {
              resolve({ code, stderr })
            }
          })
        })

        if (buildResult.code !== 0) {
          fs.rmSync(dir, { recursive: true, force: true })
          const isMissing = buildResult.stderr.includes('ENOENT') || /not found|no such file/i.test(buildResult.stderr)
          if (isMissing) {
            return { status: 'unavailable', stdout: '', stderr: `Go compiler not found: ${buildResult.stderr}`, timeMs: Date.now() - started }
          }
          return { status: 'compile_error', stdout: '', stderr: buildResult.stderr, timeMs: Date.now() - started }
        }
      } catch (error) {
        fs.rmSync(dir, { recursive: true, force: true })
        return { status: 'unavailable', stdout: '', stderr: error.message, timeMs: Date.now() - started }
      }

      return new Promise(resolve => {
        const child = spawn(binFile, [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: os.platform() !== 'win32',
        })
        let stdout = ''
        let stderr = ''
        let timedOut = false
        const timer = setTimeout(() => {
          timedOut = true
          try {
            if (os.platform() !== 'win32') {
              process.kill(-child.pid, 'SIGKILL')
            } else {
              child.kill('SIGKILL')
            }
          } catch {}
        }, timeLimitSeconds * 1000)

        child.stdout.on('data', chunk => { stdout += chunk })
        child.stderr.on('data', chunk => { stderr += chunk })
        child.on('close', code => {
          clearTimeout(timer)
          try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
          const timeMs = Date.now() - started
          if (timedOut) return resolve({ status: 'time_limit', stdout, stderr, timeMs })
          if (code !== 0) {
            return resolve({ status: 'runtime_error', stdout, stderr, timeMs })
          }
          resolve({ status: 'ok', stdout, stderr, timeMs })
        })
        child.on('error', error => {
          clearTimeout(timer)
          try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
          resolve({ status: 'unavailable', stdout: '', stderr: error.message, timeMs: Date.now() - started })
        })
        if (stdin) {
          child.stdin.write(stdin)
        }
        child.stdin.end()
      })
    }

    const config = commands[language]
    if (!config) {
      return { status: 'unavailable', stdout: '', stderr: `Unsupported local language: ${language}`, timeMs: 0 }
    }

    return new Promise(resolve => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codearena-run-'))
      const file = path.join(dir, `solution.${config.ext}`)
      fs.writeFileSync(file, source)
      
      const cmd = config.command
      const args = [file]

      const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeLimitSeconds * 1000)
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
      child.on('close', code => {
        clearTimeout(timer)
        fs.rmSync(dir, { recursive: true, force: true })
        const timeMs = Date.now() - started
        if (timedOut) return resolve({ status: 'time_limit', stdout, stderr, timeMs })
        if (code !== 0) {
          const syntax = /SyntaxError|IndentationError|syntax error/i.test(stderr)
          return resolve({ status: syntax ? 'compile_error' : 'runtime_error', stdout, stderr, timeMs })
        }
        resolve({ status: 'ok', stdout, stderr, timeMs })
      })
      child.on('error', error => {
        clearTimeout(timer)
        resolve({ status: 'unavailable', stdout: '', stderr: error.message, timeMs: Date.now() - started })
      })
      child.stdin.end(stdin)
    })
  }
}

// Picks the executor from the environment:
//   CODEARENA_RUNNER=local        run on this machine (development only, no sandbox)
//   JUDGE0_URL                    a Judge0 server, self-hosted or hosted
//   RAPIDAPI_KEY                  Judge0 CE on RapidAPI (JUDGE0_URL defaults to it)
//   JUDGE0_AUTH_TOKEN             X-Auth-Token for a protected self-hosted Judge0
// With nothing configured, development falls back to the local runner so a fresh
// clone works; production refuses to start without a sandbox.
function runnerChoice(env = process.env) {
  const rapidApiKey = env.RAPIDAPI_KEY || env.JUDGE0_RAPIDAPI_KEY
  const url = env.JUDGE0_URL || (rapidApiKey ? 'https://judge0-ce.p.rapidapi.com' : '')
  if (env.CODEARENA_RUNNER === 'local') {
    if (env.NODE_ENV === 'production') {
      throw new Error('CODEARENA_RUNNER=local is not a sandbox and cannot run in production; set JUDGE0_URL')
    }
    return { kind: 'local', explicit: true }
  }
  if (url) return { kind: 'judge0', url, rapidApiKey, authToken: env.JUDGE0_AUTH_TOKEN, rapidApiHost: env.JUDGE0_RAPIDAPI_HOST }
  if (env.NODE_ENV === 'production') {
    throw new Error('No code runner configured: set JUDGE0_URL (or RAPIDAPI_KEY). CODEARENA_RUNNER=local is not allowed in production.')
  }
  return { kind: 'local', explicit: false }
}

function describeRunner(env = process.env) {
  const choice = runnerChoice(env)
  if (choice.kind === 'judge0') return `Code runner: Judge0 at ${choice.url}${choice.rapidApiKey ? ' (RapidAPI)' : ''}`
  return choice.explicit
    ? 'Code runner: LOCAL (CODEARENA_RUNNER=local). Player code runs on this machine without a sandbox. Development only.'
    : 'Code runner: LOCAL fallback because neither JUDGE0_URL nor RAPIDAPI_KEY is set. Player code runs on this machine without a sandbox. Development only.'
}

function executorFromEnv(env = process.env) {
  const choice = runnerChoice(env)
  if (choice.kind === 'local') return localExecutor()
  return judge0Executor({
    url: choice.url,
    authToken: choice.authToken,
    rapidApiKey: choice.rapidApiKey,
    rapidApiHost: choice.rapidApiHost,
  })
}

module.exports = { judge0Executor, localExecutor, executorFromEnv, describeRunner, runnerChoice }