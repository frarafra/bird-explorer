export function recordingAudioUrl(rec: any) {
    if (!rec) return null;
    if (rec.file && typeof rec.file === 'string') {
        if (rec.file.startsWith('http')) return rec.file;
        return rec.file.startsWith('//') ? `https:${rec.file}` : `https:${rec.file}`;
    }
    if (rec.id) return `https://www.xeno-canto.org/${rec.id}/download`;
    return null;
}
