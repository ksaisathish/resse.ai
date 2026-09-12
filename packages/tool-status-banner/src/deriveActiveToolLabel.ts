import { labelForToolName } from "./labelForToolName";

interface MinimalToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
}

interface MinimalMessage {
  role: string;
  toolCallId?: string;
  toolCalls?: MinimalToolCall[];
}

/**
 * Given CopilotKit's `agent.messages` (or any array shaped like it) and a
 * label function, returns the label for the most recent tool call that has
 * no matching `role: "tool"` result message yet — i.e. still executing.
 * Returns null when nothing is in flight.
 *
 * Duck-typed on purpose so this package doesn't need `@copilotkit/react-native`
 * as a dependency; the shapes match `ToolCall`/message objects from
 * apps/mobile/src/chat.tsx as of this writing — re-check if that surface
 * changes shape.
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
        return labelFn(toolCall.name, toolCall.args);
      }
    }
  }
  return null;
}
