"use client";

import React, { useEffect, useState } from 'react';
import Recordings from './Recordings';

type Recording = { q?: string; type?: string };

interface Props {
    birds: Record<string, string>;
    mapCenter?: { lat?: number; lng?: number } | null;
}

const RecordingList: React.FC<Props> = ({ birds, mapCenter }) => {
    const [records, setRecords] = useState<Record<string, Recording[]>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(0);
    const PAGE_SIZE = Number(process.env.NEXT_PUBLIC_SONGBOOK_PAGE_SIZE) || 5;

    const birdNames = Object.keys(birds || {});
    const [selectedSpecies, setSelectedSpecies] = useState<string>('All Species');

    const lastWord = (s: string) => (s.split(' ').filter(Boolean).slice(-1)[0] || '').toLowerCase();
    const speciesOptions = Object.keys(birds || {}).sort((a, b) => lastWord(a).localeCompare(lastWord(b)));

    // No tag fetching — component relies only on `birds` prop

    useEffect(() => {
        if (!birdNames.length) return;
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
    }, [JSON.stringify(birdNames), page, mapCenter]);

    const onSelectSpecies = async (v: string) => {
        setSelectedSpecies(v);
        if (v && v !== 'All Species') {
            setLoading(true);
            setError(null);
            try {
                const query = {
                    name: v,
                    code: birds[v],
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
                    const rs = results[v] || [];
                    setRecords(prev => ({ ...prev, [v]: rs.slice(0, 1) }));
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
        }
    };

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <select
                    value={selectedSpecies}
                    onChange={(e) => onSelectSpecies(e.target.value)}
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

            <Recordings
                records={records}
                birdNames={birdNames}
                birds={birds}
                selectedSpecies={selectedSpecies}
                loading={loading}
                page={page}
                setPage={setPage}
                PAGE_SIZE={PAGE_SIZE}
            />
        </div>
    );
};

export default RecordingList;
