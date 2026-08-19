import { Descendant, Editor, Element as SlateElement, Node, Path, Point, Text, Transforms } from 'slate'
import { HistoryEditor } from 'slate-history'
import type { EditorInstance } from '../editorActions'

/**
 * Page gaps as real document nodes.
 *
 * The gap that pushes the tail of a paragraph onto the next sheet has to sit *in the text flow* —
 * CSS offers no way to reserve vertical space mid-paragraph from outside it. The first
 * implementation used a Slate decoration, which changes rendering without running any model
 * operation; nothing then maintains the selection when the leaves are rebuilt, and the caret
 * teleported to the start of the paragraph on the keystroke that created a break.
 *
 * A void node fixes that at the root: `Transforms.insertNodes` is an operation, so Slate transforms
 * the selection through it, and voids are something the caret machinery already knows how to skip.
 *
 * The spacers are layout state, not content. They are kept out of undo history, and
 * {@link stripPageSpacers} must be applied to anything leaving the app — the Rust `Node` enum has
 * no variant for them, so serialising one is a hard deserialisation error.
 */

export const PAGE_SPACER_TYPE = 'page-spacer'

/** DOM marker so measurement can skip spacer subtrees. */
export const PAGE_SPACER_ATTR = 'data-pv-spacer'

export interface DesiredSpacer {
  blockIndex: number
  /**
   * Text characters in the block before the gap. Canonical because spacers contribute zero
   * characters, so the value does not depend on which spacers happen to be present — that is what
   * makes the reconcile idempotent.
   */
  textOffset: number
  height: number
}

export function isPageSpacer(node: Node): boolean {
  return SlateElement.isElement(node) && node.type === PAGE_SPACER_TYPE
}

/** Deep copy with every spacer removed. Apply before saving, exporting or printing. */
export function stripPageSpacers(nodes: Descendant[]): Descendant[] {
  const result: Descendant[] = []

  for (const node of nodes) {
    if (!SlateElement.isElement(node)) {
      result.push(node)
      continue
    }
    if (node.type === PAGE_SPACER_TYPE) continue

    result.push({
      ...node,
      children: stripPageSpacers(node.children as Descendant[]),
    } as Descendant)
  }

  return result
}

/** Text nodes of a block that are not inside a spacer, in document order. */
function eligibleTexts(block: SlateElement): { path: Path; length: number }[] {
  const texts: { path: Path; length: number }[] = []

  for (const [node, path] of Node.descendants(block)) {
    if (SlateElement.isElement(node)) continue
    if (!Text.isText(node)) continue
    // A spacer's own empty text must not be an insertion target.
    if (path.length > 1 && isPageSpacer(Node.get(block, path.slice(0, -1)))) continue
    texts.push({ path, length: node.text.length })
  }

  return texts
}

/** Characters of text in the block before `point`. */
export function textOffsetOfPoint(editor: EditorInstance, blockIndex: number, point: Point): number {
  const block = Node.get(editor, [blockIndex])
  if (!SlateElement.isElement(block)) return 0

  const relative = point.path.slice(1)
  let total = 0

  for (const text of eligibleTexts(block)) {
    if (Path.equals(text.path, relative)) return total + point.offset
    total += text.length
  }

  return total
}

/** Inverse of {@link textOffsetOfPoint}. */
function pointAtTextOffset(editor: EditorInstance, blockIndex: number, target: number): Point | null {
  const block = Node.get(editor, [blockIndex])
  if (!SlateElement.isElement(block)) return null

  const texts = eligibleTexts(block)
  if (texts.length === 0) return null

  let total = 0
  for (const text of texts) {
    if (target <= total + text.length) {
      return { path: [blockIndex, ...text.path], offset: target - total }
    }
    total += text.length
  }

  const last = texts[texts.length - 1]
  return { path: [blockIndex, ...last.path], offset: last.length }
}

