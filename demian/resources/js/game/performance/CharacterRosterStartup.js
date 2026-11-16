/**
 * Begin the optional roster request before Open World's synchronous setup.
 * Resolve errors as data immediately so early rejection never becomes an
 * unhandled promise rejection. Static releases have a canonical local roster.
 */
export function preloadCharacterRoster(repository, { documentRef = globalThis.document } = {}) {
    const staticBuiltinsOnly = documentRef?.querySelector?.(
        'meta[name="demian-static-release"][content="true"]'
    ) && /(?:^|\/)characters\.json(?:[?#].*)?$/.test(repository?.baseUrl ?? '');
    if (staticBuiltinsOnly) return Promise.resolve({ characters: [], error: null });
    try {
        return Promise.resolve(repository.list()).then(
            characters => ({ characters, error: null }),
            error => ({ characters: [], error }),
        );
    } catch (error) {
        return Promise.resolve({ characters: [], error });
    }
}
