#!/usr/bin/env node
/** Extracts user-visible strings from the frontend into an i18next resource file and optionally rewrites safe call sites to use t(). Built on the TypeScript compiler AST rather than regexes because a regex cannot distinguish JSX text from class attributes, nor translatable labels from Slate node types. Keys are English text itself (i18next natural-key style) so there is no key drift and missing translations fall back to readable English. */

import ts from 'typescript'
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = join(PROJECT_ROOT, 'src')

/** JSX attributes the user can actually read. */
const VISIBLE_ATTRIBUTES = new Set(['title', 'placeholder', 'alt', 'aria-label'])

/** Object-literal keys that carry UI copy here (menu items, settings rows, licenses). */
const VISIBLE_PROPERTIES = new Set([
  'label',
  'tooltip',
  'placeholder',
  'description',
  'message',
  'heading',
])

/** Attributes whose values are class names, styles or link semantics — never copy. */
const NON_COPY_ATTRIBUTES = new Set([
  'className',
  'style',
  'id',
  'key',
  'href',
  'rel',
  'target',
  'type',
  'role',
  'name',
  'value',
])

/** Functions whose string arguments end up on screen. */
const MESSAGE_FUNCTIONS = new Set(['notify', 'alert', 'alertFn', 'showAlert', 'setErrorMsg'])

/** Strings that are part of a contract, not copy. Translating any of these breaks the app. "The operation was cancelled" is the worst offender: Rust returns it as an Ok value and the frontend string-matches on it to tell a cancelled dialog from a real save. It reads exactly like a user-facing message, which is precisely why it needs calling out. */
const PROTOCOL_STRINGS = new Set([
  'The operation was cancelled',
  'Operation cancelled',
  '__PDF_REQUESTED__',
])

/** Reads like copy but is normally left verbatim: the product name, file-format names, units, symbols. Routed to review rather than dropped — whether Ln/Col get localised is a choice, not a fact, and some locales do translate the bold/italic button glyphs (Spanish Word uses N/K/S). Also includes common toolbar glyphs that are icons but happen to be letters like A for Bold, B for Bold Italic. Language names are always shown in their own language, never translated. */
const LIKELY_VERBATIM = new Set([
  'RNotes',
  'RDOCX',
  'JSON',
  'MD',
  'TXT',
  'PDF',
  'WPM',
  'Ln',
  'Col',
  // Language names are always shown in their own language, never translated.
  'English',
  'Español',
  // Toolbar glyphs: these are icons that happen to be letters, and the paper size is a standard name.
  'A',
  'B',
  'I',
  'U',
  'Aa',
  'Ab',
  'H1',
  'H2',
  'H3',
  'H4',
  'A4',
  // Common symbols that should not be translated.
  '!',
  '?',
  '…',
  '±',
  '°',
  '≤',
  '≥',
  '≈',
  '≠',
  '¢',
  '£',
  '¥',
  '€',
  '/',
  '\\',
])

/** Values that are unambiguously not prose. Rejected outright rather than sent for review. */
function isObviouslyNotText(text) {
  if (!/[\p{L}]/u.test(text)) return true
  if (/^#[0-9a-fA-F]{3,8}$/.test(text)) return true
  if (/^-?[\d.]+(px|em|rem|%|vh|vw|pt|s|ms|fr|deg)$/.test(text)) return true
  if (/^(https?:)?\/\//.test(text)) return true
  if (/^[.~@]?\/|\.(tsx?|jsx?|css|json|png|svg|ttf|md|rs)$/.test(text)) return true
  if (/^data:|^blob:|^asset:/.test(text)) return true
  return false
}

/** Confidence that a string is UI copy. Capitalisation and spaces are the strongest signals available: labels here read Save As, identifiers read list-item or header3. Anything in between goes to review — including lowercase single words, because the block-type dropdown legitimately shows paragraph. */
function classify(text) {
  if (LIKELY_VERBATIM.has(text)) return { bucket: 'review', reason: 'likely left verbatim' }
  if (text.length <= 2) return { bucket: 'review', reason: 'glyph or abbreviation' }
  if (/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(text)) return { bucket: 'review', reason: 'looks like an id' }
  if (/\s/.test(text) && /^[\p{Lu}]/u.test(text)) return { bucket: 'confident', reason: '' }
  if (/^[\p{Lu}][\p{L}]*$/u.test(text)) return { bucket: 'confident', reason: '' }
  return { bucket: 'review', reason: 'unclear — lowercase or punctuated' }
}

function collectSourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, found)
      continue
    }
    if (!/\.tsx?$/.test(entry) || entry.endsWith('.d.ts')) continue
    found.push(full)
  }
  return found
}

