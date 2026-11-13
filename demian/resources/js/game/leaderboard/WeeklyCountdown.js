/**
 * The server is authoritative for weekly leaderboard boundaries. Clients may
 * disagree on wall time; calibrate from the response's UTC server_time.
 */
export function remainingWeeklySeconds({ next_reset_at, server_time } = {},
    receivedAtMs = Date.now(), nowMs = Date.now()) {
    const end = Date.parse(next_reset_at ?? '');
    const server = Date.parse(server_time ?? '');
    if (!Number.isFinite(end) || !Number.isFinite(server)) return null;
    const estimatedServerNow = server + Math.max(0, nowMs - receivedAtMs);
    return Math.max(0, Math.ceil((end - estimatedServerNow) / 1000));
}

export function formatWeeklyCountdown(seconds) {
    if (seconds == null || !Number.isFinite(seconds)) return '—';
    const total = Math.max(0, Math.floor(seconds));
    const days = Math.floor(total / 86400);
    const hours = Math.floor(total / 3600) % 24;
    const minutes = Math.floor(total / 60) % 60;
    const secs = total % 60;
    const digits = new Intl.NumberFormat('fa-IR', { useGrouping: false });
    const pad = n => digits.format(n).padStart(2, '۰');
    return `${digits.format(days)} روز، ${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}
