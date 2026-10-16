'use strict'

const { execSync } = require('node:child_process')
const { buildProgram, starterCode } = require('../arena/runner/harness')

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

  test('e2e Go execution (skipped if go binary is missing)', () => {
    let hasGo = false
    try {
      execSync('go version', { stdio: 'ignore' })
      hasGo = true
    } catch {
      hasGo = false
    }

    if (!hasGo) {
      console.log('Skipping E2E Go test: `go` binary not found on PATH')
      return
    }

    const { localExecutor } = require('../arena/runner/executors')
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

    return executor({ language: 'go', source: program, stdin, timeLimitSeconds: 3 }).then(res => {
      expect(res.status).toBe('ok')
      expect(res.stdout).toContain('__CODEARENA_RESULTS__')
      expect(res.stdout).toContain('"ok":true')
      expect(res.stdout).toContain('"value":[0,1]')
    })
  })
})