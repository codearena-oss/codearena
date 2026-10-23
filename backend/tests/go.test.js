'use strict'

const { execSync } = require('node:child_process')
const { buildProgram, starterCode } = require('../arena/runner/harness')
const { localExecutor } = require('../arena/runner/executors')

const sampleProblem = {
  function: {
    name: 'twoSum',
    pythonName: 'two_sum',
    params: [
      { name: 'nums', type: 'integer[]' },
      { name: 'target', type: 'integer' }
    ],
    returns: 'integer[]'
  }
}

let hasGo = false
try {
  execSync('go version', { stdio: 'ignore' })
  hasGo = true
} catch {
  hasGo = false
}

const goTest = hasGo ? test : test.skip

describe('Go harness & starter code', () => {
  test('generates valid starter code', () => {
    const code = starterCode(sampleProblem, 'go')
    expect(code).toContain('func twoSum(nums []int, target int) []int')
  })

  test('generates program with package main at the very top', () => {
    const program = buildProgram({
      language: 'go',
      code: 'func twoSum(nums []int, target int) []int { return []int{0, 1} }',
      problem: sampleProblem,
      nonce: '0123456789abcdef0123456789abcdef'
    })
    expect(program.trim().startsWith('package main')).toBe(true)
    expect(program).toContain('json.RawMessage')
    expect(program).toContain('defer func() {')
    expect(program).toContain('recover()')
  })

  goTest('preserves user imports such as container/heap and sort', () => {
    const importCode = `
import (
  "container/heap"
  "sort"
)
func twoSum(nums []int, target int) []int {
  return nums
}
`
    const program = buildProgram({
      language: 'go',
      code: importCode,
      problem: sampleProblem,
      nonce: '0123456789abcdef0123456789abcdef'
    })
    expect(program).toContain('"container/heap"')
    expect(program).toContain('"sort"')
  })

  goTest('avoids argument name collision with driver variables like results', async () => {
    const collisionProblem = {
      function: {
        name: 'winStreak',
        goName: 'winStreak',
        params: [
          { name: 'results', type: 'string[]' }
        ],
        returns: 'integer'
      }
    }
    const collisionCode = `
func winStreak(results []string) int {
  return len(results)
}
`
    const program = buildProgram({
      language: 'go',
      code: collisionCode,
      problem: collisionProblem,
      nonce: '0123456789abcdef0123456789abcdef'
    })
    const executor = localExecutor({ allowUntrusted: true })
    const stdin = JSON.stringify({
      tests: [{ args: [["win", "loss"]] }]
    })
    const res = await executor({ language: 'go', source: program, stdin, timeLimitSeconds: 3 })
    expect(res.status).toBe('ok')
    expect(res.stdout).toContain('"ok":true')
    expect(res.stdout).toContain('"value":2')
  }, 10000)

  goTest('e2e Go execution works correctly', async () => {
    const executor = localExecutor({ allowUntrusted: true })

    const code = `
func twoSum(nums []int, target int) []int {
  return []int{0, 1}
}
`
    const program = buildProgram({
      language: 'go',
      code,
      problem: sampleProblem,
      nonce: '0123456789abcdef0123456789abcdef'
    })

    const stdin = JSON.stringify({
      tests: [{ args: [[2, 7, 11, 15], 9] }]
    })

    const res = await executor({ language: 'go', source: program, stdin, timeLimitSeconds: 3 })
    expect(res.status).toBe('ok')
    expect(res.stdout).toContain('__CODEARENA_RESULTS__')
    expect(res.stdout).toContain('"ok":true')
    expect(res.stdout).toContain('"value":[0,1]')
  }, 10000)

  goTest('handles Go compile errors correctly', async () => {
    const executor = localExecutor({ allowUntrusted: true })
    const invalidCode = 'this is not valid go code'
    const program = buildProgram({
      language: 'go',
      code: invalidCode,
      problem: sampleProblem,
      nonce: '0123456789abcdef0123456789abcdef'
    })

    const res = await executor({ language: 'go', source: program, stdin: '{"tests":[]}', timeLimitSeconds: 3 })
    expect(res.status).toBe('compile_error')
    expect(res.stderr).toBeTruthy()
  })

  goTest('handles Go runtime panics safely', async () => {
    const executor = localExecutor({ allowUntrusted: true })
    const panicCode = `
func twoSum(nums []int, target int) []int {
  panic("intentional test panic")
}
`
    const program = buildProgram({
      language: 'go',
      code: panicCode,
      problem: sampleProblem,
      nonce: '0123456789abcdef0123456789abcdef'
    })

    const stdin = JSON.stringify({
      tests: [{ args: [[1, 2], 3] }]
    })

    const res = await executor({ language: 'go', source: program, stdin, timeLimitSeconds: 3 })
    expect(res.status).toBe('ok')
    expect(res.stdout).toContain('"ok":false')
    expect(res.stdout).toContain('Panic: intentional test panic')
  })
})