const normaliseJsxText = (raw) => raw.replace(/\s+/g, ' ').trim()

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return null
}

/** A compared literal is a sentinel, not copy. */
function isComparisonOperand(node) {
  const parent = node.parent
  if (!parent || !ts.isBinaryExpression(parent)) return false
  return [
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
  ].includes(parent.operatorToken.kind)
}

/** A Tauri command name or a module specifier. */
function isTechnicalArgument(node) {
  const parent = node.parent
  if (!parent) return false
  if (ts.isCallExpression(parent)) {
    const name = calleeName(parent.expression)
    if (name === 'invoke' || name === 'require' || name === 'import') return parent.arguments[0] === node
  }
  return ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)
}

/** Nearest enclosing function whose name looks like a React component. The codemod needs somewhere to put const { t } = useTranslation(), and hooks are only legal inside a component. A lowercase-named helper that happens to return JSX is not one. */
function enclosingComponent(node, source) {
  let current = node.parent
  while (current) {
    const isFunction = ts.isFunctionDeclaration(current) || ts.isArrowFunction(current) || ts.isFunctionExpression(current)
    if (isFunction) {
      let name = null
      if (ts.isFunctionDeclaration(current) && current.name) {
        name = current.name.text
      } else if (current.parent && ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) {
        name = current.parent.name.text
      }
      if (name && /^[A-Z]/.test(name) && current.body && ts.isBlock(current.body)) {
        return { name, body: current.body, start: current.body.getStart(source) }
      }
    }
    current = current.parent
  }
  return null
}

/** True when an expression feeds JSX, i.e. it sits in an attribute value or between tags. Ternaries need this test. title={saved ? 'All changes saved' : 'Unsaved changes'} is copy, while cond ? 'paragraph' : 'header' picks a Slate node type — the difference is only visible from where the value ends up. */
function isInJsxContext(node, source) {
  let current = node.parent
  while (current) {
    if (ts.isJsxAttribute(current)) {
      // These attributes carry class names, CSS values and link semantics, never copy.
      return !NON_COPY_ATTRIBUTES.has(current.name.getText(source))
    }
    if (ts.isJsxExpression(current)) {
      // A JSX expression can itself be an attribute value; keep walking to find out which.
      if (current.parent && ts.isJsxAttribute(current.parent)) {
        return !NON_COPY_ATTRIBUTES.has(current.parent.name.getText(source))
      }
      return true
    }
    if (ts.isStatement(current) || ts.isFunctionLike(current)) return false
    current = current.parent
  }
  return false
}

/** A literal is only rewritten when it is confident copy sitting inside a component. */
function canRewrite(value, component) {
  return Boolean(component) && !isObviouslyNotText(value) && classify(value).bucket === 'confident'
}

