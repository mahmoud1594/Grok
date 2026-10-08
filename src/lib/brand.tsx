// Ask MonTaser is the brand on every host. ?brand=mahmouddxb switches the browser tab back to MahmoudDXB
// (sessionStorage); any other ?brand value clears that.
function detect(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('brand')
    const s = window.sessionStorage
    if (q === 'mahmouddxb') s.setItem('mdxb_brand', 'mahmouddxb')
    else if (q) s.removeItem('mdxb_brand')
    return s.getItem('mdxb_brand') !== 'mahmouddxb'
  } catch {
    return true
  }
}

export const IS_ASKMONTASER = typeof window !== 'undefined' && detect()
export const BRAND = IS_ASKMONTASER ? 'Ask MonTaser' : 'MahmoudDXB'

/** Swap the MahmoudDXB brand word inside server-provided labels (e.g. whatsapp-links names). */
export const brandText = (s: string) => (IS_ASKMONTASER ? s.replace(/Mahmoud ?DXB/g, BRAND) : s)

/** Logo: the Ask MonTaser wordmark image, or Mahmoud<red>DXB</red>. */
export function BrandMark() {
  return IS_ASKMONTASER ? (
    <img className="brand-logo" src="/brand/ask-montaser-logo-light.svg" alt="Ask MonTaser" width={128} height={16} />
  ) : (
    <>
      Mahmoud<span className="brand-dxb">DXB</span>
    </>
  )
}
