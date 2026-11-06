import { useEffect, useRef, useState } from "react";
import { defaultSettings, type AppSettings } from "../../components/Settings";
import { loadKeySoundSamples } from "../../services/keySound";

/**
 * The app's settings, plus a ref that always holds the latest — for callbacks that are registered
 * once and must still see a toggle made afterwards.
 */
export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // The sound happens when the setting turns on because decoding take a moment
  useEffect(() => {
    if (settings.keySoundEnabled) void loadKeySoundSamples();
  }, [settings.keySoundEnabled]);

  return { settings, setSettings, settingsRef };
}