function extractFromFile(filePath) {
  const text = readFileSync(filePath, 'utf8')
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  const hits = []
  /** Replacements the codemod can perform safely. */
  const edits = []
  const skippedEdits = []

  const record = (value, kind, node) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
    hits.push({ text: value, kind, line: line + 1 })
  }

  const visit = (node) => {
    // 1. Text between JSX tags.
    if (ts.isJsxText(node)) {
      const value = normaliseJsxText(node.text)
      if (value) {
        record(value, 'jsx-text', node)

        // Only rewrite when the text is the element's *only* child. Anything else is a sentence assembled from parts, which needs <Trans> and a human.
        const parent = node.parent
        const soleChild =
          parent &&
          ts.isJsxElement(parent) &&
          parent.children.filter((c) => !(ts.isJsxText(c) && !normaliseJsxText(c.text))).length === 1

        const component = enclosingComponent(node, source)
        if (soleChild && canRewrite(value, component)) {
          edits.push({
            start: node.getStart(source),
            end: node.getEnd(),
            replacement: `{t(${JSON.stringify(value)})}`,
            component,
            text: value,
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          })
        } else if (soleChild && !component) {
          skippedEdits.push({ text: value, reason: 'not inside a component function' })
        }
      }
    }

    // 2a. `<Trans i18nKey="...">` — the key for a sentence rebuilt around markup.
    if (ts.isJsxAttribute(node) && node.initializer && node.name.getText(source) === 'i18nKey') {
      if (ts.isStringLiteral(node.initializer)) record(node.initializer.text, 't-call', node)
    }

    // 2. Visible JSX attributes with a literal value.
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(source)
      if (VISIBLE_ATTRIBUTES.has(name) && ts.isStringLiteral(node.initializer)) {
        const value = node.initializer.text
        record(value, `attr:${name}`, node)

        const component = enclosingComponent(node, source)
        if (canRewrite(value, component)) {
          edits.push({
            start: node.initializer.getStart(source),
            end: node.initializer.getEnd(),
            replacement: `{t(${JSON.stringify(value)})}`,
            component,
            text: value,
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          })
        }
      }
    }

    // 3. A bare string inside JSX braces, e.g. {'Loading'}.
    if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression)) {
      if (node.parent && ts.isJsxElement(node.parent)) record(node.expression.text, 'jsx-expression', node)
    }

    // 4. A sentence assembled from text and expressions, e.g. `Ln {line}, Col {column}`.
    // The hard part of retrofitting i18n: translated as separate fragments they cannot be reordered, and word order is exactly what changes between languages. Reported as one i18next-shaped template so it can be rebuilt with <Trans>. Never auto-rewritten.
    if (ts.isJsxElement(node)) {
      const parts = []
      let slot = 0
      let hasText = false

      for (const child of node.children) {
        if (ts.isJsxText(child)) {
          const value = normaliseJsxText(child.text)
          if (value) {
            parts.push(value)
            hasText = true
          }
        } else if (ts.isJsxExpression(child) && child.expression) {
          if (ts.isStringLiteral(child.expression)) continue
          parts.push(`{{${slot++}}}`)
        } else if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
          parts.push(`<${slot}></${slot++}>`)
        }
      }

      if (hasText && slot > 0) record(parts.join(' ').replace(/\s+/g, ' ').trim(), 'interpolation', node)
    }

    // 5. UI copy carried in object literals (menu items, settings rows). Rewritten only when the literal sits inside a component — a module-scope array has no hook in scope, and the enclosing-component check is what keeps those out.
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
      const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null
      if (name && VISIBLE_PROPERTIES.has(name)) {
        const value = node.initializer.text
        record(value, `prop:${name}`, node)

        const component = enclosingComponent(node, source)
        if (canRewrite(value, component)) {
          edits.push({
            start: node.initializer.getStart(source),
            end: node.initializer.getEnd(),
            replacement: `t(${JSON.stringify(value)})`,
            component,
            text: value,
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          })
        } else if (!component) {
          skippedEdits.push({ text: value, reason: 'object literal outside a component' })
        }
      }
    }

    // 6. Both branches of a ternary that feeds JSX.
    if (ts.isConditionalExpression(node) && isInJsxContext(node, source)) {
      for (const branch of [node.whenTrue, node.whenFalse]) {
        if (!ts.isStringLiteral(branch)) continue
        const value = branch.text
        record(value, 'ternary', branch)

        const component = enclosingComponent(branch, source)
        if (canRewrite(value, component)) {
          edits.push({
            start: branch.getStart(source),
            end: branch.getEnd(),
            replacement: `t(${JSON.stringify(value)})`,
            component,
            text: value,
            line: source.getLineAndCharacterOfPosition(branch.getStart(source)).line + 1,
          })
        }
      }
    }

    // 7. Strings already migrated to t('...').
    // Without this the script is destructive rather than idempotent: after the codemod runs, the literals are no longer JSX text or attributes, so a second --write would rebuild the resource file from only the leftovers and drop everything already migrated. Recognising t() is also what lets this run in CI to catch copy added without a translation.
    if (ts.isCallExpression(node)) {
      const called = calleeName(node.expression)
      if ((called === 't' || called === 'i18n') && node.arguments.length > 0) {
        const first = node.arguments[0]
        if (ts.isStringLiteral(first)) {
          const options = node.arguments[1]
          const isPlural =
            options &&
            ts.isObjectLiteralExpression(options) &&
            options.properties.some(
              (property) =>
                property.name &&
                (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
                property.name.text === 'count',
            )

          // A count option makes i18next look up key_one / key_other; the bare key is never read.
          if (isPlural) {
            record(`${first.text}_one`, 't-call', first)
            record(`${first.text}_other`, 't-call', first)
          } else {
            record(first.text, 't-call', first)
          }
        }
      }
    }

    // 8. Arguments to the notice helpers.
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression)
      if (name && MESSAGE_FUNCTIONS.has(name)) {
        for (const argument of node.arguments) {
          if (ts.isStringLiteral(argument)) {
            const value = argument.text
            record(value, 'message', argument)

            const component = enclosingComponent(argument, source)
            if (canRewrite(value, component)) {
              edits.push({
                start: argument.getStart(source),
                end: argument.getEnd(),
                replacement: `t(${JSON.stringify(value)})`,
                component,
                text: value,
                line: source.getLineAndCharacterOfPosition(argument.getStart(source)).line + 1,
              })
            }
          }
          // A template literal needs a placeholder-aware key; flag it rather than mangle it.
          if (ts.isTemplateExpression(argument)) record(argument.getText(source), 'template', argument)
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)

  // Sentinels reach the same nodes as copy; strip them here, where the AST context still exists.
  const protocolTexts = new Set()
  const visitForProtocol = (node) => {
    if (ts.isStringLiteral(node) && (isComparisonOperand(node) || isTechnicalArgument(node))) {
      protocolTexts.add(node.text)
    }
    ts.forEachChild(node, visitForProtocol)
  }
  visitForProtocol(source)

  const uiHits = hits.filter((h) => !protocolTexts.has(h.text) && !PROTOCOL_STRINGS.has(h.text))
  const safeEdits = edits.filter((e) => !protocolTexts.has(e.text) && !PROTOCOL_STRINGS.has(e.text))

  return {
    uiHits,
    edits: safeEdits,
    skippedEdits,
    protocolFound: [...protocolTexts].filter((s) => PROTOCOL_STRINGS.has(s)),
    text,
    source,
  }
}