/** Spacers currently in the document, described the same way as the desired ones. */
function currentSpacers(editor: EditorInstance): DesiredSpacer[] {
  const found: DesiredSpacer[] = []

  editor.children.forEach((block, blockIndex) => {
    if (!SlateElement.isElement(block)) return

    let textOffset = 0
    for (const [node] of Node.descendants(block)) {
      if (SlateElement.isElement(node)) {
        if (node.type === PAGE_SPACER_TYPE) {
          found.push({ blockIndex, textOffset, height: node.height ?? 0 })
        }
        continue
      }
      if (Text.isText(node)) textOffset += node.text.length
    }
  })

  return found
}

/**
 * Slack under which two gap heights count as the same.
 *
 * The engine recovers the natural flow by subtracting the slack a spacer introduces, so a spacer's
 * own height feeds back into the next measurement of it. Sub-pixel line-box effects make that
 * round-trip jitter by a fraction of a pixel, and without this tolerance the resulting flapping
 * height rewrites the document on every pass — React gives up with "Maximum update depth exceeded".
 */
const HEIGHT_TOLERANCE_PX = 2

/** Positions must match exactly; heights only within {@link HEIGHT_TOLERANCE_PX}. */
function matches(current: DesiredSpacer[], desired: DesiredSpacer[]): boolean {
  if (current.length !== desired.length) return false

  return current.every((spacer, index) => {
    const other = desired[index]
    return (
      spacer.blockIndex === other.blockIndex &&
      spacer.textOffset === other.textOffset &&
      Math.abs(spacer.height - other.height) <= HEIGHT_TOLERANCE_PX
    )
  })
}

function removeAll(editor: EditorInstance): void {
  const paths = Array.from(
    Editor.nodes(editor, { at: [], match: isPageSpacer, mode: 'all' }),
  ).map(([, path]) => path)

  // Deepest and latest first, so removing one cannot invalidate the paths still to come.
  paths.sort(Path.compare).reverse()
  for (const path of paths) {
    Transforms.removeNodes(editor, { at: path, voids: true })
  }
}

export function hasPageSpacers(editor: EditorInstance): boolean {
  for (const _entry of Editor.nodes(editor, { at: [], match: isPageSpacer, mode: 'all' })) return true
  return false
}

/** Removes every spacer. Used when leaving document view. */
export function clearPageSpacers(editor: EditorInstance): boolean {
  if (currentSpacers(editor).length === 0) return false

  HistoryEditor.withoutSaving(editor, () => {
    Editor.withoutNormalizing(editor, () => removeAll(editor))
  })
  return true
}

/**
 * Makes the document's spacers match `desired`, and reports whether anything changed.
 *
 * Returns false without touching the document when they already match — the caller runs this on
 * every render, so that early-out is what stops the pass and the resulting re-render from
 * re-triggering each other.
 */
export function reconcilePageSpacers(editor: EditorInstance, desired: DesiredSpacer[]): boolean {
  if (matches(currentSpacers(editor), desired)) return false

  HistoryEditor.withoutSaving(editor, () => {
    Editor.withoutNormalizing(editor, () => {
      removeAll(editor)

      // Reverse document order: inserting at a later offset first leaves the earlier ones valid.
      const ordered = [...desired].sort(
        (a, b) => b.blockIndex - a.blockIndex || b.textOffset - a.textOffset,
      )

      for (const spacer of ordered) {
        if (spacer.blockIndex >= editor.children.length) continue

        const at = pointAtTextOffset(editor, spacer.blockIndex, spacer.textOffset)
        if (!at) continue

        Transforms.insertNodes(
          editor,
          {
            type: PAGE_SPACER_TYPE,
            // Whole pixels: a fractional height would come back out of the layout slightly changed
            // and keep nudging the next measurement.
            height: Math.round(spacer.height),
            children: [{ text: '' }],
          },
          { at, select: false, voids: true },
        )
      }
    })
  })

  return true
}
