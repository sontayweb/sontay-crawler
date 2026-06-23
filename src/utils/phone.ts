/**
 * Normalizes Vietnamese phone numbers into a standard format (e.g. 0987654321).
 */
export function normalizePhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  
  let trimmed = phone.trim();
  
  // Convert country code prefix +84 or 84 to leading 0
  if (trimmed.startsWith("+84")) {
    trimmed = "0" + trimmed.slice(3);
  } else if (trimmed.startsWith("84") && trimmed.length > 9) {
    trimmed = "0" + trimmed.slice(2);
  }
  
  // Keep only digits
  const digits = trimmed.replace(/\D/g, "");
  
  // Standard Vietnamese phone numbers are 9-11 digits (mobile is 10, some landlines vary)
  if (digits.length >= 9 && digits.length <= 11) {
    if (!digits.startsWith("0")) {
      return "0" + digits;
    }
    return digits;
  }
  
  return undefined;
}