/** Applies the edits plus the useTranslation wiring, back to front so offsets stay valid. */
function rewriteFile(original, source, edits) {
  const components = new Map()
  for (const edit of edits) components.set(edit.component.name, edit.component)

  const alreadyImported = /from ['"]react-i18next['"]/.test(original)
  const insertions = []

  for (const component of components.values()) {
    const bodyText = original.slice(component.start, component.start + 400)
    if (/const\s*\{\s*t\s*[,}]/.test(bodyText)) continue
    // Straight after the opening brace of the component body.
    insertions.push({ at: component.start + 1, snippet: '\n  const { t } = useTranslation();' })
  }

  const operations = [
    ...edits.map((e) => ({ start: e.start, end: e.end, text: e.replacement })),
    ...insertions.map((i) => ({ start: i.at, end: i.at, text: i.snippet })),
  ].sort((a, b) => b.start - a.start)

  let output = original
  for (const op of operations) {
    output = output.slice(0, op.start) + op.text + output.slice(op.end)
  }

  if (!alreadyImported && (edits.length > 0 || insertions.length > 0)) {
    const firstImport = source.statements.find(ts.isImportDeclaration)
    const anchor = firstImport ? firstImport.getStart(source) : 0
    output = output.slice(0, anchor) + "import { useTranslation } from 'react-i18next';\n" + output.slice(anchor)
  }

  return output
}

function main() {
  const argv = process.argv.slice(2)
  const shouldWrite = argv.includes('--write')
  const checkOnly = argv.includes('--check')
  const asJson = argv.includes('--json')
  const doCodemod = argv.includes('--codemod')
  const applyCodemod = argv.includes('--apply')
  const outIndex = argv.indexOf('--out')
  const outPath =
    outIndex !== -1 && argv[outIndex + 1]
      ? join(PROJECT_ROOT, argv[outIndex + 1])
      : join(SOURCE_DIR, 'locales', 'en.json')

  const files = collectSourceFiles(SOURCE_DIR)

  const byText = new Map()
  const protocolWarnings = new Map()
  const codemodPlan = []

  for (const file of files) {
    const result = extractFromFile(file)
    const rel = relative(PROJECT_ROOT, file).replace(/\\/g, '/')

    if (result.protocolFound.length > 0) protocolWarnings.set(rel, result.protocolFound)

    for (const hit of result.uiHits) {
      if (isObviouslyNotText(hit.text)) continue
      const entry = byText.get(hit.text) ?? { kinds: new Set(), locations: [] }
      entry.kinds.add(hit.kind)
      entry.locations.push(`${rel}:${hit.line}`)
      byText.set(hit.text, entry)
    }

    if (result.edits.length > 0) {
      codemodPlan.push({ file, rel, ...result })
    }
  }

  const resource = {}
  const confident = []
  const review = []

  for (const [text, entry] of [...byText.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const kinds = [...entry.kinds]
    const alreadyMigrated = kinds.includes('t-call')
    const isTemplate = kinds.includes('template') || kinds.includes('interpolation')

    // An existing t() call is a decision already made; the heuristics must not undo it.
    const verdict = alreadyMigrated
      ? { bucket: 'confident', reason: '' }
      : isTemplate
        ? { bucket: 'review', reason: 'sentence built from parts — rebuild with <Trans>' }
        : classify(text)

    const record = { text, kinds, reason: verdict.reason, locations: entry.locations }
    if (verdict.bucket === 'confident') {
      confident.push(record)
      // The plural suffix belongs to the key, not to the sentence: a value of "{{count}} min_one" would render the suffix on screen. The two forms start identical and a translator splits them.
      resource[text] = text.replace(/_(one|other)$/, '')
    } else {
      review.push(record)
    }
  }

  /** CI gate. Catches the two ways translations rot: copy added to the UI without running the script, and a locale left behind when a key changes. Because the keys *are* the English text, editing an English string silently orphans its translations — this is what makes that visible. */
  if (checkOnly) {
    const problems = []

    let onDisk = {}
    try {
      onDisk = JSON.parse(readFileSync(outPath, 'utf8'))
    } catch {
      problems.push(`Cannot read ${relative(PROJECT_ROOT, outPath)}`)
    }

    const expectedKeys = Object.keys(resource).sort()
    const actualKeys = Object.keys(onDisk).sort()

    for (const key of expectedKeys) {
      if (!(key in onDisk)) problems.push(`Missing from en.json: ${JSON.stringify(key)}`)
    }
    for (const key of actualKeys) {
      if (!(key in resource)) problems.push(`Stale in en.json (no longer in the source): ${JSON.stringify(key)}`)
    }

    // Every other locale has to cover the same keys.
    const localeDir = dirname(outPath)
    for (const file of readdirSync(localeDir)) {
      if (!file.endsWith('.json') || join(localeDir, file) === outPath) continue
      let locale = {}
      try {
        locale = JSON.parse(readFileSync(join(localeDir, file), 'utf8'))
      } catch {
        problems.push(`Cannot read ${file}`)
        continue
      }
      for (const key of expectedKeys) {
        if (!(key in locale)) problems.push(`${file} is missing: ${JSON.stringify(key)}`)
      }
      for (const key of Object.keys(locale)) {
        if (!(key in resource)) problems.push(`${file} has an orphan key: ${JSON.stringify(key)}`)
      }
    }

    if (problems.length === 0) {
      console.log(`i18n check passed: ${expectedKeys.length} keys, all locales in sync.`)
      return
    }

    console.error(`i18n check failed with ${problems.length} problem(s):`)
    for (const problem of problems) console.error(`  ${problem}`)
    console.error('Run `npm run i18n:extract -- --write` and translate any new keys.')
    process.exitCode = 1
    return
  }

  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        {
          confident,
          review,
          protocolWarnings: Object.fromEntries(protocolWarnings),
          resource,
          codemod: codemodPlan.map((p) => ({
            file: p.rel,
            edits: p.edits.map((e) => ({ line: e.line, text: e.text, component: e.component.name })),
          })),
        },
        null,
        2,
      ) + '\n',
    )
    return
  }

  console.log(`Scanned ${files.length} files under src/\n`)
  console.log(`Ready to translate:  ${confident.length}`)
  console.log(`Needs review:        ${review.length}\n`)

  if (protocolWarnings.size > 0) {
    console.log('Protocol strings found and EXCLUDED — never translate these:')
    for (const [file, strings] of protocolWarnings) {
      for (const value of strings) console.log(`  ${file}  "${value}"`)
    }
    console.log('')
  }

  console.log('--- Needs review (kept out of the resource file) ---')
  const grouped = new Map()
  for (const item of review) {
    if (!grouped.has(item.reason)) grouped.set(item.reason, [])
    grouped.get(item.reason).push(item)
  }
  for (const [reason, items] of grouped) {
    console.log(`\n  ${reason}  (${items.length})`)
    for (const item of items) console.log(`    ${JSON.stringify(item.text)}   ${item.locations[0]}`)
  }

  if (doCodemod) {
    const total = codemodPlan.reduce((sum, p) => sum + p.edits.length, 0)
    console.log(`\n--- Codemod: ${total} rewrites across ${codemodPlan.length} files ---`)
    for (const plan of codemodPlan) {
      console.log(`\n  ${plan.rel}`)
      for (const edit of plan.edits) {
        console.log(`    L${edit.line}  ${edit.component.name}  ${JSON.stringify(edit.text)}`)
      }
      if (applyCodemod) {
        writeFileSync(plan.file, rewriteFile(plan.text, plan.source, plan.edits), 'utf8')
      }
    }
    console.log(applyCodemod ? '\nApplied. Run `npx tsc --noEmit` next.' : '\nPreview only. Pass --apply to rewrite.')
  }

  if (shouldWrite) {
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, JSON.stringify(resource, null, 2) + '\n', 'utf8')
    console.log(`\nWrote ${relative(PROJECT_ROOT, outPath).replace(/\\/g, '/')}`)
  } else if (!doCodemod) {
    console.log('\nDry run. Pass --write for the resource file, --codemod to preview rewrites.')
  }
}

main()