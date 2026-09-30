import 'server-only'
import QRCode from 'qrcode'

// The pass QR, drawn on the server: black on white so any phone camera reads it, in dark mode too.
// It holds the link to the club panel (/club/day-use/pase/<code>), which only staff can open.
export async function passQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  })
}
