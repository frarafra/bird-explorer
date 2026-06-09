export function recordingAudioUrl(rec: unknown): string | null {
    if (!rec || typeof rec !== 'object') return null;
    const r = rec as Record<string, unknown>;
    const file = r.file;
    if (typeof file === 'string') {
        if (file.startsWith('http')) return file;
        return file.startsWith('//') ? `https:${file}` : `https:${file}`;
    }
    const id = r.id;
    if (typeof id === 'string' || typeof id === 'number') return `https://www.xeno-canto.org/${id}/download`;
    return null;
}
