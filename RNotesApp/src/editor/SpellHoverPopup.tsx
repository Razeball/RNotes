import { useTranslation } from "react-i18next";
import type { SpellPayload } from "../services/spellcheck";

/**
 * The card under a flagged word: what kind of issue it is and up to five fixes. Clicking one applies
 * it in place; the card stays open while the pointer travels from the word to it.
 */
export function SpellHoverPopup({
  spellHover,
  hoverSuggestions,
  spellRuleLabel,
  keepSpellHover,
  releaseSpellHover,
  applyWordSuggestion,
  setSpellHover,
}: {
  spellHover: { payload: SpellPayload; x: number; y: number };
  hoverSuggestions: string[] | null;
  spellRuleLabel: (rule: SpellPayload['rule']) => string;
  keepSpellHover: () => void;
  releaseSpellHover: () => void;
  applyWordSuggestion: (payload: SpellPayload, replacement: string) => void;
  setSpellHover: (value: null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="rn-spell-popup"
      style={{ left: spellHover.x, top: spellHover.y }}
      onMouseEnter={keepSpellHover}
      onMouseLeave={releaseSpellHover}
    >
      <span className="rn-spell-suggestions-title">{spellRuleLabel(spellHover.payload.rule)}</span>
      {hoverSuggestions === null ? (
        <span className="rn-spell-suggestion-empty">{t("Looking for suggestions...")}</span>
      ) : hoverSuggestions.length === 0 ? (
        <span className="rn-spell-suggestion-empty">{t("No suggestions")}</span>
      ) : (
        hoverSuggestions.slice(0, 5).map((suggestion, index) => (
          <button
            type="button"
            className="rn-spell-suggestion"
            key={`${suggestion}-${index}`}
            // mousedown, and prevented, so the click never takes focus off the editor.
            onMouseDown={(event) => {
              event.preventDefault();
              applyWordSuggestion(spellHover.payload, suggestion);
              setSpellHover(null);
            }}
          >
            {suggestion === '' ? t("(remove)") : suggestion}
          </button>
        ))
      )}
    </div>
  );
}
