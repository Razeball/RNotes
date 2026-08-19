import { Point } from 'slate'
import type { EditorInstance } from '../editorActions'
import {
  buildBlockLines,
  fromRelativeLines,
  getScaleFactor,
  toRelativeLines,
  type LineEntry,
  type RelativeLine,
} from './lineIndex'
import { PAGE_SPACER_ATTR } from './pageSpacers'

/**
 * Pagination engine for the document view.
 *
 * The whole thing rests on one observation: the gaps injected to push content onto the next sheet
 * are purely vertical and full width, so they never change where a line wraps. The document's
 * *natural* flow — what the layout would be with no gaps at all — can therefore be recovered from
 * the rendered layout by simple subtraction, and every page boundary derived from that. One
 * measurement per pass, no iteration, and the pass is idempotent: measuring again yields the same
 * breaks, so the caller's state updates settle after one extra render.
 *
 * The gaps are recovered rather than switched off on purpose. Toggling a class to hide them would
 * be more direct, but it destroys and rebuilds the line box the caret sits in, and Chromium
 * responds by collapsing the DOM selection to the start of the text node — which Slate then reads
 * back as the real selection, teleporting the caret mid-typing. Reading the layout without touching
 * it is the only safe option.
 *
 * Coordinates are unscaled CSS pixels relative to the top of the editable, so the zoom transform on
 * `.editor-container` does not leak in.
 */

const EPSILON = 0.5

export interface PageGeometry {
  /** Usable content height of one sheet. */
  usableHeight: number
  /** Vertical space between the bottom of one sheet's content and the top of the next one's. */
  chromeHeight: number
  /**
   * Split paragraphs at the exact overflowing line instead of moving the whole block.
   *
   * Produces the correct layout — verified: exact line placement, no text outside a sheet — but a
   * line break is delivered as a Slate decoration, and applying one re-renders the leaf holding the
   * caret. The browser collapses the DOM selection during that re-render and Slate adopts the
   * collapsed position, so the keystroke *after* the one that creates a break lands at the start of
   * the paragraph. Restoring the selection afterwards was tried and does not hold.
   *
   * Off until that is solved. See CLAUDE.md.
   */
  allowLineBreaks?: boolean
}

export type PageBreak =
  | { kind: 'block'; blockIndex: number; gapPx: number; y: number }
  | { kind: 'line'; blockIndex: number; point: Point; gapPx: number; y: number }

export interface OversizedBlock {
  blockIndex: number
  maxHeightPx: number
}

export interface PaginationResult {
  breaks: PageBreak[]
  oversized: OversizedBlock[]
  lines: LineEntry[]
  pageCount: number
  /** Height the editable must reserve so the last sheet is complete. */
  flowHeight: number
}

export const EMPTY_PAGINATION: PaginationResult = {
  breaks: [],
  oversized: [],
  lines: [],
  pageCount: 1,
  flowHeight: 0,
}

/** A line box, or a whole block when the block cannot be split. */
interface FlowUnit extends LineEntry {
  /** Position within its block; 0 means the unit starts the block. */
  lineInBlock: number
  unbreakable: boolean
}

/**
 * Blocks we refuse to split mid-way. Images are Slate voids and tables would need row-level
 * pagination, which is a separate piece of work.
 */
function isUnbreakable(el: HTMLElement): boolean {
  if (el.dataset.slateVoid === 'true') return true
  return el.querySelector('table, img') !== null
}

interface CacheEntry {
  /** Layout width the lines were measured at; a change reflows the text. */
  width: number
  lines: RelativeLine[]
}

/**
 * Measurement cache, keyed on the Slate block node itself.
 *
 * Slate's tree is immutable, so an untouched block keeps the same object reference across renders —
 * identity alone is an exact content check, with no signature to get wrong. Editing a block (or
 * inserting a spacer into it) produces a new object and therefore a miss, which is what we want.
 * A WeakMap so entries disappear with the nodes.
 *
 * The win is real: measuring a block means a `getClientRects()` per text node plus a binary search
 * of character rects per line. Only the block holding the caret can change on a keystroke, so
 * everything else is served from here and the pass costs one `getBoundingClientRect` per block.
 */
const measurementCache = new WeakMap<object, CacheEntry>()

function buildUnits(
  editor: EditorInstance,
  editable: HTMLElement,
  originTop: number,
  scale: number,
): FlowUnit[] {
  const children = Array.from(editable.children) as HTMLElement[]
  const units: FlowUnit[] = []

  children.forEach((child, blockIndex) => {
    const fallback: Point = { path: [blockIndex, 0], offset: 0 }
    const rect = child.getBoundingClientRect()
    if (rect.height === 0) return

    const blockTop = (rect.top - originTop) / scale

    if (isUnbreakable(child)) {
      units.push({
        start: fallback,
        resolved: false,
        blockIndex,
        top: blockTop,
        height: rect.height / scale,
        lineInBlock: 0,
        unbreakable: true,
      })
      return
    }

    const node = editor.children[blockIndex] as unknown as object | undefined
    const width = child.offsetWidth
    const cached = node ? measurementCache.get(node) : undefined

    const lines =
      cached && cached.width === width
        ? fromRelativeLines(cached.lines, blockIndex, blockTop)
        : buildBlockLines(editor, child, blockIndex, originTop, scale, fallback)

    if (node && !(cached && cached.width === width)) {
      measurementCache.set(node, { width, lines: toRelativeLines(lines, blockTop) })
    }

    lines.forEach((line, lineInBlock) => {
      units.push({ ...line, lineInBlock, unbreakable: false })
    })
  })

  return units
}

