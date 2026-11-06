import type { BaseEditor } from "slate";
import { PAGE_SPACER_TYPE, clearPageSpacers } from "../services/pageSpacers";
import type { EditorInstance } from "../editorActions";

/** Slate plugins: each takes the editor and overrides the behaviour of one kind of node. */

export const withImages = <T extends BaseEditor>(editor: T): T => {
  const { isVoid, isInline } = editor;

  editor.isVoid = (element) => {
    return element.type === 'image' ? true : isVoid(element);
  };

  editor.isInline = (element) => {
    return element.type === 'image' ? false : isInline(element);
  };

  return editor;
};

/**
 * Page gaps are void nodes so Slate's own machinery carries the selection through them.
 */
export const pageWithSpacers = <T extends BaseEditor>(editor: T): T => {
  const { isVoid, isInline, deleteBackward, deleteForward, deleteFragment, insertBreak } = editor;

  editor.isVoid = (element) => (element.type === PAGE_SPACER_TYPE ? true : isVoid(element));
  editor.isInline = (element) => (element.type === PAGE_SPACER_TYPE ? true : isInline(element));

  // Clearing them first sidesteps the whole class of interaction. So the next pagination put it back
  const pageWithoutSpacers = <R,>(operation: () => R): R => {
    clearPageSpacers(editor as unknown as EditorInstance);
    return operation();
  };

  editor.deleteBackward = (unit) => pageWithoutSpacers(() => deleteBackward(unit));
  editor.deleteForward = (unit) => pageWithoutSpacers(() => deleteForward(unit));
  editor.deleteFragment = (options) => pageWithoutSpacers(() => deleteFragment(options));
  editor.insertBreak = () => pageWithoutSpacers(() => insertBreak());

  return editor;
};
