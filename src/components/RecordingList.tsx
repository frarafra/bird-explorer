"use client";

import React, { useContext, useEffect, useState } from "react";
import Recordings from "./Recordings";
import { BirdContext, Recording } from "../contexts/BirdContext";

interface Props {
    birds: Record<string, string>;
    mapCenter?: { lat?: number; lng?: number } | null;
}

interface RecordingGroup {
    name: string;
    recordings: Recording[];
}

const RecordingList: React.FC<Props> = ({ birds, mapCenter }) => {
    const {
        recordings,
        setRecordings,
        selectedSpecies,
        setSelectedSpecies,
        page,
        setPage
    } = useContext(BirdContext);

    const PAGE_SIZE =
        Number(process.env.NEXT_PUBLIC_SONGBOOK_PAGE_SIZE) || 5;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const birdNames = Object.keys(birds || {});

    useEffect(() => {
        if (!birdNames.length) return;

        let cancelled = false;

        const loadPage = async () => {
            const names = [...birdNames].reverse();
            const start = page * PAGE_SIZE;

            const pageNames = names.slice(start, start + PAGE_SIZE);

            const namesToFetch = pageNames.filter(
                (name) => !(name in recordings)
            );

            if (namesToFetch.length === 0) return;

            setLoading(true);
            setError(null);

            try {
                const queries = namesToFetch.map((name) => ({
                    name,
                    code: birds[name],
                    lat: mapCenter?.lat,
                    lon: mapCenter?.lng
                }));

                const proxyRes = await fetch("/api/xenoRecordings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(queries)
                });

                if (!proxyRes.ok) {
                    throw new Error(`HTTP ${proxyRes.status}`);
                }

                const jr = await proxyRes.json();
                const results = jr.results || {};

                const out: Record<string, Recording[]> = {};

                for (const name of namesToFetch) {
                    out[name] = (results[name] || []).slice(0, 1);
                }

                if (!cancelled) {
                    setRecordings((prev) => ({
                        ...prev,
                        ...out
                    }));
                }
            } catch (err) {
                if (!cancelled) {
                    setError((err as Error).message || "Error fetching recordings");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadPage();

        return () => {
            cancelled = true;
        };
    }, [page, birds, mapCenter]);

    const onSelectSpecies = async (species: string) => {
        setSelectedSpecies(species);

        if (species === "All Species") return;
        if (species in recordings) return;

        setLoading(true);
        setError(null);

        try {
            const query = {
                name: species,
                code: birds[species],
                lat: mapCenter?.lat,
                lon: mapCenter?.lng
            };

            const proxyRes = await fetch("/api/xenoRecordings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify([query])
            });

            if (!proxyRes.ok) {
                throw new Error(`HTTP ${proxyRes.status}`);
            }

            const jr = await proxyRes.json();
            const results = jr.results || {};
            const rs = results[species] || [];

            setRecordings((prev) => ({
                ...prev,
                [species]: rs.slice(0, 1)
            }));
        } catch (err) {
            setError((err as Error).message || "Error fetching recordings");
        } finally {
            setLoading(false);
        }
    };

    const names = [...birdNames].reverse();

    const visibleNames =
        selectedSpecies !== "All Species"
            ? names.filter((name) => name === selectedSpecies)
            : names.slice(0, (page + 1) * PAGE_SIZE);

    const visibleRecordings: RecordingGroup[] = visibleNames.map((name) => ({
        name,
        recordings: recordings[name] || []
    }));

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <select
                    value={selectedSpecies}
                    onChange={(e) => onSelectSpecies(e.target.value)}
                    style={{ marginBottom: 8, padding: 8 }}
                >
                    <option value="All Species">All Species</option>
                    {Object.keys(birds).map((species) => (
                        <option key={species} value={species}>
                            {species}
                        </option>
                    ))}
                </select>
            </div>

            {error && <p style={{ color: "red" }}>{error}</p>}

            {birdNames.length > 0 && (
                <Recordings
                    recordings={visibleRecordings}
                    loading={loading}
                />
            )}

            {selectedSpecies === "All Species" &&
                birdNames.length > (page + 1) * PAGE_SIZE && (
                    <div style={{ textAlign: "center", marginTop: 12 }}>
                        <button
                            onClick={() => setPage((p) => p + 1)}
                            disabled={loading}
                        >
                            {loading ? "Loading…" : "Load More"}
                        </button>
                    </div>
                )}
        </div>
    );
};

export default RecordingList;
