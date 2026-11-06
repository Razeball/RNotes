import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings } from "../../components/Settings";

/**
 * Words per minute for the status bar: characters typed over time elapsed, five characters to a
 * word, recomputed every two seconds while the setting is on.
 */
export function useTypingSpeed(settings: AppSettings) {
  const [typeSpeed, setTypeSpeed] = useState<number | null>(null);
  const typingStartTime = useRef<number | null>(null);
  const totalCharsTyped = useRef<number>(0);

  useEffect(() => {
    if (!settings.showTypeSpeed) {
      setTypeSpeed(null);
      typingStartTime.current = null;
      totalCharsTyped.current = 0;
      return;
    }
    const interval = setInterval(() => {
      if (typingStartTime.current === null || totalCharsTyped.current === 0) {
        setTypeSpeed(0);
        return;
      }
      const elapsedMinutes = (Date.now() - typingStartTime.current) / 60000;
      if (elapsedMinutes < 0.05) {
        setTypeSpeed(0);
        return;
      }
      const wpm = Math.round((totalCharsTyped.current / 5) / elapsedMinutes);
      setTypeSpeed(wpm);
    }, 2000);
    return () => clearInterval(interval);
  }, [settings.showTypeSpeed]);

  const trackKeystroke = useCallback(() => {
    if (settings.showTypeSpeed) {
      if (typingStartTime.current === null) {
        typingStartTime.current = Date.now();
      }
      totalCharsTyped.current += 1;
    }
  }, [settings.showTypeSpeed]);

  /** Starts the count over, for a tab switch: speed belongs to one stretch of typing. */
  const resetTypingSpeed = () => {
    typingStartTime.current = null;
    totalCharsTyped.current = 0;
    setTypeSpeed(settings.showTypeSpeed ? 0 : null);
  };

  return { typeSpeed, trackKeystroke, resetTypingSpeed };
}
