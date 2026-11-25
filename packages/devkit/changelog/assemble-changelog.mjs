#!/usr/bin/env node
// Folds the fragments in .changes/ into one release of CHANGELOG.md and deletes them.
// Node builtins only: an adopting repository copies this one file.
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

export const FRAGMENTS = '.changes'
export const CHANGELOG = 'CHANGELOG.md'
export const CATEGORIES = ['Added', 'Changed', 'Fixed', 'Removed', 'Security']
export const BUMPS = ['patch', 'minor', 'major']
const KEYS = ['bump', 'libraries']

/** @typedef {'semver' | 'calver'} Scheme */
/** @typedef {{ category: string, body: string }} Section */
/**
 * @typedef {{
 *   bump: string | null,
 *   libraries: string[],
 *   sections: Section[],
 *   problems: string[],
 * }} Fragment
 */

const SEMVER_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const CALVER_TAG = /^v(\d{4})\.(0[1-9]|1[0-2])\.(0|[1-9]\d*)$/
const RELEASE_LIKE = /^v?\d/

/**
 * The scheme a tier releases by; null for a tier that takes no release tags.
 * @param {string} tier
 * @returns {Scheme | null}
 */
export const schemeOf = (tier) =>
  tier === 'library' ? 'semver' : tier === 'product' ? 'calver' : null

/**
 * The tier `.repo-rules.yaml` declares; repo-rules checks a repository without one as product.
 * @param {string} root
 */
