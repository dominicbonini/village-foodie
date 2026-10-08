'use client'

// components/manage/PostShareBar.tsx — the ONE button row under a made post.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHY THIS FILE EXISTS: SHARE DOWNLOADED THE PICTURE ON A MAC (6 October 2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// REPORTED BY DOMINIC: *"On a MacBook in Safari, pressing Share on a made post immediately downloads
// the image instead of opening a share sheet."* It did, on both posts, and the cause was the same code
// written twice:
//
//     const share = async () => {
//       await navigator.clipboard.writeText(caption)       // await 1
//       const blob = await (await fetch(png)).blob()       // awaits 2 and 3
//       if (nav.canShare?.({ files: [file] })) {
//         await navigator.share({ files: [file] })         // ← no longer a user gesture
//       }
//     } catch { }
//     download()                                           // ← and this is what the operator saw
//
// 🔴 `navigator.share()` REQUIRES TRANSIENT USER ACTIVATION, AND WEBKIT'S TEST IS A STACK TEST.
// Safari does not run the specification's few-second timer: you have activation while you are in the
// same stack as the click handler and in the same tick. Three `await`s put the call in a later
// microtask, so WebKit rejects with `NotAllowedError` — and the bare `catch` turned that rejection
// into a silent `download()`. **The Mac was never refusing to share. It was being asked too late.**
//
// ⚠️ SO THE FILE IS PREPARED BEFOREHAND AND THE HANDLER IS SYNCHRONOUS. The blob is already in memory
// — both make screens render the PNG into one and hand it straight to an object URL — so this takes
// the blob rather than the URL and there is nothing left to fetch. `onClick` calls `navigator.share`
// as a statement, not after an `await`.
//
// ⛔ AND THE ORDER OF THE TWO CALLS IS NOT ARBITRARY. The caption goes to the clipboard FIRST because
// Instagram and Facebook take the image from a share sheet and leave the caption to be pasted, and
// because afterwards is too late — the sheet takes the page out of focus and the write is refused.
// `clipboard.writeText` CHECKS activation; `share` CONSUMES it. Writing first therefore costs nothing
// and sharing first would cost the clipboard. ⚠️ NEITHER IS AWAITED BEFORE THE OTHER: both promises
// are created inside the tap, and only their results are handled later.
//
// ⛔ A CANCELLED SHEET IS NOT A FAILURE. The old code downloaded on ANY rejection, so closing the
// share sheet left a file in Downloads the operator had not asked for. `AbortError` is the user saying
// no and is handled as nothing at all.
//
// 🔴 AND WHERE A FILE CANNOT BE SHARED, THERE IS NO Share BUTTON. Desktop Chrome and Firefox have
// `navigator.share` but not file sharing, so `canShare({ files })` is false and the old button could
// only ever have downloaded. A button whose label says one thing and whose only behaviour is another
// is the "two buttons doing one thing" fault from the weekly post's stage 1, in a worse form: one
// button doing a different thing. It is replaced by the two it was standing in for.
//
// ⚠️ ONE COMPONENT, BOTH SCREENS. The weekly post and the single event post had the same `share()`
// function, separately, with the same bug — which is how one report became two fixes. It is now one.

import { useEffect, useMemo, useState } from 'react'
import { Btn } from '@/components/manage/primitives'
import { SHARE_CAPTION_NOTE } from '@/lib/copy/socialPosts'

/** What a share or a copy has to say afterwards. The two screens each own their own status line. */
type Status = (message: string) => void

