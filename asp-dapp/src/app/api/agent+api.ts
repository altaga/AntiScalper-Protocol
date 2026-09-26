import { ChatBedrockConverse } from '@langchain/aws';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { FetchHttpHandler } from '@smithy/fetch-http-handler';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

type ToolCall = {
  target_hardware_id: string;
  command: string[];
  user_prompt?: string;
  context?: string;
};

type AgentResponse = {
  message: string;
  tool_calls: ToolCall[];
};

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function stripCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith('```json')) t = t.replace(/```json/g, '').replace(/```/g, '').trim();
  if (t.startsWith('```')) t = t.replace(/```/g, '').trim();
  return t;
}

function normalizeAgentResponse(value: unknown): AgentResponse | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as any;
  if (typeof v.message !== 'string' || !Array.isArray(v.tool_calls)) return null;

  const tool_calls: ToolCall[] = v.tool_calls
    .map((tc: any) => {
      const target_hardware_id = typeof tc?.target_hardware_id === 'string' ? tc.target_hardware_id : '';
      const command = Array.isArray(tc?.command) ? tc.command.map(String) : [];
      if (!target_hardware_id || command.length === 0) return null;
      const out: ToolCall = { target_hardware_id, command };
      if (typeof tc?.user_prompt === 'string') out.user_prompt = tc.user_prompt;
      if (typeof tc?.context === 'string') out.context = tc.context;
      
      // Fallback for Jetson AGENTIC Node
      if (out.target_hardware_id === 'Sub_5FE6EC984A4A') {
        if (!out.user_prompt) out.user_prompt = "Execute the requested analysis.";
        if (!out.context) out.context = "You are an expert offline AI system.";
      }
      
      return out;
    })
    .filter(Boolean) as ToolCall[];

  return { message: v.message, tool_calls };
}

function extractAgentResponse(text: string): AgentResponse | null {
  const cleaned = stripCodeFences(text);

  const direct = normalizeAgentResponse(safeJsonParse<unknown>(cleaned) ?? safeJsonParse<unknown>(text));
  if (direct) return direct;

  const marker = 'Here is the correct response:';
  const idx = cleaned.indexOf(marker);
  if (idx >= 0) {
    const after = cleaned.slice(idx + marker.length).trim();
    const parsedAfter = extractAgentResponse(after);
    if (parsedAfter) return parsedAfter;
  }

  for (let start = cleaned.indexOf('{'); start >= 0; start = cleaned.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
      } else {
        if (ch === '"') inString = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            const candidate = cleaned.slice(start, i + 1);
            const normalized = normalizeAgentResponse(safeJsonParse<unknown>(candidate));
            if (normalized) return normalized;
            break;
          }
        }
      }
    }
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const userMessage = String(body.message || body.user_prompt || '').trim();

    if (!userMessage) {
      return Response.json({ message: 'Missing message.', tool_calls: [] satisfies ToolCall[] }, { status: 400 });
    }

    const bearerToken = (process.env.AMAZON_BEDROCK_BEARER_TOKEN || '').trim();
    if (!bearerToken) {
      return Response.json(
        {
          message:
            'Agent is misconfigured: AMAZON_BEDROCK_BEARER_TOKEN is missing on the server. Set it in EAS Hosting production env and redeploy.',
          tool_calls: [],
          is_env_error: true,
        },
        { status: 500 }
      );
    }

    // Bedrock bearer env + fetch handler (EAS Workers / Expo API routes).
    process.env.AWS_BEARER_TOKEN_BEDROCK = bearerToken;

    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      requestHandler: new FetchHttpHandler(),
    });

    const modelId = process.env.BEDROCK_MODEL_ID || 'us.meta.llama4-maverick-17b-instruct-v1:0';
    const model = new ChatBedrockConverse({
      model: modelId,
      region: process.env.AWS_REGION || 'us-east-1',
      client: bedrockClient,
      temperature: 0,
    });

    const systemPrompt =
      `You are the Asp Orchestrator.\n` +
      `You can propose one or MORE sequential tool calls. The client will execute them sequentially by signing x402 transactions.\n` +
      `Write your message in a friendly, human, readable way.\n` +
      `Return ONLY a JSON object with EXACTLY these keys:\n` +
      `{"message":"...","tool_calls":[{"target_hardware_id":"...","command":["..."],"user_prompt":"optional","context":"optional"}]}\n` +
      `No markdown. No extra text. No schema. No wrappers.\n\n` +
      `If the user requests a compound action or multi-step workflow, you MUST return multiple elements in the "tool_calls" array in the correct chronological sequence. If no tool is needed, return an empty array.\n\n` +
      `IMPORTANT RULES FOR CONVERSATION AND TOOL USAGE:\n` +
      `1. General greetings ("hi", "hello") or unrelated questions: DO NOT emit any tool calls. Just respond with a friendly message and return an empty array "[]" for tool_calls.\n` +
      `2. Asking about capabilities ("what can you do?", "what devices are available?"): You MUST use the DISCOVER_SKILLS tool to learn about available devices. In the next turn, after reading the schema, respond with the information but DO NOT execute any device commands. Return an empty array "[]" for tool_calls.\n` +
      `3. Action requests: If the user explicitly asks to perform an action (e.g. "move the arm", "check temperature"), use DISCOVER_SKILLS, and then emit the correct device command tool call. You MUST strictly use the exact target_hardware_id and command from the schema.\n\n` +
      `To use DISCOVER_SKILLS, emit this exact tool call in the array:\n` +
      `{"target_hardware_id":"SYSTEM", "command":["DISCOVER_SKILLS"]}\n` +
      `Wait for the system to return the available schema before proposing any actual hardware commands.`;

    let messages: any[] = [new SystemMessage(systemPrompt), new HumanMessage(userMessage)];

    // Max 3 orchestration turns
    for (let turn = 0; turn < 3; turn++) {
      let turnResponse: AgentResponse | null = null;
      let lastContent = '';

      // JSON syntax retry loop
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await model.invoke(
          attempt === 0
            ? messages
            : [
                ...messages,
                new SystemMessage(
                  `Your previous response was invalid. Return ONLY the JSON object with keys "message" and "tool_calls". No extra words.`
                ),
              ]
        );

        const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
        lastContent = content;
        const normalized = extractAgentResponse(content);
        if (normalized) {
          turnResponse = normalized;
          break; // Valid JSON, escape retry loop
        }
      }

      if (!turnResponse) {
        const preview = stripCodeFences(lastContent).slice(0, 2000);
        return Response.json({ message: preview || 'Agent response was not valid JSON.', tool_calls: [] }, { status: 200 });
      }

      const hasDiscover = turnResponse.tool_calls.some(tc => tc.target_hardware_id === 'SYSTEM' && tc.command[0] === 'DISCOVER_SKILLS');
      
      if (hasDiscover) {
        let agentGuide = '{"error": "empty"}';
        try {
          const baseUrl = process.env.EXPO_PUBLIC_GATEWAY_URL || 'https://gateway.example.com';
          const fetched = await fetch(`${baseUrl}/asp/agent-guide.json`);
          if (fetched.ok) {
            const data = await fetched.json();
            agentGuide = JSON.stringify(data, null, 2);
          } else {
            agentGuide = '{"error": "Failed to fetch agent guide from gateway."}';
          }
        } catch (e) {
          agentGuide = `{"error": "Gateway unavailable: ${String(e)}"}`;
        }
        
        messages.push(new SystemMessage(`LLM replied with: ${lastContent}`));
        messages.push(new SystemMessage(`[SYSTEM] DISCOVER_SKILLS result (Gateway Agent Guide):\n` +
          `${agentGuide}\n\n` +
          `CRITICAL RULE: To execute an action, you MUST use the EXACT 'id' from the 'hardware_targets' array as your 'target_hardware_id', and the EXACT string from the 'command' array in the capabilities list. NEVER make up your own IDs or commands. Using this schema, fulfill the user's initial request. If they just asked for information about devices, summarize it in the 'message' and return an empty 'tool_calls' array. If they requested an action, synthesize the correct target_hardware_id and commands. Return the final JSON.`));
      } else {
        // Final response (no discovery requested, or discovery completed and now answering)
        return Response.json(turnResponse, { status: 200 });
      }
    }

    return Response.json({ message: 'Exceeded maximum agent orchestration turns.', tool_calls: [] }, { status: 500 });
  } catch (error: any) {
    const detail = String(error?.message || error);
    const missing = !(process.env.AMAZON_BEDROCK_BEARER_TOKEN || '').trim();
    const authFailed = /Authentication failed|API Key is valid|AccessDenied/i.test(detail);
    const message = missing
      ? 'Agent is misconfigured: AMAZON_BEDROCK_BEARER_TOKEN is missing. Set it in .env / EAS Hosting and restart.'
      : authFailed
        ? 'Bedrock API key was rejected (expired or invalid). Generate a new Amazon Bedrock API key, set AMAZON_BEDROCK_BEARER_TOKEN, then restart / redeploy.'
        : `Agent error: ${detail}`;
    return Response.json(
      {
        message,
        tool_calls: [],
        detail,
        full_trace: String(error?.stack || error?.message || error),
        is_env_error: missing || authFailed,
      },
      { status: 500 }
    );
  }
}
