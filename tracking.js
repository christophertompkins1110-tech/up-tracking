/*
 * UP Tracking — tracking-number scheme (shared by the public page and the
 * operator console). Format: UP + 9 digits + 1 Luhn check digit, e.g.
 * UP0000000018. The check digit catches typos before any lookup.
 */
(function (global) {
  const PREFIX = "UP";

  function luhnCheckDigit(digits) {
    let sum = 0;
    for (let i = digits.length - 1, pos = 0; i >= 0; i--, pos++) {
      let d = Number(digits[i]);
      if (pos % 2 === 0) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    return (10 - (sum % 10)) % 10;
  }

  function makeTrackingNumber(nineDigits) {
    const body = String(nineDigits).padStart(9, "0").slice(-9);
    return PREFIX + body + luhnCheckDigit(body);
  }

  function randomTrackingNumber() {
    let body = "";
    for (let i = 0; i < 9; i++) body += Math.floor(Math.random() * 10);
    return makeTrackingNumber(body);
  }

  function isValidTracking(code) {
    const m = /^UP(\d{9})(\d)$/.exec((code || "").trim().toUpperCase());
    if (!m) return false;
    return luhnCheckDigit(m[1]) === Number(m[2]);
  }

  global.UPTracking = { makeTrackingNumber, randomTrackingNumber, isValidTracking, luhnCheckDigit };
})(window);
