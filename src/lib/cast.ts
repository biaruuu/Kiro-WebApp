/**
 * Chromecast through Google's Cast sender SDK (Chrome, Edge and other Chromium browsers).
 * The TV fetches the stream itself, so the address must be public (our signed /api/proxy link is).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type CastWindow = Window & { __onGCastApiAvailable?: (ok: boolean) => void; cast?: any; chrome?: any }

let sdk: Promise<boolean> | null = null

/** Starts loading the SDK. Call it early: asking for a device must happen straight from a tap. */
export function loadCastSdk(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false)
  sdk ??= new Promise<boolean>((resolve) => {
    const w = window as CastWindow
    w.__onGCastApiAvailable = (ok) => resolve(Boolean(ok))
    const script = document.createElement("script")
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"
    script.async = true
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
    window.setTimeout(() => resolve(false), 10_000)
  })
  return sdk
}

export const castSdkReady = () => {
  const w = typeof window === "undefined" ? null : (window as CastWindow)
  return Boolean(w?.cast?.framework && w?.chrome?.cast?.media)
}

export class CastCancelled extends Error {}

export async function castMedia(opts: {
  url: string
  contentType: string
  title: string
  poster?: string
  startTime: number
}): Promise<string> {
  if (!castSdkReady()) throw new Error("Cast is not available")
  const w = window as CastWindow
  const cast = w.cast
  const chrome = w.chrome
  const context = cast.framework.CastContext.getInstance()
  context.setOptions({
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
  })
  try {
    await context.requestSession()
  } catch (e) {
    // Closing the device picker rejects with "cancel".
    if (String(e).toLowerCase().includes("cancel")) throw new CastCancelled()
    throw e
  }
  const session = context.getCurrentSession()
  const info = new chrome.cast.media.MediaInfo(opts.url, opts.contentType)
  info.streamType = chrome.cast.media.StreamType.BUFFERED
  const meta = new chrome.cast.media.GenericMediaMetadata()
  meta.title = opts.title
  if (opts.poster && /^https?:/i.test(opts.poster)) meta.images = [new chrome.cast.Image(opts.poster)]
  info.metadata = meta
  const request = new chrome.cast.media.LoadRequest(info)
  request.autoplay = true
  request.currentTime = Math.max(0, opts.startTime)
  const failure = await session.loadMedia(request)
  if (failure) throw new Error(`Cast failed (${String(failure)})`)
  return session.getCastDevice?.()?.friendlyName ?? "your TV"
}
