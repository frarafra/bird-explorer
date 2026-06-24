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
  model: process.env.NEXT_PUBLIC_HUGGINGFACE_MODEL || "gpt-4o-mini",
  temperature: 0.8,
  configuration: {
    baseURL: "https://router.huggingface.co/v1",
  },
});

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
- Vary birds, locations, and counts
- EACH question MUST be a full question sentence
- EXACTLY 3 multiple-choice questions
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

Q2: <full question>
A)
B)
C)
D)
Answer: X

Q3: <full question>
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  let mcpClient: MultiServerMCPClient | undefined;

  try {
    const { lat, lng, dist = 25 } = req.body;

    const mcpUrl = process.env.NEXT_PUBLIC_MCP_URL;
    if (!mcpUrl) throw new Error("Missing MCP URL");

    mcpClient = new MultiServerMCPClient({
      mcpServers: {
        ebird: {
          transport: "http",
          url: mcpUrl,
        },
      },
    });

    const tools = await mcpClient.getTools();

    const ebirdTool = tools.find(
      (t) => t.name === "ebird_species_search"
    );

    const raw = await ebirdTool!.invoke({
      lat: Number(lat),
      lng: Number(lng),
      dist: Number(dist),
    });

    const birds = normalizeMCP(raw);

    const validBirds = birds.filter(
      (b) => b?.comName && b?.speciesCode
    );

    const compactData = validBirds
      .slice(0, 10)
      .map(
        (o) =>
          `${o.comName} | ${o.locName} | ${o.obsDt} | ${o.howMany}`
      )
      .join("\n");

    const imageTool = tools.find(
      (t) => t.name === "ebird_images"
    );

    const randomBirds = shuffle(validBirds).slice(0, 12);

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

    return res.status(200).json({
      quiz: quizText,
      imageQuiz: imageQuiz.quiz,
      imageUrl: imageQuiz.imageUrl,
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