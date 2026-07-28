const DHAKA_UTC_OFFSET_MINUTES = 6 * 60; // UTC+6, no DST

// Returns today's date in Asia/Dhaka as a Date matching the same
// UTC-midnight representation that new Date("YYYY-MM-DD") produces —
// so it can be compared directly (even with strict equality) against
// values read from a @db.Date column.
export function getDhakaTodayDateOnly(): Date {
  const now = new Date();
  const dhakaNow = new Date(now.getTime() + DHAKA_UTC_OFFSET_MINUTES * 60 * 1000);
  return new Date(
    Date.UTC(dhakaNow.getUTCFullYear(), dhakaNow.getUTCMonth(), dhakaNow.getUTCDate()),
  );
}