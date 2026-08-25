import { convertFileSrc } from '@tauri-apps/api/core'

/** Image URLs live in the document as raw filesystem paths and are converted to something the webview can load at render time.  
 * Keeping the platform-specific scheme at the render boundary fixes both issues and leaves documents portable. 
 * This avoid cross-machine document sharing problems*/

/** Schemes the webview loads directly. Anything else is treated as a path on disk. */
const ALREADY_LOADABLE = /^(?:https?:|data:|blob:|asset:|file:)/i

/** Converts a stored image URL to something usable as an img src attribute. URLs already loadable pass through unchanged. 
 * Stored paths are converted using the platform-specific scheme or returned as-is if conversion is not available. */
export function convertStoredImagePathToSrc(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  if (ALREADY_LOADABLE.test(url)) return url

  try {
    return convertFileSrc(url)
  } catch {
    // Outside Tauri there is no asset protocol; the raw value is the best available answer.
    return url
  }
}