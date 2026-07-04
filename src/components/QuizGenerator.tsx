"use client";

import React, { useContext, useState } from "react";
import { BirdContext } from "../contexts/BirdContext";

const QuizGenerator: React.FC = () => {
  const { mapCenter } = useContext(BirdContext);

  const [loading, setLoading] = useState(false);

  const [quiz, setQuiz] = useState("");

  const [imageQuiz, setImageQuiz] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [audioQuiz, setAudioQuiz] = useState("");
  const [audioUrl, setAudioUrl] = useState("");

  async function generateQuiz() {
    setLoading(true);

    setQuiz("");
    setImageQuiz("");
    setImageUrl("");
    setAudioQuiz("");
    setAudioUrl("");

    try {
      const res = await fetch("/api/quizGenerator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: mapCenter.lat,
          lng: mapCenter.lng,
          dist: 25,
        }),
      });

      const data = await res.json();

      setQuiz(data.quiz || "");
      setImageQuiz(data.imageQuiz || "");
      setImageUrl(data.imageUrl || "");

      setAudioQuiz(data.audioQuiz || "");
      setAudioUrl(data.audioUrl || "");
    } catch (err) {
      setQuiz("Unable to generate quiz.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h3 className="mb-4 text-xl font-semibold">🐦 Bird Quiz</h3>

      <button
        type="button"
        onClick={generateQuiz}
        disabled={loading}
        className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:disabled:bg-emerald-700"
      >
        {loading ? "Generating..." : "Generate Quiz"}
      </button>

      {quiz && (
        <pre style={{ whiteSpace: "pre-wrap", marginTop: 20 }}>
          {quiz}
        </pre>
      )}

      {imageQuiz && (
        <div style={{ marginTop: 30 }}>
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Bird quiz"
              style={{
                width: "100%",
                maxWidth: 500,
                borderRadius: 8,
                marginBottom: 15,
              }}
            />
          )}

          <pre style={{ whiteSpace: "pre-wrap" }}>
            {imageQuiz}
          </pre>
        </div>
      )}

      {audioQuiz && audioUrl && (
        <div style={{ marginTop: 30 }}>
          <audio
            controls
            preload="none"
            src={audioUrl}
            style={{
              width: "100%",
              marginBottom: 12,
            }}
          />

          <pre style={{ whiteSpace: "pre-wrap" }}>
            {audioQuiz}
          </pre>
        </div>
      )}
    </div>
  );
};

export default QuizGenerator;