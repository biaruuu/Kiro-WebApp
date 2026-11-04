/**
 * Subtitle parsing for SRT, WebVTT and ASS/SSA files.
 *
 * The player renders captions itself (so they can use Poppins and be timed
 * precisely), which means it needs its own parser instead of relying on the
 * browser's <track> support. That is also what makes .srt and .ass files work.
 */

export type Cue = { start: number; end: number; text: string }
export type CaptionFormat = "vtt" | "srt" | "ass"
export type ParsedCaptions = { cues: Cue[]; format: CaptionFormat }

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
  "&lrm;": "",
  "&rlm;": "",
}

function decodeEntities(value: string) {
  return value.replace(
    /&(?:amp|lt|gt|quot|nbsp|lrm|rlm|#39);/g,
    (match) => ENTITIES[match] ?? match
  )
}

/** "00:01:02.500", "01:02,500", "0:01:02.50" (ASS centiseconds) -> seconds. */
function parseTimestamp(raw: string): number {
  const match = raw
    .trim()
    .match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/)
  if (!match) return NaN
  const [, hours, minutes, seconds, fraction] = match
  const millis = fraction ? Number(fraction.padEnd(3, "0").slice(0, 3)) : 0
  return (
    Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds) + millis / 1000
  )
}

/** Strips styling tags and normalises line breaks. */
function cleanText(raw: string) {
  return decodeEntities(
    raw
      .replace(/\{[^}]*\}/g, "") // ASS override blocks like {\an8}{\i1}
      .replace(/<[^>]*>/g, "") // <i>, <b>, <c.class>, <00:01.000>
      .replace(/\\N/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\h/g, " ")
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
}

export function detectFormat(text: string): CaptionFormat {
  const head = text.replace(/^﻿/, "").trimStart()
  if (/^WEBVTT/.test(head)) return "vtt"
  if (
    /^\[Script Info\]/i.test(head) ||
    /^\[Events\]/im.test(head) ||
    /^Dialogue:/m.test(head)
  ) {
    return "ass"
  }
  return "srt"
}

/** SRT and WebVTT share the "start --> end" block structure. */
function parseBlocks(text: string): Cue[] {
  const cues: Cue[] = []
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n")
    const timingIndex = lines.findIndex((line) => line.includes("-->"))
    if (timingIndex === -1 || /^NOTE\b/.test(lines[0])) continue

    const [startRaw, rest] = lines[timingIndex].split("-->")
    const start = parseTimestamp(startRaw)
    const end = parseTimestamp(rest.trim().split(/\s+/)[0] ?? "")
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue

    const text = cleanText(lines.slice(timingIndex + 1).join("\n"))
    if (text) cues.push({ start, end, text })
  }
  return cues
}

function parseAss(text: string): Cue[] {
  const cues: Cue[] = []
  let inEvents = false
  let fields: string[] | null = null

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim()
    if (/^\[.+\]$/.test(line)) {
      inEvents = /^\[events\]$/i.test(line)
      continue
    }
    if (!inEvents) continue
    if (/^format:/i.test(line)) {
      fields = line
        .slice(7)
        .split(",")
        .map((field) => field.trim().toLowerCase())
      continue
    }
    if (!/^dialogue:/i.test(line)) continue

    const columns = fields ?? [
      "layer", "start", "end", "style", "name",
      "marginl", "marginr", "marginv", "effect", "text",
    ]
    // The text column is last and may itself contain commas.
    const parts: string[] = []
    let rest = line.slice(9).trim()
    for (let i = 0; i < columns.length - 1; i++) {
      const comma = rest.indexOf(",")
      if (comma === -1) break
      parts.push(rest.slice(0, comma))
      rest = rest.slice(comma + 1)
    }
    parts.push(rest)

    const get = (name: string) => parts[columns.indexOf(name)] ?? ""
    const start = parseTimestamp(get("start"))
    const end = parseTimestamp(get("end"))
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue

    const raw = get("text")
    if (/\{[^}]*\\p[1-9]/.test(raw)) continue // vector drawings, not text
    const cleaned = cleanText(raw)
    if (cleaned) cues.push({ start, end, text: cleaned })
  }
  return cues
}

export function parseCaptions(input: string): ParsedCaptions {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n")
  const format = detectFormat(text)
  const cues = (format === "ass" ? parseAss(text) : parseBlocks(text))
    .filter((cue) => cue.end > cue.start)
    .sort((a, b) => a.start - b.start)
  return { cues, format }
}

/** Decodes subtitle bytes as UTF-8, falling back to Windows-1252 for older files. */
export function decodeText(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer)
  if (!utf8.includes("�")) return utf8
  try {
    return new TextDecoder("windows-1252").decode(buffer)
  } catch {
    return utf8
  }
}

/**
 * True for WebVTT "thumbnails" tracks used for seek-bar previews. Their cue
 * text is an image reference like `storyboard.jpg#xywh=0,0,180,101`, not
 * dialogue, so they must not be shown as subtitles.
 */
export function isThumbnailTrack(cues: Cue[]): boolean {
  return (
    cues.length > 0 &&
    cues.every((cue) =>
      /(#xywh=|\.(?:jpe?g|png|webp|avif|gif)(?:[?#]|$))/i.test(cue.text.trim())
    )
  )
}

/** Text of every cue visible at `time` (seconds). */
export function activeText(cues: Cue[], time: number): string {
  let out = ""
  for (const cue of cues) {
    if (cue.start > time) break
    if (time < cue.end) out += (out ? "\n" : "") + cue.text
  }
  return out
}
