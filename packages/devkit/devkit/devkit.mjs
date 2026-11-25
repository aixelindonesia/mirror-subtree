#!/usr/bin/env node
// Copies a tool from an owner repository into packages/<owner>/<tool>/ and checks the copies against devkit.lock.json.
// A copy is read-only: check fails on any changed, missing, or extra file, and a change goes back to the owner.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

export const DEFAULT_SOURCE = 'git@github.com:aixelindonesia/devkit.git'
export const LOCK = 'devkit.lock.json'
const ALWAYS = new Set(['package.json', 'README.md', 'AGENTS.md'])
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/

/** @typedef {{ source: string, ref: string, commit: string, files: Record<string, string> }} Entry */
/** @typedef {{ tools: Record<string, Entry> }} Lock */

/** @param {string} cwd @param {string[]} args @returns {string} */
const git = (cwd, args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

/** @param {string} cwd */
const repoRoot = (cwd) => git(cwd, ['rev-parse', '--show-toplevel']).trim()

/** @param {Buffer | string} bytes */
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** @param {string} root @returns {Lock} */
export const readLock = (root) => {
  const file = path.join(root, LOCK)
  if (!existsSync(file)) return { tools: {} }
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** @param {string} root @param {Lock} lock */
const writeLock = (root, lock) => {
  const tools = Object.fromEntries(
    Object.entries(lock.tools).toSorted(([a], [b]) => a.localeCompare(b)),
  )
  writeFileSync(
    path.join(root, LOCK),
    `${JSON.stringify({ tools }, null, 2)}\n`,
  )
}

/** @param {string} tag */
const parts = (tag) => tag.slice(1).split('.').map(Number)

/** @param {string[]} tags */
export const newestTag = (tags) => {
  return tags
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .toSorted((a, b) => {
      const [x, y] = [parts(a), parts(b)]
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
    })
    .at(-1)
}

/** A checkout is named by its origin, so a lock never records a path on one machine. @param {string} source */
export const sourceUrl = (source) => {
  if (!existsSync(source)) return source
  try {
    return git(source, ['remote', 'get-url', 'origin']).trim()
  } catch {
    return path.basename(path.resolve(source))
  }
}

/** @param {string} source */
export const ownerOf = (source) =>
  path.basename(sourceUrl(source)).replace(/\.git$/, '')

/**
 * A local checkout is read in place, so a copy from one needs no network.
 * @param {string} source
 * @param {string | undefined} ref
 * @returns {{ dir: string, commit: string, ref: string, cleanup: () => void }}
 */
const openSource = (source, ref) => {
  if (existsSync(source)) {
    const wanted = ref ?? newestTag(git(source, ['tag', '--list']).split('\n'))
    if (!wanted)
      throw new Error(`${source} has no vX.Y.Z tag; name one with --ref`)
    const commit = git(source, ['rev-parse', `${wanted}^{commit}`]).trim()
    return { dir: source, commit, ref: wanted, cleanup: () => {} }
  }
  const wanted =
    ref ??
    newestTag(
      git(process.cwd(), ['ls-remote', '--tags', '--refs', source])
        .split('\n')
        .map((line) => line.split('refs/tags/')[1] ?? ''),
    )
  if (!wanted)
    throw new Error(`${source} has no vX.Y.Z tag; name one with --ref`)
  const dir = mkdtempSync(path.join(tmpdir(), 'devkit-'))
  git(dir, ['init', '--quiet'])
  git(dir, ['fetch', '--quiet', '--depth', '1', source, wanted])
  const commit = git(dir, ['rev-parse', 'FETCH_HEAD^{commit}']).trim()
  return {
    dir,
    commit,
    ref: wanted,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

/**
 * @param {string} dir @param {string} commit @param {string} tool
 * @returns {Map<string, Buffer>}
 */
export const toolFiles = (dir, commit, tool) => {
  const base = `tools/${tool}/`
  const listed = git(dir, ['ls-tree', '-r', '--name-only', commit, base])
    .split('\n')
    .filter(Boolean)
  if (!listed.includes(`${base}package.json`))
    throw new Error(
      `${tool} is not a tool at ${commit.slice(0, 7)}: no ${base}package.json`,
    )
  /** @param {string} file */
  const blob = (file) =>
    execFileSync('git', ['cat-file', 'blob', `${commit}:${file}`], { cwd: dir })
  /** @type {string[]} */
  const offered =
    JSON.parse(blob(`${base}package.json`).toString('utf8')).files ?? []
  const wanted = (/** @type {string} */ rel) =>
    !TEST_FILE.test(rel) &&
    (ALWAYS.has(rel) ||
      offered.some(
        (entry) =>
          rel === entry || rel.startsWith(`${entry.replace(/\/$/, '')}/`),
      ))
  const files = new Map()
  for (const file of listed) {
    const rel = file.slice(base.length)
    if (wanted(rel)) files.set(rel, blob(file))
  }
  return files
}

/** @param {string} dir @returns {string[]} */
const walk = (dir) => {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((rel) => !rel.split(path.sep).includes('node_modules'))
    .filter((rel) => statSync(path.join(dir, rel)).isFile())
    .map((rel) => rel.split(path.sep).join('/'))
}

/**
 * @param {{ root: string, tools: string[], source?: string, ref?: string }} options
 * @returns {string[]}
 */
export const add = ({ root, tools, source = DEFAULT_SOURCE, ref }) => {
  const owner = ownerOf(source)
  const opened = openSource(source, ref)
  const lock = readLock(root)
  const lines = []
  try {
    const wanted = [...tools]
    if (
      owner === 'devkit' &&
      !wanted.includes('devkit') &&
      !lock.tools['devkit/devkit']
    )
      wanted.push('devkit')
    for (const tool of wanted) {
      const files = toolFiles(opened.dir, opened.commit, tool)
      const target = path.join(root, 'packages', owner, tool)
      for (const rel of Object.keys(
        lock.tools[`${owner}/${tool}`]?.files ?? {},
      ))
        rmSync(path.join(target, rel), { force: true })
      /** @type {Record<string, string>} */
      const hashes = {}
      for (const [rel, bytes] of [...files].toSorted(([a], [b]) =>
        a.localeCompare(b),
      )) {
        mkdirSync(path.dirname(path.join(target, rel)), { recursive: true })
        writeFileSync(path.join(target, rel), bytes)
        hashes[rel] = sha256(bytes)
      }
      lock.tools[`${owner}/${tool}`] = {
        source: sourceUrl(source),
        ref: opened.ref,
        commit: opened.commit,
        files: hashes,
      }
      lines.push(
        `devkit: copied ${owner}/${tool} at ${opened.ref} (${opened.commit.slice(0, 7)}) into packages/${owner}/${tool}`,
      )
    }
  } finally {
    opened.cleanup()
  }
  writeLock(root, lock)
  return lines
}

/** @param {string} root @returns {string[]} */
export const check = (root) => {
  const problems = []
  for (const [key, entry] of Object.entries(readLock(root).tools)) {
    const target = path.join(root, 'packages', key)
    for (const [rel, hash] of Object.entries(entry.files)) {
      const file = path.join(target, rel)
      if (!existsSync(file)) problems.push(`packages/${key}/${rel} is missing`)
      else if (sha256(readFileSync(file)) !== hash)
        problems.push(`packages/${key}/${rel} differs from ${entry.ref}`)
    }
    for (const rel of walk(target))
      if (!(rel in entry.files))
        problems.push(`packages/${key}/${rel} is not in ${entry.ref}`)
  }
  return problems
}

const USAGE = `Usage: devkit <command> [options]

Commands:
  add <tool>... [--from <checkout|git url>] [--ref <tag|commit>]
                 Copy tools into packages/<owner>/<tool>/ and record them in devkit.lock.json.
                 --from defaults to ${DEFAULT_SOURCE}, --ref to its newest vX.Y.Z tag.
                 Run it again with a later --ref to update.
  check          Fail when a copy differs from devkit.lock.json.

Options:
  --dir <path>   The project that holds packages/ and devkit.lock.json (default: the git checkout's root).`

/** @param {string[]} argv */
export const main = (argv) => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      from: { type: 'string' },
      dir: { type: 'string' },
      ref: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const [command, ...rest] = positionals
  if (values.help || !command) {
    console.log(USAGE)
    return values.help ? 0 : 1
  }
  const root = values.dir ? path.resolve(values.dir) : repoRoot(process.cwd())
  if (command === 'add') {
    if (rest.length === 0) throw new Error('add needs a tool name')
    for (const line of add({
      root,
      tools: rest,
      source: values.from,
      ref: values.ref,
    }))
      console.log(line)
    return 0
  }
  if (command === 'check') {
    const problems = check(root)
    for (const problem of problems) console.error(`devkit: FAIL ${problem}`)
    if (problems.length === 0)
      console.log(
        `devkit: ${Object.keys(readLock(root).tools).length} copies match ${LOCK}`,
      )
    return problems.length === 0 ? 0 : 1
  }
  console.error(USAGE)
  return 1
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    console.error(
      `devkit: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 1
  }
}
