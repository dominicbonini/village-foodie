import QRCode from 'qrcode'

interface QRCodeOptions {
  url: string
  logoUrl?: string | null
  truckName: string
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

  const size = 500
  canvas.width = size
  canvas.height = size + 60

  // White background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Draw QR code
  const qrImg = new Image()
  await new Promise<void>((resolve, reject) => {
    qrImg.onload = () => resolve()
    qrImg.onerror = reject
    qrImg.src = qrDataUrl
  })
  ctx.drawImage(qrImg, 50, 30, size - 100, size - 100)

  // Draw logo in centre if available
  if (logoUrl) {
    try {
      const logo = new Image()
      logo.crossOrigin = 'anonymous'
      await new Promise<void>((resolve) => {
        logo.onload = () => resolve()
        logo.onerror = () => resolve()
        logo.src = logoUrl
      })
      if (logo.complete && logo.naturalWidth > 0) {
        const logoSize = 80
        const logoX = (size - logoSize) / 2
        const logoY = (size - logoSize) / 2 - 20
        // White circle behind logo
        ctx.fillStyle = '#FFFFFF'
        ctx.beginPath()
        ctx.arc(size / 2, logoY + logoSize / 2, logoSize / 2 + 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize)
      }
    } catch {
      // Logo failed — QR still valid
    }
  }

  // Truck name — bottom left
  ctx.fillStyle = '#334155'
  ctx.font = 'bold 14px Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(truckName, 20, size + 45)

  // "Powered by HatchGrab" — bottom right
  ctx.fillStyle = '#94A3B8'
  ctx.font = '13px Arial, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('Powered by HatchGrab', size - 20, size + 45)

  return canvas.toDataURL('image/png')
}
