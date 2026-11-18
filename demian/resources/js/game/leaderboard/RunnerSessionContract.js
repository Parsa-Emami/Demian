import rules from '../../../game/runner-rules.json' with { type: 'json' };

export function validRunnerSession(response, requestedWidth, expectedVersion = rules.version) {
    return Boolean(response && typeof response === 'object'
        && typeof response.run_id === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(response.run_id)
        && response.rules_version === expectedVersion
        && (expectedVersion === rules.version || (Number.isSafeInteger(response.content_week) && response.content_week >= 0))
        && Number.isSafeInteger(response.seed)
        && response.seed >= 1 && response.seed <= 4294967295
        && Number.isInteger(requestedWidth)
        && requestedWidth >= rules.minWidth && requestedWidth <= rules.maxWidth
        && Number.isInteger(response.track_width)
        && response.track_width === requestedWidth
        && typeof response.expires_at === 'string'
        && Number.isFinite(Date.parse(response.expires_at)));
}
