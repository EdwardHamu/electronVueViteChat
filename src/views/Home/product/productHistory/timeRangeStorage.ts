export const PRODUCT_HISTORY_TIME_RANGE_KEY = 'productHistory.timeRange.v1'

type TimeRange = { StartTime: number; EndTime: number }

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isFinite(new Date(value).getTime())

export const loadProductHistoryTimeRange = (now = Date.now()): TimeRange => {
  const start = new Date(now)
  start.setDate(start.getDate() - 3)
  const defaults = { StartTime: start.getTime(), EndTime: now }
  try {
    const saved = JSON.parse(localStorage.getItem(PRODUCT_HISTORY_TIME_RANGE_KEY) || 'null')
    return {
      StartTime: isTimestamp(saved?.StartTime) ? saved.StartTime : defaults.StartTime,
      EndTime: isTimestamp(saved?.EndTime) ? saved.EndTime : defaults.EndTime,
    }
  } catch {
    // Corrupt or unavailable storage must not prevent opening the page.
    return defaults
  }
}

export const saveProductHistoryTimeRange = (range: TimeRange): void => {
  if (!isTimestamp(range.StartTime) || !isTimestamp(range.EndTime)) return
  try {
    localStorage.setItem(PRODUCT_HISTORY_TIME_RANGE_KEY, JSON.stringify({
      StartTime: range.StartTime,
      EndTime: range.EndTime,
    }))
  } catch {
    // Queries remain usable when storage is disabled or full.
  }
}