export const readTier = (root) => {
  const file = join(root, '.repo-rules.yaml')
  if (!existsSync(file)) return 'product'
  const line = readFileSync(file, 'utf8').match(/^tier:\s*['"]?([\w-]+)/m)
  return line ? line[1] : 'product'
}

/** @param {string} raw */
const unquote = (raw) => raw.trim().replace(/^['"]|['"]$/g, '')

/**
 * @param {string} raw
 * @param {string[]} following
 */
const parseList = (raw, following) => {
  const flow = raw.match(/^\[(.*)\]$/)
  if (flow) return flow[1].split(',').map(unquote).filter(Boolean)
  if (raw !== '') return [unquote(raw)]
  const items = []
  for (const line of following) {
    const item = line.match(/^\s*-\s+(.+)$/)
    if (!item) break
    items.push(unquote(item[1]))
  }
  return items
}

/**
 * Splits a body into its `###` sections, skipping fenced code blocks.
 * @param {string} body
 */
const splitSections = (body) => {
  /** @type {{ heading: string, lines: string[] }[]} */
  const parts = []
  /** @type {string[]} */
  const before = []
  let fence = ''
  for (const line of body.split('\n')) {
    const marker = line.match(/^(`{3,}|~{3,})/)?.[1] ?? ''
    if (fence) {
      if (marker[0] === fence[0] && marker.length >= fence.length) fence = ''
    } else if (marker) {
      fence = marker
    } else if (/^#{1,6} /.test(line)) {
      parts.push({ heading: line, lines: [] })
      continue
    }
    ;(parts.at(-1)?.lines ?? before).push(line)
  }
  return { before: before.join('\n').trim(), parts }
}

/**
 * Reads one fragment; every problem is returned, none is thrown.
 * @param {string} text
 * @param {Scheme | null} scheme
 * @returns {Fragment}
 */
export const parseFragment = (text, scheme) => {
  /** @type {string[]} */
  const problems = []
  const normalised = text.replace(/\r\n/g, '\n')
  const matter = normalised.match(/^---\n([\s\S]*?)\n?---(?:\n|$)([\s\S]*)$/)
  const body = (matter ? matter[2] : normalised).trim()
  /** @type {string | null} */
  let bump = null
  /** @type {string[]} */
  let libraries = []
  if (matter) {
    const lines = matter[1].split('\n')
    lines.forEach((line, i) => {
      const pair = line.match(/^([\w-]+):\s*(.*)$/)
      if (!pair) return
      if (!KEYS.includes(pair[1])) {
        problems.push(
          `front matter has "${pair[1]}"; its keys are ${KEYS.join(', ')}`,
        )
      } else if (pair[1] === 'bump') {
        bump = unquote(pair[2])
      } else {
        libraries = parseList(pair[2].trim(), lines.slice(i + 1))
      }
    })
  }
  if (scheme === null) {
    problems.push('sits in a repository whose tier takes no release tags')
  } else if (scheme === 'semver' && !bump) {
    problems.push(`names no bump; a SemVer fragment names ${BUMPS.join(', ')}`)
  } else if (scheme === 'semver' && bump && !BUMPS.includes(bump)) {
    problems.push(`has bump "${bump}"; a bump is ${BUMPS.join(', ')}`)
  } else if (scheme === 'calver' && bump) {
    problems.push('names a bump; a CalVer fragment names none')
  }
  if (matter && /^libraries:/m.test(matter[1]) && libraries.length === 0) {
    problems.push('has an empty libraries list')
  }

  const { before, parts } = splitSections(body)
  /** @type {Section[]} */
  const sections = []
  if (body === '') problems.push('has no body')
  else if (before !== '' || parts.length === 0) {
    problems.push(`body opens with a ### heading from ${CATEGORIES.join(', ')}`)
  }
  for (const { heading, lines } of parts) {
    const category = heading.match(/^### (\w+)\s*$/)?.[1] ?? ''
    if (!CATEGORIES.includes(category)) {
      problems.push(
        `has heading "${heading}"; a heading is ### and one of ${CATEGORIES.join(', ')}`,
      )
      continue
    }
    const content = lines.join('\n').trim()
    if (content === '') problems.push(`has an empty ### ${category}`)
    else sections.push({ category, body: content })
  }
  return { bump, libraries, sections, problems }
}

/** @param {string} tag */
const parts = (tag) => tag.slice(1).split('.').map(Number)

/**
 * @param {number[]} a
 * @param {number[]} b
 */
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/**
 * Whether a tag has the form of the scheme: `vX.Y.Z` or `vYYYY.MM.N`.
 * @param {Scheme} scheme
 * @param {string} tag
 */
export const isSchemeTag = (scheme, tag) =>
  (scheme === 'semver' ? SEMVER_TAG : CALVER_TAG).test(tag)

/**
 * Why a release tag breaks its tier's scheme, or null when it keeps it.
 * A tag that does not start with a digit, or `v` and a digit, is no release tag.
 * @param {string} tier
 * @param {string} tag
 */
export const tagProblem = (tier, tag) => {
  if (!RELEASE_LIKE.test(tag)) return null
  const scheme = schemeOf(tier)
  if (scheme === null)
    return `${tag}: a ${tier} repository takes no release tags`
  if (isSchemeTag(scheme, tag)) return null
  return scheme === 'semver'
    ? `${tag}: a library release tag is SemVer vX.Y.Z, such as v1.4.0`
    : `${tag}: a product release tag is CalVer vYYYY.MM.N with a zero-padded month, such as v2026.07.0`
}

/**
 * The version of the next release.
 * @param {{ scheme: Scheme, tags: string[], bumps: (string | null)[], today: string, requested?: string }} input
 * @returns {{ version: string } | { problem: string }}
 */
export const nextVersion = ({ scheme, tags, bumps, today, requested }) => {
  const own = tags.filter((tag) => isSchemeTag(scheme, tag)).map(parts)
  const latest = own.toSorted(compare).at(-1)
  if (requested !== undefined) {
    const tag = `v${requested.replace(/^v/, '')}`
    if (!isSchemeTag(scheme, tag)) {
      return {
        problem:
          scheme === 'semver'
            ? `${requested} is no SemVer version X.Y.Z`
            : `${requested} is no CalVer version YYYY.MM.N with a zero-padded month`,
      }
    }
    if (latest && compare(parts(tag), latest) <= 0) {
      return {
        problem: `${tag} is not after the latest tag v${latest.join('.')}`,
      }
    }
    return { version: tag.slice(1) }
  }
  if (scheme === 'calver') {
    const [year, month] = today.split('-').map(Number)
    const patches = own
      .filter(([y, m]) => y === year && m === month)
      .map(([, , patch]) => patch)
    const patch = patches.length ? Math.max(...patches) + 1 : 0
    return { version: `${year}.${String(month).padStart(2, '0')}.${patch}` }
  }
  if (!latest) {
    return {
      problem: 'no vX.Y.Z tag yet; the first release names its version',
    }
  }
  const rank = Math.max(...bumps.map((bump) => BUMPS.indexOf(bump ?? '')))
  const [major, minor, patch] = latest
  // Below 1.0.0 a breaking change moves the minor; 1.0.0 is always requested.
  if (rank === 2 && major > 0) return { version: `${major + 1}.0.0` }
  if (rank >= 1) return { version: `${major}.${minor + 1}.0` }
  return { version: `${major}.${minor}.${patch + 1}` }
}

/**
 * @param {Fragment[]} group
 * @param {string} hashes
 */
const fold = (group, hashes) =>
  CATEGORIES.map((category) => {
    const bodies = group.flatMap((fragment) =>
      fragment.sections
        .filter((section) => section.category === category)
        .map((section) => section.body),
    )
    return bodies.length
      ? `${hashes} ${category}\n\n${bodies.join('\n\n')}`
      : ''
  })
    .filter(Boolean)
    .join('\n\n')

/**
 * One `## v<version> - <date>` section; a fragment that names libraries goes under each.
 * @param {string} version
 * @param {string} date
 * @param {Fragment[]} fragments
 */
export const renderRelease = (version, date, fragments) => {
  const plain = fragments.filter((fragment) => !fragment.libraries.length)
  const names = [
    ...new Set(fragments.flatMap((fragment) => fragment.libraries)),
  ].toSorted()
  const blocks = [plain.length ? fold(plain, '###') : '']
  for (const name of names) {
    const own = fragments.filter((fragment) =>
      fragment.libraries.includes(name),
    )
    blocks.push(`### ${name}\n\n${fold(own, '####')}`)
  }
  return `## v${version} - ${date}\n\n${blocks.filter(Boolean).join('\n\n')}\n`
}

/**
 * Puts a release above the newest one and keeps the file's header.
 * @param {string | null} existing
 * @param {string} release
 */
export const prependRelease = (existing, release) => {
  const current = existing ?? '# Changelog\n'
  const marker = current.search(/^## /m)
  const head =
    marker === -1 ? `${current.trimEnd()}\n` : current.slice(0, marker)
  const tail = marker === -1 ? '' : current.slice(marker)
  return `${head}\n${release.trimEnd()}\n\n${tail}`
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n*$/, '\n')
}

/** @param {string} root */
const gitTags = (root) => {
  try {
    return execFileSync('git', ['-C', root, 'tag', '--list'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Runs a release in `root`; returns the lines to print and the exit code.
 * @param {{ root: string, args: string[], today: string }} input
 */
export const release = ({ root, args, today }) => {
  const dryRun = args.includes('--dry-run')
  const requested = args.find((arg) => !arg.startsWith('--'))
  const tier = readTier(root)
  const scheme = schemeOf(tier)
  if (scheme === null) {
    return { code: 1, out: [`a ${tier} repository takes no release tags`] }
  }
  const dir = join(root, FRAGMENTS)
  const names = existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith('.md') && name !== 'README.md')
        .toSorted()
    : []
  if (names.length === 0) {
    return {
      code: 1,
      out: [`no fragment in ${FRAGMENTS}/; a release records at least one`],
    }
  }
  const fragments = names.map((name) => ({
    name,
    ...parseFragment(readFileSync(join(dir, name), 'utf8'), scheme),
  }))
  const problems = fragments.flatMap((fragment) =>
    fragment.problems.map(
      (problem) => `${FRAGMENTS}/${fragment.name} ${problem}`,
    ),
  )
  if (problems.length) return { code: 1, out: problems }
  const next = nextVersion({
    scheme,
    tags: gitTags(root),
    bumps: fragments.map((fragment) => fragment.bump),
    today,
    requested,
  })
  if ('problem' in next) return { code: 1, out: [next.problem] }
  const section = renderRelease(next.version, today, fragments)
  if (dryRun) {
    return {
      code: 0,
      out: [section, `--dry-run: ${names.length} fragment(s) kept`],
    }
  }
  const file = join(root, CHANGELOG)
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : null
  writeFileSync(file, prependRelease(existing, section))
  for (const name of names) unlinkSync(join(dir, name))
  return {
    code: 0,
    out: [
      `wrote v${next.version} to ${CHANGELOG}; deleted ${names.length} fragment(s)`,
      `next: commit, then git tag -a v${next.version} -m v${next.version} on the commit that reaches ${scheme === 'calver' ? 'production' : 'main'}`,
    ],
  }
}

if (import.meta.main) {
  // sv-SE prints the local date as YYYY-MM-DD; toISOString() is UTC and stamps
  // a morning release east of Greenwich with yesterday.
  const today = new Date().toLocaleDateString('sv-SE')
  const { code, out } = release({
    root: process.cwd(),
    args: process.argv.slice(2),
    today,
  })
  for (const line of out) (code ? console.error : console.log)(line)
  process.exit(code)
}
