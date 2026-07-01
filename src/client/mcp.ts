import { MultiServerMCPClient } from "@langchain/mcp-adapters";

const mcpUrl = process.env.NEXT_PUBLIC_MCP_URL!;

let mcpClient: MultiServerMCPClient | null = null;
let ebirdTool: any = null;
let imageTool: any = null;
let recordingTool: any = null;
let mcp: Promise<void> | null = null;

export const initMcp = async () => {
  if (ebirdTool && imageTool && recordingTool) {
    return {
      ebirdTool,
      imageTool,
      recordingTool,
    };
  }

  if (mcp) {
    await mcp;
    return {
      ebirdTool,
      imageTool,
      recordingTool,
    };
  }

  mcp = (async () => {
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
    await mcp;
  } catch (err) {
    mcpClient = null;
    ebirdTool = null;
    imageTool = null;
    recordingTool = null;
    throw err;
  } finally {
    mcp = null;
  }

  return {
    ebirdTool,
    imageTool,
    recordingTool,
  };
}
