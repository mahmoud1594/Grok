/** Digits for a row's own wa.me link. Too-short results are missing, so the control stays hidden. */
export function whatsappDigits(value: string | null | undefined): string | null {
  let digits = String(value ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = `971${digits.slice(1)}`
  if (digits.length < 9) return null
  return digits
}
