"use client";

import React from "react";
import { recordingAudioUrl } from "../utils/xeno";

type Recording = { q?: string; type?: string };

interface RecordingGroup {
    name: string;
    recordings: Recording[];
}

interface Props {
    recordings: RecordingGroup[];
    loading?: boolean;
}

const Recordings: React.FC<Props> = ({ recordings, loading }) => {
    return (
        <>
            {recordings.map(({ name, recordings }) => (
                <section key={name} style={{ marginBottom: 24 }}>
                    <h3
                        className="bg-slate-100 p-2 capitalize font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    >
                        {name}
                    </h3>

                    {loading && recordings.length === 0 ? (
                        <div style={{ color: "#666" }}>
                            Loading recordings…
                        </div>
                    ) : recordings.length > 0 ? (
                        recordings.map((rec) => {
                            const r = rec as Record<string, unknown>;

                            const file =
                                typeof r.file === "string"
                                    ? r.file
                                    : typeof r["file-name"] === "string"
                                    ? (r["file-name"] as string)
                                    : undefined;

                            const src =
                                recordingAudioUrl(rec) || file || null;
                            console.log('xyz', src);
                            const pageUrl =
                                typeof r.id === "string" ||
                                typeof r.id === "number"
                                    ? `https://www.xeno-canto.org/${r.id}`
                                    : typeof r.url === "string"
                                    ? r.url
                                    : "#";

                            const loc = typeof r.loc === "string" ? r.loc : "";
                            const recorder =
                                typeof r.recorder === "string" ? r.recorder : "";
                            const country =
                                typeof r.country === "string" ? r.country : "";
                            const date =
                                typeof r.date === "string" ? r.date : "";

                            return (
                                <div
                                    key={String(r.id ?? JSON.stringify(r))}
                                    style={{
                                        border: "1px solid #eee",
                                        padding: 8,
                                        marginBottom: 8
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            gap: 12
                                        }}
                                    >
                                        <div>
                                            <div>
                                                <span>{loc}</span>
                                            </div>

                                            <div
                                                style={{ fontSize: 12, color: "#666" }}
                                            >
                                                {recorder && `Recorder: ${recorder}`}
                                                {country && ` — ${country}`}
                                                {date && ` — ${date}`}
                                            </div>
                                        </div>

                                        <div>
                                            <a
                                                href={pageUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-sm"
                                            >
                                                Open on Xeno-canto
                                            </a>
                                        </div>
                                    </div>

                                    {src ? (
                                        <audio
                                            controls
                                            preload="none"
                                            src={src}
                                            style={{
                                                width: "100%",
                                                marginTop: 8
                                            }}
                                        />
                                    ) : (
                                        <div
                                            style={{
                                                marginTop: 8,
                                                color: "#888"
                                            }}
                                        >
                                            No direct audio URL available
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        !loading && (
                            <div style={{ color: "#666" }}>
                                No recordings found
                            </div>
                        )
                    )}
                </section>
            ))}
        </>
    );
};

export default Recordings;