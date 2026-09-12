import { labelForToolName } from "./labelForToolName";

/** AG-UI/OpenAI-shaped tool call: the name and (JSON-string) arguments sit
 * under `function`, not flat on the tool call itself. */
interface MinimalToolCall {
  id: string;
  function: {
    name: string;
    arguments?: string;
  };
}

interface MinimalMessage {
  role: string;
  toolCallId?: string;
  toolCalls?: MinimalToolCall[];
}

function parseArgs(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    // Arguments can arrive as a partial JSON string mid-stream; treat that as
    // "not parseable yet" rather than throwing.
    return undefined;
  }
}

/**
 * Given CopilotKit's `agent.messages` (or any array shaped like it) and a
 * label function, returns the label for the most recent tool call that has
 * no matching `role: "tool"` result message yet — i.e. still executing.
 * Returns null when nothing is in flight.
 *
 * Duck-typed on purpose so this package doesn't need `@copilotkit/react-native`
 * as a dependency; the shape matches the AG-UI tool-call messages CopilotKit
 * exposes as of this writing — re-check if that surface changes shape.
 */
export function deriveActiveToolLabel(
  messages: MinimalMessage[],
  labelFn: (name: string, args?: Record<string, unknown>) => string = labelForToolName
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const toolCalls = message.toolCalls ?? [];
    for (const toolCall of toolCalls) {
      const hasResult = messages.some(
        (candidate) => candidate.role === "tool" && candidate.toolCallId === toolCall.id
      );
      if (!hasResult) {
        return labelFn(toolCall.function.name, parseArgs(toolCall.function.arguments));
      }
    }
  }
  return null;
}
