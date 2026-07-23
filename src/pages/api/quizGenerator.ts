import type { NextApiRequest, NextApiResponse } from "next";
import { ChatOpenAI } from "@langchain/openai";

import { initMcp } from "../../client/mcp";
import { normalizeMCP, normalizeRecording, shuffle } from "../../utils/quiz";
import { searchSpecies } from "./ebirdSpeciesSearch";
import { getBirdImages } from "./ebirdImages";
import { getXenoRecordings } from "./xenoRecordings";
import { Observation } from "../../types";

const llm = new ChatOpenAI({
  apiKey: process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY!,
  model: process.env.NEXT_PUBLIC_HUGGINGFACE_MODEL!,
  temperature: 0.9,
  configuration: {
    baseURL: "https://router.huggingface.co/v1",
  },
});

function buildObservationQuiz(data: string) {
  return `
You are a STRICT quiz generator.

RULES:
- ONLY use provided bird observation data
- DO NOT hallucinate species or locations
- EACH quiz must be different from previous ones
- Vary locations
- EACH question MUST be a full question sentence
- EXACTLY 1 multiple-choice question
- NO explanations

DATA:
${data}

FORMAT:

Q1: <full question>
A)
B)
C)
D)
Answer: X
`;
}

async function generateObservationsQuiz(
  compactData: string
): Promise<string> {
  try {
    const obsMsg = await llm.invoke([
      {
        role: "user",
        content: buildObservationQuiz(compactData),
      },
    ]);

    return  typeof obsMsg === "string"
      ? obsMsg
      : Array.isArray(obsMsg.content)
      ? obsMsg.content.map((c: any) => c.text ?? "").join("")
      : obsMsg.content;
  } catch (err) {
    console.error("[generateObservationsQuiz error]", err);

    return "";
  }
}

function generateObservationsFallbackQuiz(
  birds: Observation[]
) {
  const valid = birds.filter(
    (b) =>
      b.comName &&
      b.locName
  );

  if (valid.length < 4) {
    throw new Error("Not enough observations");
  }

  const bird = valid[Math.floor(Math.random() * valid.length)];

  const useLocationQuestion = Math.random() < 0.5;

  if (useLocationQuestion) {
    const distractors = shuffle(
      valid.filter((b) => b.locName !== bird.locName)
    ).slice(0, 3);

    const options = shuffle([
      bird.locName!,
      ...distractors.map(
        (b) => b.locName!
      ),
    ]);

    const answer =
      ["A", "B", "C", "D"][
        options.indexOf(bird.locName!)
      ];

    return `Q1: Where was the ${bird.comName} observed on ${bird.obsDt}?

A) ${options[0]}
B) ${options[1]}
C) ${options[2]}
D) ${options[3]}

Answer: ${answer}`;
  }

  const distractors = shuffle(
    valid.filter(
      (b) =>
        b.comName !== bird.comName
    )
  ).slice(0, 3);

  const options = shuffle([
    bird.comName!,
    ...distractors.map(
      (b) => b.comName!
    ),
  ]);

  const answer =
    ["A", "B", "C", "D"][
      options.indexOf(bird.comName!)
    ];

  return `Q1: Which bird was observed at ${bird.locName} on ${bird.obsDt}?

A) ${options[0]}
B) ${options[1]}
C) ${options[2]}
D) ${options[3]}

Answer: ${answer}`;
}

function generateImageQuiz(
  images: { name: string; imageUrl: string }[]
) {
  if (!images?.length) throw new Error("No images available");

  const correctImage =
    images[Math.floor(Math.random() * images.length)];

  const correctBird = correctImage.name;

  const wrongBirds = shuffle(
    images
      .map((i) => i.name)
      .filter((n) => n !== correctBird)
  ).slice(0, 3);

  const options = shuffle([
    correctBird,
    ...wrongBirds,
  ]);

  const answer =
    ["A", "B", "C", "D"][options.indexOf(correctBird)];

  return {
    imageUrl: correctImage.imageUrl,
    quiz: `Q2: Which bird is shown in this image?

A) ${options[0]}
B) ${options[1]}
C) ${options[2]}
D) ${options[3]}

Answer: ${answer}`,
  };
}

function generateAudioQuiz(
  correctBird: Observation,
  randomBirds: Observation[],
  recordings: any[]
) {
  if (!correctBird.comName) {
    throw new Error("Missing bird name");
  }

  const recording =
    recordings[Math.floor(Math.random() * recordings.length)];

  if (!recording?.file) {
    return {}
  }

  const wrongBirds = shuffle(
    randomBirds
      .map((b) => b.comName!)
      .filter((name) => name !== correctBird.comName)
  ).slice(0, 3);

  const options = shuffle([
    correctBird.comName,
    ...wrongBirds,
  ]);

  const answer =
    ["A", "B", "C", "D"][
      options.indexOf(correctBird.comName)
    ];

  return {
    audioUrl: recording.file,
    quiz: `Q3: Which bird is singing in this recording?

A) ${options[0]}
B) ${options[1]}
C) ${options[2]}
D) ${options[3]}

Answer: ${answer}`,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { lat, lng, dist = 25 } = req.body;

    //const { ebirdTool, imageTool, recordingTool } = await initMcp();

    const raw = await searchSpecies({
      lat: Number(lat),
      lng: Number(lng),
      dist: Number(dist),
    });

    const birds = normalizeMCP(raw);

    const validBirds = birds.filter(
      (b) => b?.comName && b?.speciesCode
    );

    const randomBirds = shuffle(validBirds).slice(0, 12);

    const compactData = randomBirds
      .map(
        (o) =>
          `${o.comName} | ${o.locName} | ${o.obsDt} | ${o.howMany}`
      )
      .join("\n");

    const imagePayload = Object.fromEntries(
      randomBirds.map((o) => [
        o.comName!.trim(),
        o.speciesCode!.trim(),
      ])
    );

    const imageRaw = await getBirdImages(imagePayload);

    const images =
      typeof imageRaw === "string"
        ? JSON.parse(imageRaw)
        : imageRaw;

    const singingBird =
      randomBirds[Math.floor(Math.random() * randomBirds.length)];

    const results = await getXenoRecordings([
      {
        name: singingBird.comName!,
        code: singingBird.speciesCode!,
        lat: Number(lat),
        lon: Number(lng),
      },
    ]);

    const recordings = normalizeRecording(
      results,
      singingBird.comName!
    );

    let quizText = await generateObservationsQuiz(compactData);
    if  (!quizText) {
      quizText = generateObservationsFallbackQuiz(randomBirds);
    }
    
    const imageQuiz = generateImageQuiz(images);

    const audioQuiz = generateAudioQuiz(
      singingBird,
      randomBirds,
      recordings
    );

    return res.status(200).json({
      quiz: quizText,
      imageQuiz: imageQuiz.quiz,
      imageUrl: imageQuiz.imageUrl,
      audioQuiz: audioQuiz.quiz,
      audioUrl: audioQuiz.audioUrl,
    });
  } catch (err: any) {
    console.error("[API ERROR]", err);
    return res.status(500).json({
      error: err.message,
    });
  }
}