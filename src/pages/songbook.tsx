"use client";

import React, { useContext, useEffect, useState } from 'react';
import MainLayout from '../layouts/MainLayout';
import { BirdContext } from '../contexts/BirdContext';
import { recordingAudioUrl } from '../utils/xeno';

type Recording = any;

const SongbookPage: React.FC = () => {
    const { birds, mapCenter } = useContext(BirdContext);
    const [records, setRecords] = useState<Record<string, Recording[]>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(0);
    const PAGE_SIZE = Number(process.env.NEXT_PUBLIC_SONGBOOK_PAGE_SIZE) || 5;

    const birdNames = Object.keys(birds || {});
    const [birdKeywords, setBirdKeywords] = useState<Record<string, string[]>>({});
    const [keywordsMap, setKeywordsMap] = useState<Record<string, string[]>>({});
    const [tagsLoaded, setTagsLoaded] = useState(false);
    const [selectedSpecies, setSelectedSpecies] = useState<string>('All Species');
    const lastWord = (s: string) => (s.split(' ').filter(Boolean).slice(-1)[0] || '').toLowerCase();
    const speciesList = tagsLoaded
        ? Object.keys(birds || {}).filter(name => (birdKeywords[name] && birdKeywords[name].length > 0))
        : Object.keys(birds || {});
    const speciesOptions = speciesList.sort((a, b) => lastWord(a).localeCompare(lastWord(b)));

    useEffect(() => {
        if (!birdNames.length) return;

        let cancelled = false;

        const loadTags = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch('/api/getBirdsTags', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ commonNames: birdNames, cache: true })
                });

                if (!res.ok) throw new Error(`Failed to fetch bird tags: ${res.status}`);

                const data = await res.json();

                if (!cancelled) {
                    setBirdKeywords(data.birdKeywords || {});
                    setKeywordsMap(data.keywordsMap || {});
                    setTagsLoaded(true);
                    setRecords({});
                    setPage(0);
                }
            } catch (e: any) {
                console.error(e);
                if (!cancelled) setError(e.message || 'Error');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadTags();

        return () => {
            cancelled = true;
        };
    }, [JSON.stringify(birdNames)]);

    useEffect(() => {
        if (!tagsLoaded || !birdNames.length) return;
        
        let cancelled = false;

        const loadPage = async () => {
            setLoading(true);
            setError(null);
            try {
                const names = [...birdNames].reverse();
                const start = page * PAGE_SIZE;
                const pageNames = names.slice(start, start + PAGE_SIZE);

                if (pageNames.length === 0) return;

                const queries = pageNames.map(name => ({
                    name,
                    code: birds[name],
                    lat: mapCenter?.lat,
                    lon: mapCenter?.lng
                }));

                const proxyRes = await fetch('/api/xenoRecordings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(queries)
                });

                if (proxyRes.ok) {
                    const jr = await proxyRes.json();
                    const results = jr.results || {};
                    const out: Record<string, Recording[]> = {};

                    for (const name of pageNames) {
                        const rs = results[name] || [];
                        out[name] = rs.slice(0, 1);
                    }

                    if (!cancelled) {
                        setRecords(prev => ({ ...prev, ...out }));
                    }
                } else {
                    const text = await proxyRes.text().catch(() => '');
                    console.warn('Songbook: xeno proxy error', proxyRes.status, text);
                }
            } catch (e) {
                console.warn('Songbook: xeno proxy fetch failed', e);
                if (!cancelled) setError((e as Error).message || 'Error');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadPage();

        return () => {
            cancelled = true;
        };
    }, [JSON.stringify(birdNames), page, tagsLoaded]);

    return (
        <MainLayout>
            <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                <div style={{ marginBottom: 12 }}>
                    <select
                        value={selectedSpecies}
                        onChange={(e) => {
                            const v = e.target.value;
                            setSelectedSpecies(v);
                            if (v && v !== 'All Species') {
                                // fetch recordings for selected species
                                (async (name: string) => {
                                    setLoading(true);
                                    setError(null);
                                    try {
                                        const query = {
                                            name,
                                            code: birds[name],
                                            lat: mapCenter?.lat,
                                            lon: mapCenter?.lng
                                        };

                                        const proxyRes = await fetch('/api/xenoRecordings', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify([query])
                                        });

                                        if (proxyRes.ok) {
                                            const jr = await proxyRes.json();
                                            const results = jr.results || {};
                                            const rs = results[name] || [];
                                            setRecords(prev => ({ ...prev, [name]: rs.slice(0, 1) }));
                                        } else {
                                            const text = await proxyRes.text().catch(() => '');
                                            console.warn('Songbook: xeno proxy error', proxyRes.status, text);
                                            setError(`Failed to fetch recordings: ${proxyRes.status}`);
                                        }
                                    } catch (err: any) {
                                        console.warn('Songbook: xeno proxy fetch failed', err);
                                        setError(err?.message || 'Error fetching recordings');
                                    } finally {
                                        setLoading(false);
                                    }
                                })(v);
                            }
                        }}
                        style={{ marginBottom: '8px', padding: '8px' }}
                    >
                        <option value="All Species">All Species</option>
                        {speciesOptions.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
                {loading && <p>Loading recordings…</p>}
                {error && <p style={{ color: 'red' }}>{error}</p>}

                {Object.keys(records).length === 0 && !loading && (
                    <p>No birds with vocalisation keywords found. Visit the Search page to load birds.</p>
                )}

                {(() => {
                    const recordNames = Object.keys(records);
                    const names = [...birdNames].reverse();
                    let visibleNames: string[] = [];

                    if (selectedSpecies && selectedSpecies !== 'All Species') {
                        visibleNames = names.filter(n => n === selectedSpecies);
                    } else {
                        visibleNames = names.slice(0, (page + 1) * PAGE_SIZE);
                    }

                    const anyAvailable = visibleNames.some(n => recordNames.includes(n));
                    if (!anyAvailable) {
                        if (loading) return null;
                        return <div style={{ color: '#666' }}>{selectedSpecies && selectedSpecies !== 'All Species' ? 'No recordings match the selected species.' : 'No birds with vocalisation keywords found. Visit the Search page to load birds.'}</div>;
                    }

                    return visibleNames.map(name => (
                    <section key={name} style={{ marginBottom: 24 }}>
                        <h3 style={{ textTransform: 'capitalize', backgroundColor: '#f0f0f0', padding: '8px' }}>{name}</h3>
                        <div>
                            {(records[name] && records[name].length > 0) ? (
                                records[name].map((rec: Recording) => {
                                    const src = recordingAudioUrl(rec) || rec.file || rec['file-name'] || null;
                                    const pageUrl = rec.id ? `https://www.xeno-canto.org/${rec.id}` : rec.url || '#';

                                    return (
                                        <div key={rec.id || JSON.stringify(rec)} style={{ border: '1px solid #eee', padding: 8, marginBottom: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                <div>
                                                    <div><strong>{rec.loc|| ''}</strong></div>
                                                    <div style={{ fontSize: 12, color: '#666' }}>{rec.recorder ? `Recorder: ${rec.recorder}` : ''} {rec.country ? ` — ${rec.country}` : ''} {rec.date ? ` — ${rec.date}` : ''}</div>
                                                </div>
                                                <div>
                                                    <a href={pageUrl} target="_blank" rel="noreferrer">Open on Xeno-canto</a>
                                                </div>
                                            </div>
                                            {src ? (
                                                // @ts-ignore
                                                <audio controls preload="none" src={src} style={{ width: '100%', marginTop: 8 }} />
                                            ) : (
                                                <div style={{ marginTop: 8, color: '#888' }}>No direct audio URL available</div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                loading ? null : <div style={{ color: '#666' }}>No recordings found</div>
                            )}
                        </div>
                    </section>
                    ));
                })()}

                {selectedSpecies === 'All Species' && tagsLoaded && birdNames.length > (page + 1) * PAGE_SIZE && (
                    <div style={{ textAlign: 'center', marginTop: 12 }}>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={loading || (page + 1) * PAGE_SIZE >= birdNames.length}
                            style={{ padding: '8px 16px', cursor: loading ? 'not-allowed' : 'pointer' }}
                        >
                            {loading ? 'Loading…' : 'Load More'}
                        </button>
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

export default SongbookPage;
