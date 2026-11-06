export function canonicalJson(value: unknown): string {
    if (value === undefined) {
        throw new Error('canonicalJson: não é possível serializar undefined');
    }

    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return '[' + value.map(canonicalJson).join(',') + ']';
    }

    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
        .filter((key) => obj[key] !== undefined)
        .sort();

    const pairs = keys.map(
        (key) => JSON.stringify(key) + ':' + canonicalJson(obj[key]),
    );

    return '{' + pairs.join(',') + '}';
}
