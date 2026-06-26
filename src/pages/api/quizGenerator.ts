import type { NextApiRequest, NextApiResponse } from "next";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";

type Observation = {
  comName?: string;
  locName?: string;
  obsDt?: string;
  howMany?: number;
  speciesCode?: string;
};

const llm = new ChatOpenAI({
  apiKey: process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY!,
  model: process.env.NEXT_PUBLIC_HUGGINGFACE_MODEL!,
  temperature: 0.9,
  configuration: {
    baseURL: "https://router.huggingface.co/v1",
  },
});

const mcpUrl = process.env.NEXT_PUBLIC_MCP_URL!;

let mcpClient: MultiServerMCPClient | null = null;
let ebirdTool: any = null;
let imageTool: any = null;
let recordingTool: any = null;
let initializing: Promise<void> | null = null;

async function initMcp() {
  if (ebirdTool && imageTool && recordingTool) {
    return;
  }

  if (initializing) {
    await initializing;
    return;
  }

  initializing = (async () => {
    mcpClient = new MultiServerMCPClient({
      mcpServers: {
        ebird: {
          transport: "http",
          url: mcpUrl,
        },
      },
    });

    const tools = await mcpClient.getTools();

    ebirdTool = tools.find(
      (t) => t.name === "ebird_species_search"
    );

    imageTool = tools.find(
      (t) => t.name === "ebird_images"
    );

    recordingTool = tools.find(
      (t) => t.name === "xeno_recordings"
    );

    if (!ebirdTool)
      throw new Error("ebird_species_search tool not found");

    if (!imageTool)
      throw new Error("ebird_images tool not found");

    if (!recordingTool)
      throw new Error("xeno_recordings tool not found");
  })();

  try {
    await initializing;
  } finally {
    initializing = null;
  }
}

function shuffle<T>(arr: T[]) {
  return [...arr].sort(() => Math.random() - 0.5);
}

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
    quiz: `Q4: Which bird is shown in this image?

A) ${options[0]}
B) ${options[1]}
C) ${options[2]}
D) ${options[3]}

Answer: ${answer}`,
  };
}

function normalizeMCP(raw: any): Observation[] {
  if (Array.isArray(raw)) return raw;

  if (typeof raw === "string") return JSON.parse(raw);

  const text =
    raw?.content?.[0]?.text ||
    raw?.result?.content?.[0]?.text ||
    raw?.output;

  if (typeof text === "string") return JSON.parse(text);

  throw new Error("Invalid MCP response format");
}

function normalizeRecording(raw: any, birdName: string) {
  const data =
    typeof raw === "string"
      ? JSON.parse(raw)
      : raw;

  const recordings = data.results?.[birdName];

  if (!recordings?.length) {
    throw new Error(`No recordings found for ${birdName}`);
  }

  return recordings;
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
    quiz: `Q5: Which bird is singing in this recording?

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
  let mcpClient: MultiServerMCPClient | undefined;

  try {
    const { lat, lng, dist = 25 } = req.body;

    await initMcp();

    const raw = await ebirdTool!.invoke({
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

    const imageRaw = await imageTool!.invoke({
      birds: imagePayload,
    });

    const images =
      typeof imageRaw === "string"
        ? JSON.parse(imageRaw)
        : imageRaw;

    const singingBird =
      randomBirds[Math.floor(Math.random() * randomBirds.length)];

    const recordingPayload = {
      queries: [
        {
          name: singingBird.comName!,
          code: singingBird.speciesCode!,
          lat: Number(lat),
          lon: Number(lng),
        },
      ],
    };

    const recordingRaw = await recordingTool!.invoke(
      recordingPayload
    );

    const recordings = normalizeRecording(
      recordingRaw,
      singingBird.comName!
    );

    const obsMsg = await llm.invoke([
      {
        role: "user",
        content: buildObservationQuiz(compactData),
      },
    ]);

    const quizText =
      typeof obsMsg === "string"
        ? obsMsg
        : obsMsg.content;

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
  } finally {
    await mcpClient?.close();
  }
}