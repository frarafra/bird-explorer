"use client";

import React from 'react';
import { recordingAudioUrl } from '../utils/xeno';

type Recording = { q?: string; type?: string };

interface Props {
    records: Record<string, Recording[]>;
    birdNames: string[];
    birds: Record<string, string>;
    selectedSpecies: string;
    loading: boolean;
    page: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
    PAGE_SIZE: number;
}

const Recordings: React.FC<Props> = ({ records, birdNames, birds, selectedSpecies, loading, page, setPage, PAGE_SIZE }) => {
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

    return (
        <>
            {visibleNames.map(name => (
                <section key={name} style={{ marginBottom: 24 }}>
                    <h3 style={{ textTransform: 'capitalize', backgroundColor: '#f0f0f0', padding: '8px' }}>{name}</h3>
                    <div>
                        {(records[name] && records[name].length > 0) ? (
                            records[name].map((rec: Recording) => {
                                const r = rec as Record<string, unknown>;
                                const file = typeof r.file === 'string' ? r.file : (typeof r['file-name'] === 'string' ? r['file-name'] as string : undefined);
                                const src = recordingAudioUrl(rec) || file || null;
                                const pageUrl = (typeof r.id === 'string' || typeof r.id === 'number') ? `https://www.xeno-canto.org/${r.id}` : (typeof r.url === 'string' ? r.url : '#');

                                const loc = typeof r.loc === 'string' ? r.loc : '';
                                const recorder = typeof r.recorder === 'string' ? r.recorder : '';
                                const country = typeof r.country === 'string' ? r.country : '';
                                const date = typeof r.date === 'string' ? r.date : '';

                                return (
                                    <div key={(typeof r.id === 'string' || typeof r.id === 'number') ? String(r.id) : JSON.stringify(r)} style={{ border: '1px solid #eee', padding: 8, marginBottom: 8 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                            <div>
                                                <div><strong>{loc}</strong></div>
                                                <div style={{ fontSize: 12, color: '#666' }}>{recorder ? `Recorder: ${recorder}` : ''} {country ? ` — ${country}` : ''} {date ? ` — ${date}` : ''}</div>
                                            </div>
                                            <div>
                                                <a href={pageUrl} target="_blank" rel="noreferrer">Open on Xeno-canto</a>
                                            </div>
                                        </div>
                                        {src ? (
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
            ))}

            {selectedSpecies === 'All Species' && birdNames.length > (page + 1) * PAGE_SIZE && (
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
        </>
    );
};

export default Recordings;
