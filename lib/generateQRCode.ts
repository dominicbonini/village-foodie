import QRCode from 'qrcode'

interface QRCodeOptions {
  url: string
  logoUrl?: string | null
  truckName: string
  hatchgrabLogoUrl?: string | null
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

export async function generateQRCodePNG({
  url,
  logoUrl,
  truckName,
  hatchgrabLogoUrl,
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
  const qrX = 50
  const qrY = 30
  const qrSize = 400
  const stripHeight = 72
  canvas.width = 500
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
      const logoSize = 116
      // Centre of QR pattern
      const centreX = qrX + qrSize / 2  // 250
      const centreY = qrY + qrSize / 2  // 230
      const logoX = centreX - logoSize / 2  // 192
      const logoY = centreY - logoSize / 2  // 172

      // White rounded square behind logo
      const padding = 6
      ctx.fillStyle = '#FFFFFF'
      roundRect(ctx, logoX - padding, logoY - padding,
                logoSize + padding * 2, logoSize + padding * 2, 8)
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

  if (hatchgrabLogoUrl) {
    const hgLogo = await loadImageViaBlobUrl(hatchgrabLogoUrl)
    if (hgLogo) {
      // Scale logo to 28px high to match larger text
      const logoH = 28
      const logoW = Math.round((hgLogo.naturalWidth / hgLogo.naturalHeight) * logoH)
      ctx.drawImage(hgLogo, rightX - logoW, brandingY - logoH, logoW, logoH)
    } else {
      // File not yet uploaded — fall back to text
      ctx.fillStyle = '#6B7280'
      ctx.font = '18px Arial, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText('Powered by HatchGrab', rightX, brandingY)
    }
  } else {
    ctx.fillStyle = '#6B7280'
    ctx.font = '18px Arial, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('Powered by HatchGrab', rightX, brandingY)
  }

  return canvas.toDataURL('image/png')
}
