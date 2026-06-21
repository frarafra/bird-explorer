import type { NextApiRequest, NextApiResponse } from "next";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";

type Observation = {
  comName?: string;
  locName?: string;
  obsDt?: string;
  howMany?: number;
};

const llm = new ChatOpenAI({
  apiKey: process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY!,

  model: process.env.NEXT_PUBLIC_HUGGINGFACE_MODEL || "gpt-4o-mini",

  temperature: 0.9,

  configuration: {
    baseURL: "https://router.huggingface.co/v1",
  },
});

function buildPrompt(data: string) {
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

function normalizeMCP(raw: any): Observation[] {
  if (Array.isArray(raw)) return raw;

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("MCP returned invalid JSON string");
    }
  }

  const text =
    raw?.content?.[0]?.text ||
    raw?.result?.content?.[0]?.text ||
    raw?.output;

  if (typeof text === "string") {
    return JSON.parse(text);
  }

  throw new Error("Unexpected MCP response format");
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

    if (!ebirdTool) throw new Error("MCP tool not found");

    // 2. MCP CALL
    const raw = await ebirdTool.invoke({
      lat: Number(lat),
      lng: Number(lng),
      dist: Number(dist),
    });

    const birds = normalizeMCP(raw);

    const shuffled = birds.sort(() => Math.random() - 0.5);

    const compactData = shuffled
      .slice(0, 12)
      .map(
        (o) =>
          `${o.comName ?? "unknown"} | ${o.locName ?? "unknown"} | ${
            o.obsDt ?? "unknown"
          } | ${o.howMany ?? "?"}`
      )
      .join("\n");

    const quizMessage = await llm.invoke([
      {
        role: "user",
        content: buildPrompt(compactData),
      },
    ]);

    const quizText =
      typeof quizMessage === "string"
        ? quizMessage
        : quizMessage.content;

    return res.status(200).json({
      quiz: quizText,
      count: birds.length,
      raw: birds,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err.message,
    });
  } finally {
    await mcpClient?.close();
  }
}