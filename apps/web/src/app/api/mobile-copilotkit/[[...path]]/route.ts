import { randomUUID } from "node:crypto";
import {
  CopilotRuntime,
  createCopilotHonoHandler,
} from "@copilotkit/runtime/v2";
import { makeAgent } from "agent-core";
import { RECEPTION_PROMPT } from "agent-core/reception-prompt";

const runtime = new CopilotRuntime({
  agents: () => ({
    default: makeAgent(randomUUID(), {
      workplace: false,
      prompt: RECEPTION_PROMPT,
    }),
  }),
});

const app = createCopilotHonoHandler({
  runtime,
  basePath: "/api/mobile-copilotkit",
});

export const GET = app.fetch;
export const POST = app.fetch;
export const OPTIONS = app.fetch;
