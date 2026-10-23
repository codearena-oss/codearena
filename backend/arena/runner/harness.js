'use strict'

// Builds a self-contained program from a player's solution plus a small driver.
// The driver reads {"tests":[{"args":[...]}]} as JSON on stdin, calls the
// player's function once per test, and prints one marker line followed by a
// JSON array of results. Anything the player prints themselves stays on stdout
// before the marker and is returned separately as their console output.

const RESULT_MARKER = '__CODEARENA_RESULTS__'
const markerFor = nonce => `${RESULT_MARKER}${nonce}__`

const LANGUAGES = {
  javascript: { label: 'JavaScript', judge0Id: 63 },
  python: { label: 'Python 3', judge0Id: 71 },
  typescript: { label: 'TypeScript', judge0Id: 74 },
  go: { label: 'Go', judge0Id: 60 },
}

const GO_KEYWORDS = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
  'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
  'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var'
])

function sanitizeParamName(name) {
  if (GO_KEYWORDS.has(name) || name === 'map') {
    return `p_${name}`
  }
  return name
}

function cleanCandidateCode(rawCode) {
  if (!rawCode) return ''
  // Only remove package declarations, but leave import blocks and statements intact so user imports like "container/heap" or "sort" are preserved.
  let cleaned = rawCode.replace(/^\s*package\s+\w+/gm, '')
  return cleaned
}

function functionNameFor(problem, language) {
  const fn = problem.function
  if (language === 'python') return fn.pythonName
  if (language === 'go') return fn.goName || fn.name
  return fn.name
}

function javascriptProgram(code, name, marker, typescript = false) {
  const prelude = typescript ? 'declare var require: any; declare var process: any;\n' : ''
  return `${prelude}${code}

;(function __codearenaMain() {
  const __input = JSON.parse(require('fs').readFileSync(0, 'utf8'))
  const __fn = typeof ${name} === 'function' ? ${name} : null
  const __results = __input.tests.map(test => {
    if (!__fn) return { ok: false, error: 'Function ${name} is not defined' }
    try {
      const value = __fn.apply(null, JSON.parse(JSON.stringify(test.args)))
      return { ok: true, value: value === undefined ? null : value }
    } catch (error) {
      return { ok: false, error: String(error && error.message ? error.message : error) }
    }
  })
  process.stdout.write('\\n${marker}\\n' + JSON.stringify(__results) + '\\n')
})()
`
}

function pythonProgram(code, name, marker) {
  return `${code}

def __codearena_main():
    import json, sys, copy
    data = json.loads(sys.stdin.read())
    fn = globals().get(${JSON.stringify(name)})
    results = []
    for test in data["tests"]:
        if not callable(fn):
            results.append({"ok": False, "error": "Function ${name} is not defined"})
            continue
        try:
            value = fn(*copy.deepcopy(test["args"]))
            if isinstance(value, tuple):
                value = list(value)
            results.append({"ok": True, "value": value})
        except Exception as error:
            results.append({"ok": False, "error": str(error) or type(error).__name__})
    sys.stdout.write("\\n${marker}\\n" + json.dumps(results) + "\\n")

__codearena_main()
`
}

