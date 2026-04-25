export const PENDING_CODE_KEY = "splitnest:pendingReferralCode";

export function getPendingReferralCode() {
  return sessionStorage.getItem(PENDING_CODE_KEY);
}

export function setPendingReferralCode(code: string) {
  sessionStorage.setItem(PENDING_CODE_KEY, code.trim().toUpperCase());
}

export function clearPendingReferralCode() {
  sessionStorage.removeItem(PENDING_CODE_KEY);
}