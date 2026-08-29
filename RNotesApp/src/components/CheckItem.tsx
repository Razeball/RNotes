import { Transforms } from 'slate'
import { ReactEditor, useSlateStatic, type RenderElementProps } from 'slate-react'
import { useTranslation } from 'react-i18next'
import CheckButton from './CheckButton'
import type { CustomElement } from '../Editor'
import '../styles/CheckItem.css'

type CheckItemElementProps = {
  attributes: RenderElementProps['attributes']
  children: React.ReactNode
  element: CustomElement
  style?: React.CSSProperties
}

/** A `check` block: the checkbox is a non-editable sibling of the text, not part of it. */
export default function CheckItemElement({ attributes, children, element, style }: CheckItemElementProps) {
  const { t } = useTranslation()
  const editor = useSlateStatic()
  const checked = element.checked === true

  const toggle = () => {
    Transforms.setNodes(
      editor,
      { checked: !checked },
      { at: ReactEditor.findPath(editor, element) }
    )
  }

  return (
    <div
      {...attributes}
      className="rn-check-item"
      data-checked={checked ? 'true' : undefined}
      style={style}
    >
      <CheckButton checked={checked} onToggle={toggle} label={t("Toggle task")} />
      <span className="rn-check-text">{children}</span>
    </div>
  )
}