interface AppliedGap {
  /** Rendered position, unscaled, relative to the editable. */
  top: number
  /** The height that was *asked for*, not the space the layout ended up using. */
  height: number
}

/**
 * Gaps this engine applied on an earlier pass, read back from the DOM.
 *
 * Declared heights, deliberately. A spacer is `display: block` inside an inline flow, so it splits
 * the paragraph into anonymous block boxes and the browser adds roughly a half-leading at each new
 * boundary — the space it actually occupies is ~9px more than its height. Measuring the slack
 * instead of reading the declared value over-subtracts by exactly that much, which is enough to move
 * the computed break to the next line, which moves it back on the following pass. That oscillation
 * is what made React bail out with "Maximum update depth exceeded".
 */
function collectAppliedGaps(editable: HTMLElement, originTop: number, scale: number): AppliedGap[] {
  const gaps: AppliedGap[] = []

  for (const el of Array.from(editable.querySelectorAll<HTMLElement>(`[${PAGE_SPACER_ATTR}]`))) {
    const declared = parseFloat(el.style.height)
    if (!Number.isFinite(declared) || declared <= 0) continue
    gaps.push({ top: (el.getBoundingClientRect().top - originTop) / scale, height: declared })
  }

  for (const child of Array.from(editable.children) as HTMLElement[]) {
    if (child.dataset.pageStart !== 'true') continue
    const declared = parseFloat(child.style.marginTop)
    if (!Number.isFinite(declared) || declared <= 0) continue
    // The margin sits above the child, so the gap starts that much higher up.
    gaps.push({
      top: (child.getBoundingClientRect().top - originTop) / scale - declared,
      height: declared,
    })
  }

  return gaps.sort((a, b) => a.top - b.top)
}

/** Rewrites each unit's `top` from rendered coordinates into natural ones. */
function toNaturalFlow(units: FlowUnit[], gaps: AppliedGap[]): void {
  if (gaps.length === 0) return

  for (const unit of units) {
    let offset = 0
    for (const gap of gaps) {
      if (gap.top >= unit.top) break
      offset += gap.height
    }
    unit.top -= offset
  }
}

/** Computes page breaks for the current DOM. */
export function paginate(
  editor: EditorInstance,
  editable: HTMLElement,
  geometry: PageGeometry,
): PaginationResult {
  const { usableHeight, chromeHeight, allowLineBreaks = false } = geometry
  if (usableHeight <= 0) return EMPTY_PAGINATION

  const scale = getScaleFactor(editable)
  const originTop = editable.getBoundingClientRect().top
  const units = buildUnits(editor, editable, originTop, scale)
  toNaturalFlow(units, collectAppliedGaps(editable, originTop, scale))

  const breaks: PageBreak[] = []
  const oversized: OversizedBlock[] = []
  let pageBottom = usableHeight

  for (const unit of units) {
    // Clamping keeps a block that is taller than a whole sheet from cascading a bogus break onto
    // everything after it. Unbreakable ones get reported so the caller can cap them; a single line
    // taller than a sheet is pathological and is simply allowed to overflow.
    //
    // The `>=` matters: once the cap is applied the block measures exactly one sheet, and a strict
    // `>` would drop it from the list, un-cap it, and oscillate forever.
    if (unit.unbreakable && unit.height >= usableHeight - EPSILON) {
      oversized.push({ blockIndex: unit.blockIndex, maxHeightPx: usableHeight })
    }
    const effectiveHeight = Math.min(unit.height, usableHeight)

    if (unit.top + effectiveHeight <= pageBottom + EPSILON) continue

    const gapPx = Math.max(0, pageBottom - unit.top) + chromeHeight

    // A line break needs a trustworthy point. When the offset could not be resolved we fall back to
    // moving the whole block, which is less pretty but never puts the gap in the wrong place.
    if (!allowLineBreaks || unit.lineInBlock === 0 || !unit.resolved) {
      breaks.push({ kind: 'block', blockIndex: unit.blockIndex, gapPx, y: unit.top })
    } else {
      breaks.push({ kind: 'line', blockIndex: unit.blockIndex, point: unit.start, gapPx, y: unit.top })
    }

    pageBottom = unit.top + usableHeight
  }

  const pageCount = breaks.length + 1

  return {
    breaks,
    oversized,
    lines: units.map(({ lineInBlock: _lineInBlock, unbreakable: _unbreakable, ...line }) => line),
    pageCount,
    flowHeight: pageCount * usableHeight + (pageCount - 1) * chromeHeight,
  }
}