export function PostShareBar({ blob, url, fileName, caption, captionWord = 'Caption', onStatus }: {
  /** The rendered PNG, as the blob the render call already produced. `null` while it is building. */
  blob: Blob | null
  /** The object URL for that same blob — the one the screen is already showing in its `<img>`. */
  url: string | null
  /** What the download is called. */
  fileName: string
  /** The caption or post text that travels with the picture. */
  caption: string
  /** "Caption" on the weekly post, "Post text" on a single event — only for the status sentence. */
  captionWord?: string
  onStatus: Status
}) {
  /**
   * 🔴 THE `File` AND THE ANSWER TO "can this be shared?", BOTH SETTLED BEFORE THE TAP.
   *
   * ⛔ `canShare` IS CALLED WITH THE REAL FILE, not with a guess at one. It is specified to answer on
   * the data it is given — a type or a size the platform will not take is a `false` — so probing with
   * an empty `new File([], 'x.png')` would answer a question nobody asked.
   * ⚠️ AND IT IS FEATURE DETECTION, NOT USER-AGENT SNIFFING: Safari on macOS 14+ shares files and must
   * get the sheet, desktop Chrome does not and must get the two buttons, and neither is named here.
   *
   * ⚠️ `useMemo`, NOT AN EFFECT. Both are pure functions of the blob, so an effect would mean a second
   * render before the bar is right — and the lint rule that forbids `setState` in an effect body is
   * correct here rather than something to silence.
   * ⛔ `navigator` IS GUARDED BECAUSE THIS COMPONENT IS SERVER-RENDERED. There is no hydration mismatch
   * to manage: `blob` is only ever set from a fetch in the parent's effect, so on the server and on the
   * first client render it is null, `file` is null, and the Share button is absent in both.
   */
  const file = useMemo(
    () => (blob ? new File([blob], fileName, { type: blob.type || 'image/png' }) : null),
    [blob, fileName])

  const canShareFile = useMemo(() => {
    if (!file || typeof navigator === 'undefined') return false
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    return typeof nav.share === 'function' && nav.canShare?.({ files: [file] }) === true
  }, [file])

  /**
   * ══ 🔴 CAN THE CAPTION TRAVEL **WITH** THE PICTURE? (8 October 2026) ═════════════════════════════
   *
   * ⛔ IT IS A SEPARATE QUESTION FROM `canShareFile` AND MUST BE ASKED SEPARATELY. `canShare` is
   * specified to answer on the exact data it is given, and a platform that takes `{ files }` may
   * refuse `{ files, text }` — so asking once and sending more than was asked about is how a share
   * that worked yesterday starts throwing `TypeError`.
   * 🔴 WHERE IT IS TRUE, WhatsApp, Messages, X and LinkedIn ARRIVE WITH THE CAPTION ALREADY IN THE BOX.
   * ⚠️ WHERE IT IS FALSE the file still goes on its own and the clipboard still has the caption, which
   * is exactly today's behaviour — so this can only add.
   * ⛔ AND THE CLIPBOARD WRITE HAPPENS EITHER WAY. Facebook and Instagram accept the file and drop the
   * text whatever `canShare` says, which is what the grey line below exists to tell the operator.
   */
  const canShareText = useMemo(() => {
    if (!file || typeof navigator === 'undefined') return false
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    return nav.canShare?.({ files: [file], text: caption }) === true
  }, [file, caption])

  const [copied, setCopied] = useState(false)

  /** The "Copied" confirmation clears itself. ⚠️ Cleared on unmount too, so a closed modal's timer
   *  cannot set state on a component that has gone. */
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  const download = () => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
  }

  /**
   * ⚠️ NOT `async`. It is one statement and a promise handled afterwards, which is the whole point:
   * `clipboard.writeText` needs the activation this tap carries, and an `await` before it would be the
   * same mistake one line further down.
   */
  const copyCaption = () => {
    navigator.clipboard.writeText(caption)
      .then(() => { setCopied(true); onStatus(`${captionWord} copied.`) })
      .catch(() => onStatus('Could not copy — select the text and copy it by hand.'))
  }

  /**
   * ⛔ SYNCHRONOUS, AND THAT IS THE FIX. Both platform calls are made as statements of the click
   * handler; nothing is awaited until after `share()` has been handed the file.
   */
  const share = () => {
    if (!file) return
    /* ⚠️ FIRST, AND NOT AWAITED. See the header: writing checks activation, sharing consumes it.
     * ⛔ IT STILL HAPPENS EVEN WHEN THE TEXT TRAVELS WITH THE FILE, because the two apps that matter
     * most here — Facebook and Instagram — take the picture and drop the caption whatever `canShare`
     * said. The clipboard is the only thing that reaches them. */
    void navigator.clipboard.writeText(caption).catch(() => { /* the sheet still opens */ })
    /* 🔴 THE CAPTION GOES **WITH** THE FILE WHERE THE PLATFORM ACCEPTS BOTH. ⚠️ BUILT AS ONE OBJECT
     * LITERAL IN THE TAP, with no `await` anywhere in front of it — the activation rule this whole
     * file exists for is unchanged. */
    navigator.share(canShareText ? { files: [file], text: caption } : { files: [file] })
      .then(() => onStatus(`${captionWord} copied — paste it into your post.`))
      .catch((e: unknown) => {
        /* ⛔ THE OPERATOR CLOSING THE SHEET IS NOT AN ERROR AND MUST NOT DOWNLOAD ANYTHING. */
        if (e instanceof DOMException && e.name === 'AbortError') return
        /* 🔴 A REAL FAILURE FALLS BACK, AND SAYS WHAT IT DID. `canShare` said yes, so this is the
         * platform refusing at the moment of the share — the operator still needs the picture. */
        download()
        onStatus(`Sharing was refused, so the picture has been downloaded. ${captionWord} copied.`)
      })
  }

  return (
    <div data-post-share-bar>
      <div className="flex flex-wrap gap-2">
        <Btn label="Download picture" onClick={download} disabled={!url} />
        <Btn label={copied ? 'Copied ✓' : 'Copy caption'} colour="slate" onClick={copyCaption} />
        {/* 🔴 NO Share BUTTON WHERE A FILE CANNOT BE SHARED. The two buttons beside it are what it was
          * pretending to be. ⚠️ `canShareFile` is false while the picture is still building, so the
          * button appears with the picture rather than before it. */}
        {canShareFile && <Btn label="Share" colour="slate" onClick={share} />}
      </div>
      {/* ══ 🔴 THE ONE GREY LINE UNDER THE BUTTONS (8 October 2026) ══════════════════════════════
        * ⛔ IT NAMES THE TWO APPS rather than saying "some apps", because an operator whose caption did
        * not arrive needs to know whether they did something wrong — and on Facebook and Instagram
        * they did not. ⚠️ AND IT SAYS WHAT WE DID ABOUT IT ("it's copied"), so the sentence ends with
        * an action rather than with a complaint about a platform.
        * ⚠️ SHOWN ONLY WHERE THERE IS A SHARE SHEET. Without one the operator is pressing "Copy
        * caption" themselves and the line would be explaining a problem they do not have. */}
      {canShareFile && (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400" data-share-caption-note>
          {SHARE_CAPTION_NOTE}
        </p>
      )}
    </div>
  )
}