function goProgram(code, name, marker, problem) {
  const mapType = (t) => {
    if (t === 'integer') return 'int'
    if (t === 'number') return 'float64'
    if (t === 'boolean') return 'bool'
    if (t.endsWith('[]')) return `[]${mapType(t.slice(0, -2))}`
    return 'string'
  }

  const params = problem && problem.function && problem.function.params ? problem.function.params : []

  const paramDecls = params.map((p, idx) => {
    const argVar = `arg${idx}`
    return `
    var ${argVar} ${mapType(p.type)}
    if err := json.Unmarshal(test.Args[${idx}], &${argVar}); err != nil {
      results = append(results, TestResult{Ok: false, Error: fmt.Sprintf("Decoding error for argument %d (${p.name}): %v", ${idx}, err)})
      continue
    }
  `
  }).join('\n')

  const argList = params.map((_, idx) => `arg${idx}`).join(', ')
  const sanitizedCode = cleanCandidateCode(code)

  return `package main

import (
  "encoding/json"
  "fmt"
  "io/ioutil"
  "os"
  "reflect"
)

${sanitizedCode}

type TestInput struct {
  Tests []struct {
    Args []json.RawMessage \`json:"args"\`
  } \`json:"tests"\`
}

type TestResult struct {
  Ok    bool        \`json:"ok"\`
  Value interface{} \`json:"value"\`
  Error string      \`json:"error,omitempty"\`
}

func main() {
  inputData, err := ioutil.ReadAll(os.Stdin)
  if err != nil {
    return
  }

  var input TestInput
  if err := json.Unmarshal(inputData, &input); err != nil {
    return
  }

  results := []TestResult{}

  for _, test := range input.Tests {
    if len(test.Args) < ${params.length} {
      results = append(results, TestResult{Ok: false, Error: "Insufficient arguments provided"})
      continue
    }

    ${paramDecls}

    func() {
      defer func() {
        if r := recover(); r != nil {
          results = append(results, TestResult{
            Ok:    false,
            Error: fmt.Sprintf("Panic: %v", r),
          })
        }
      }()

      res := ${name}(${argList})

      var val interface{} = res
      if reflect.TypeOf(res) != nil && reflect.TypeOf(res).Kind() == reflect.Slice && reflect.ValueOf(res).IsNil() {
        val = []interface{}{}
      }

      results = append(results, TestResult{
        Ok:    true,
        Value: val,
      })
    }()
  }

  out, _ := json.Marshal(results)
  fmt.Printf("\\n${marker}\\n%s\\n", string(out))
}
`
}

function buildProgram({ language, code, problem, nonce }) {
  if (!/^[a-f0-9]{16,}$/.test(nonce || '')) throw new Error('A random hex nonce is required')
  if (!LANGUAGES[language]) throw new Error(`Unsupported language: ${language}`)
  const name = functionNameFor(problem, language)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid function name: ${name}`)
  const marker = markerFor(nonce)
  if (language === 'python') return pythonProgram(code, name, marker)
  if (language === 'go') return goProgram(code, name, marker, problem)
  return javascriptProgram(code, name, marker, language === 'typescript')
}

function buildStdin(tests) {
  return JSON.stringify({ tests: tests.map(test => ({ args: test.args })) })
}

function parseOutput(stdout, nonce) {
  const text = stdout || ''
  const marker = markerFor(nonce)
  const index = text.lastIndexOf(`\n${marker}\n`)
  if (index === -1) return { consoleOutput: text, results: null }
  const tail = text.slice(index + marker.length + 2).trim()
  try {
    return { consoleOutput: text.slice(0, index), results: JSON.parse(tail) }
  } catch {
    return { consoleOutput: text.slice(0, index), results: null }
  }
}

function starterCode(problem, language) {
  const fn = problem.function
  const params = fn.params.map(p => sanitizeParamName(p.name))
  if (language === 'python') {
    const pyParams = params.map(toSnakeCase)
    return `def ${fn.pythonName}(${pyParams.join(', ')}):\n    # Your code here\n    pass\n`
  }
  if (language === 'typescript') {
    const typed = fn.params.map((p, i) => `${params[i]}: ${tsType(p.type)}`)
    return `function ${fn.name}(${typed.join(', ')}): ${tsType(fn.returns)} {\n  // Your code here\n}\n`
  }
  if (language === 'go') {
    const mapType = (t) => {
      if (t === 'integer') return 'int'
      if (t === 'number') return 'float64'
      if (t === 'boolean') return 'bool'
      if (t.endsWith('[]')) return `[]${mapType(t.slice(0, -2))}`
      return 'string'
    }
    const typed = fn.params.map((p, i) => `${params[i]} ${mapType(p.type)}`)
    const retType = mapType(fn.returns)
    let defaultReturn = '0'
    if (retType === 'string') defaultReturn = '""'
    else if (retType === 'bool') defaultReturn = 'false'
    else if (retType.startsWith('[]')) defaultReturn = 'nil'

    return `func ${fn.name}(${typed.join(', ')}) ${retType} {\n  // Your code here\n  return ${defaultReturn}\n}\n`
  }
  return `function ${fn.name}(${params.join(', ')}) {\n  // Your code here\n}\n`
}

function tsType(type) {
  return String(type || 'any').replace(/integer|float/g, 'number')
}

function toSnakeCase(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

module.exports = {
  LANGUAGES,
  RESULT_MARKER,
  buildProgram,
  buildStdin,
  parseOutput,
  starterCode,
  toSnakeCase,
  tsType,
}