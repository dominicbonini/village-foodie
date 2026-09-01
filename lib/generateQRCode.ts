import QRCode from 'qrcode'

interface QRCodeOptions {
  url: string
  logoUrl?: string | null
  truckName: string
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  width: number, height: number,
  radius: number
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

// Fetch an external image as a same-origin blob URL to avoid canvas CORS taint.
async function loadImageViaBlobUrl(url: string): Promise<HTMLImageElement | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    const blobUrl = URL.createObjectURL(blob)
    const img = new Image()
    await new Promise<void>((resolve) => {
      img.onload = () => resolve()
      img.onerror = () => resolve()
      img.src = blobUrl
    })
    URL.revokeObjectURL(blobUrl)
    return img.naturalWidth > 0 ? img : null
  } catch {
    return null
  }
}

// QR + centred square logo composite — no branding strip.
// Used for the fullscreen customer-facing QR modal.
/**
 * QR with the branded centre plate.
 *
 * `placeholderText` (demo only) draws the plate with TEXT where the logo would go — "Your logo here". It
 * shows off the branded-QR feature and hints at what signing up gets them, without faking a logo they
 * don't have. Ignored when a real logoUrl is supplied.
 */
export async function generateQRWithLogo(
  url: string,
  logoUrl: string | null | undefined,
  size = 600,
  placeholderText?: string | null,
): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: size,
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  })

  // Plain QR only when there's neither a logo NOR a placeholder to draw.
  if (!logoUrl && !placeholderText) return qrDataUrl

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return qrDataUrl
  canvas.width = size
  canvas.height = size

  const qrImg = new Image()
  await new Promise<void>(resolve => { qrImg.onload = () => resolve(); qrImg.src = qrDataUrl })
  ctx.drawImage(qrImg, 0, 0, size, size)

  const logo = logoUrl ? await loadImageViaBlobUrl(logoUrl) : null
  if (!logo && !placeholderText) return qrDataUrl

  // Match the 29% logo size used in generateQRCodePNG (116px on 400px QR)
  const logoSize = Math.round(size * 0.29)
  const cx = size / 2
  const logoX = cx - logoSize / 2
  const logoY = cx - logoSize / 2
  const padding = 6

  ctx.fillStyle = '#ffffff'
  roundRect(ctx, logoX - padding, logoY - padding, logoSize + padding * 2, logoSize + padding * 2, 8)
  ctx.fill()

  if (logo) {
    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize)
  } else if (placeholderText) {
    // Dashed outline + centred text, sized to the same plate the logo would occupy. Error correction is
    // 'H', so the centre can be covered without harming scannability — same budget the logo uses.
    ctx.save()
    ctx.strokeStyle = '#CBD5E1'
    ctx.lineWidth = Math.max(2, Math.round(size * 0.005))
    ctx.setLineDash([Math.round(size * 0.02), Math.round(size * 0.015)])
    roundRect(ctx, logoX, logoY, logoSize, logoSize, 6)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = '#64748B'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const fontPx = Math.round(logoSize * 0.16)
    ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`
    // Wrap on spaces so "Your logo here" stacks inside the plate instead of overflowing it.
    const words = placeholderText.split(' ')
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      if (ctx.measureText(next).width > logoSize * 0.82 && cur) { lines.push(cur); cur = w }
      else cur = next
    }
    if (cur) lines.push(cur)
    const lineH = fontPx * 1.25
    const startY = cx - ((lines.length - 1) * lineH) / 2
    lines.forEach((ln, i) => ctx.fillText(ln, cx, startY + i * lineH))
    ctx.restore()
  }

  return canvas.toDataURL('image/png')
}

/**
 * ── 🔴 THE POSTER'S GEOMETRY, IN ONE PLACE. ────────────────────────────────────────────────────────
 * These were literals inside `generateQRCodePNG`. They are exported because the Manage settings card
 * draws a "Your logo here" placeholder into the SAME space on its preview, and a placeholder that is
 * not exactly logo-sized is a lie about what the operator will get — it would show them a hole of the
 * wrong size in the middle of their code.
 * ⚠️ THE VALUES ARE UNCHANGED. This names them; it does not alter a single pixel of the output.
 */
export const QR_POSTER = {
  qrX: 50,
  qrY: 30,
  qrSize: 400,
  stripHeight: 72,
  canvasWidth: 500,
  /** 502 — kept as the same sum the drawing code uses. */
  canvasHeight: 30 + 400 + 72,
  logoSize: 116,
  logoPadding: 6,
  logoRadius: 8,
} as const

/**
 * The exact rect the truck logo's WHITE BACKING occupies on the poster — which is the visible hole in
 * the QR pattern, and therefore the thing a placeholder must match. 128x128 at (186,166) on a 500x502
 * canvas.
 */
export function posterLogoRect() {
  const centreX = QR_POSTER.qrX + QR_POSTER.qrSize / 2
  const centreY = QR_POSTER.qrY + QR_POSTER.qrSize / 2
  const size = QR_POSTER.logoSize + QR_POSTER.logoPadding * 2
  return { x: centreX - size / 2, y: centreY - size / 2, size, radius: QR_POSTER.logoRadius }
}

export async function generateQRCodePNG({
  url,
  logoUrl,
  truckName,
}: QRCodeOptions): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: { dark: '#1C1C1E', light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  // QR drawn at x=50, y=30, 400×400 → bottom edge at y=430
  // Bottom strip: 50px for branding row
  // ⚠️ READ FROM `QR_POSTER`, NOT RESTATED — same values, one definition. See its note above.
  const { qrX, qrY, qrSize, stripHeight } = QR_POSTER
  canvas.width = QR_POSTER.canvasWidth
  canvas.height = qrY + qrSize + stripHeight  // 502

  // White background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Draw QR pattern
  const qrImg = new Image()
  await new Promise<void>((resolve, reject) => {
    qrImg.onload = () => resolve()
    qrImg.onerror = reject
    qrImg.src = qrDataUrl
  })
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

  // Truck logo centred over QR pattern — fetch via blob URL to avoid CORS taint
  if (logoUrl) {
    const logo = await loadImageViaBlobUrl(logoUrl)
    if (logo) {
      const logoSize = QR_POSTER.logoSize
      // Centre of QR pattern
      const centreX = qrX + qrSize / 2  // 250
      const centreY = qrY + qrSize / 2  // 230
      const logoX = centreX - logoSize / 2  // 192
      const logoY = centreY - logoSize / 2  // 172

      // White rounded square behind logo
      const padding = QR_POSTER.logoPadding
      ctx.fillStyle = '#FFFFFF'
      roundRect(ctx, logoX - padding, logoY - padding,
                logoSize + padding * 2, logoSize + padding * 2, QR_POSTER.logoRadius)
      ctx.fill()

      ctx.drawImage(logo, logoX, logoY, logoSize, logoSize)
    }
  }

  // Branding row — directly below QR, centred in 72px strip
  const brandingY = qrY + qrSize + 52  // y=482, text baseline

  // Truck name — bottom left, aligned with QR left edge
  ctx.fillStyle = '#1C1C1E'
  ctx.font = 'bold 22px Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(truckName, qrX, brandingY)

  // HatchGrab branding — bottom right, aligned with QR right edge
  const rightX = qrX + qrSize  // 450

  // ── 🔴 THE WORDS, NOT THE MARK. ─────────────────────────────────────────────────────────────────
  // This drew the HatchGrab LOGO IMAGE, with this text as a fallback when the file failed to load.
  // The text is now the only path, by decision, 28 August 2026: on a printed poster beside the
  // operator's own name, a second logo reads as co-branding — two businesses on one sign — where the
  // words read as an attribution, which is what it is. Their name is the brand on their board.
  //
  // ✅ AND IT REMOVES A FAILURE MODE RATHER THAN ADDING ONE. The image path depended on fetching a PNG
  // through a blob URL at draw time; when that silently failed the poster fell back HERE anyway. One
  // path that always works replaces two paths where the better-looking one could vanish without notice.
  // ⚠️ `loadImageViaBlobUrl` is STILL USED for the truck's own logo above — this removes one caller.
  ctx.fillStyle = '#6B7280'
  ctx.font = '18px Arial, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('Powered by HatchGrab', rightX, brandingY)

  return canvas.toDataURL('image/png')
}
