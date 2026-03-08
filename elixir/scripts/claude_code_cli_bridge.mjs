#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const defaultAllowedTools = ["Bash", "Read", "Edit", "Write", "Glob", "Grep"];
const linearMcpToolName = "mcp__linear_graphql__linear_graphql";

const state = {
  thread: null,
  turn: null
};

const bridgeScriptDir = path.dirname(fileURLToPath(import.meta.url));
const linearMcpServerPath = path.join(bridgeScriptDir, "linear_graphql_mcp_server.mjs");

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", (line) => {
  void handleEnvelope(line);
});

process.on("SIGINT", () => {
  stopActiveTurn("SIGINT");
  process.exit(130);
});

process.on("SIGTERM", () => {
  stopActiveTurn("SIGTERM");
  process.exit(143);
});

function writeMessage(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function writeResponse(id, result) {
  writeMessage({ id, result });
}

function writeError(id, message, code = -32601, data = undefined) {
  const error = { code, message };

  if (data !== undefined) {
    error.data = data;
  }

  writeMessage({ id, error });
}

async function handleEnvelope(line) {
  const trimmed = line.trim();

  if (trimmed === "") {
    return;
  }

  let envelope;

  try {
    envelope = JSON.parse(trimmed);
  } catch (error) {
    console.error(`Claude CLI bridge received malformed JSON: ${error?.message || error}`);
    return;
  }

  const method = envelope?.method;

  if (method === "initialize" && Object.hasOwn(envelope, "id")) {
    writeResponse(envelope.id, {});
    return;
  }

  if (method === "initialized") {
    return;
  }

  if (method === "thread/start" && Object.hasOwn(envelope, "id")) {
    state.thread = {
      approvalPolicy: envelope?.params?.approvalPolicy,
      claudeSessionId: null,
      cwd: normalizePath(envelope?.params?.cwd),
      dynamicTools: Array.isArray(envelope?.params?.dynamicTools) ? envelope.params.dynamicTools : [],
      id: randomUUID(),
      sandbox: envelope?.params?.sandbox
    };

    writeResponse(envelope.id, { thread: { id: state.thread.id } });
    return;
  }

  if (method === "turn/start" && Object.hasOwn(envelope, "id")) {
    if (!state.thread) {
      writeError(envelope.id, "Claude CLI bridge received `turn/start` before `thread/start`.", -32000);
      return;
    }

    if (state.turn) {
      writeError(envelope.id, "Claude CLI bridge does not support overlapping turns.", -32000);
      return;
    }

    const turnId = randomUUID();

    state.turn = {
      child: null,
      id: turnId
    };

    writeResponse(envelope.id, { turn: { id: turnId } });
    void runTurn(envelope.params ?? {}, state.turn);
    return;
  }

  if (Object.hasOwn(envelope, "id")) {
    writeError(envelope.id, `Unsupported method: ${String(method)}`);
  }
}

async function runTurn(params, turnState) {
  const runtime = {
    emittedTextDelta: false,
    finalResult: null,
    finalUsage: null,
    lastUsageSignature: null,
    parsedError: null,
    sessionId: state.thread?.claudeSessionId || null,
    stderrLines: [],
    stdoutLines: [],
    terminalEventSent: false,
    tempDir: null
  };

  try {
    const prompt = extractPrompt(params.input);
    const workspace = normalizePath(params.cwd) || state.thread?.cwd || process.cwd();
    const permissionMode = resolvePermissionMode(params.approvalPolicy ?? state.thread?.approvalPolicy);
    const mcpConfigPath = await maybeWriteMcpConfig(state.thread?.dynamicTools, runtime);
    const allowedTools = resolveAllowedTools(state.thread?.dynamicTools);
    const claudePath = normalizeEnvString(process.env.SYMPHONY_CLAUDE_CLI_BIN) || "claude";
    const args = buildClaudeArgs({
      allowedTools,
      mcpConfigPath,
      model: normalizeEnvString(process.env.SYMPHONY_CLAUDE_MODEL),
      permissionMode,
      prompt,
      resumeSessionId: state.thread?.claudeSessionId,
      systemPrompt: buildSystemPrompt(params, state.thread?.dynamicTools)
    });

    await spawnClaudeTurn(claudePath, args, workspace, runtime, turnState);

    if (!runtime.terminalEventSent) {
      throw new Error(
        runtime.parsedError ||
          summarizeProcessFailure(runtime.stderrLines, runtime.stdoutLines) ||
          "Claude CLI exited without a terminal result."
      );
    }
  } catch (error) {
    emitTurnFailed(formatError(error), runtime);
  } finally {
    await cleanupRuntime(runtime);

    if (state.turn?.id === turnState.id) {
      state.turn = null;
    }
  }
}

function buildClaudeArgs({
  allowedTools,
  mcpConfigPath,
  model,
  permissionMode,
  prompt,
  resumeSessionId,
  systemPrompt
}) {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-mode",
    permissionMode
  ];

  if (allowedTools.length > 0) {
    args.push("--allowedTools", allowedTools.join(","));
  }

  if (model) {
    args.push("--model", model);
  }

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  }

  if (systemPrompt) {
    args.push("--append-system-prompt", systemPrompt);
  }

  if (mcpConfigPath) {
    args.push("--mcp-config", mcpConfigPath);
  }

  return args;
}

async function spawnClaudeTurn(claudePath, args, workspace, runtime, turnState) {
  const child = spawn(claudePath, args, {
    cwd: workspace,
    env: buildChildEnv(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  turnState.child = child;

  const stdoutRl = createInterface({
    input: child.stdout,
    crlfDelay: Infinity
  });

  const stderrRl = createInterface({
    input: child.stderr,
    crlfDelay: Infinity
  });

  stdoutRl.on("line", (line) => {
    handleClaudeStdoutLine(line, runtime);
  });

  stderrRl.on("line", (line) => {
    const trimmed = line.trim();

    if (trimmed !== "") {
      runtime.stderrLines.push(trimmed);
    }
  });

  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      stdoutRl.close();
      stderrRl.close();

      if (!runtime.terminalEventSent) {
        if (runtime.finalResult?.type === "error") {
          runtime.parsedError = runtime.finalResult.message;
        } else if (code !== 0 || signal) {
          runtime.parsedError =
            summarizeProcessFailure(runtime.stderrLines, runtime.stdoutLines) ||
            `Claude CLI exited with ${signal ? `signal ${signal}` : `status ${code}`}.`;
        }
      }

      resolve();
    });
  });
}

function handleClaudeStdoutLine(line, runtime) {
  const trimmed = line.trim();

  if (trimmed === "") {
    return;
  }

  runtime.stdoutLines.push(trimmed);

  let payload;

  try {
    payload = JSON.parse(trimmed);
  } catch (_error) {
    return;
  }

  rememberClaudeSessionId(runtime, payload);

  const usage = usageFromPayload(payload);

  if (usage) {
    maybeEmitTokenUsage(usage, runtime);
  }

  if (payload?.type === "stream_event") {
    handleStreamEvent(payload.event, runtime);
    return;
  }

  if (payload?.type === "assistant") {
    maybeEmitFinalAssistantText(payload?.message, runtime);
    return;
  }

  if (payload?.type === "result") {
    handleResultPayload(payload, runtime);
  }
}

function handleStreamEvent(event, runtime) {
  if (!event || typeof event !== "object") {
    return;
  }

  if (
    event.type === "content_block_delta" &&
    event?.delta?.type === "text_delta" &&
    typeof event?.delta?.text === "string"
  ) {
    emitTextDelta(event.delta.text, runtime);
  }
}

function handleResultPayload(payload, runtime) {
  const usage = normalizeUsage(payload?.usage);

  if (usage) {
    runtime.finalUsage = usage;
    maybeEmitTokenUsage(usage, runtime);
  }

  if (payload?.subtype === "success" && payload?.is_error !== true) {
    runtime.finalResult = {
      result: payload?.result,
      type: "success"
    };

    if (!runtime.emittedTextDelta && typeof payload?.result === "string") {
      emitTextDelta(payload.result, runtime);
    }

    state.thread = {
      ...state.thread,
      claudeSessionId: runtime.sessionId || state.thread?.claudeSessionId || null
    };

    runtime.terminalEventSent = true;
    writeMessage(
      compactObject({
        method: "turn/completed",
        params: compactObject({
          turn: {
            id: state.turn?.id,
            status: "completed"
          },
          usage
        }),
        usage
      })
    );

    return;
  }

  runtime.finalResult = {
    message: extractErrorMessage(payload),
    type: "error"
  };
}

function maybeEmitTokenUsage(usage, runtime) {
  const signature = JSON.stringify(usage);

  if (signature === runtime.lastUsageSignature) {
    return;
  }

  runtime.lastUsageSignature = signature;

  writeMessage({
    method: "thread/tokenUsage/updated",
    params: {
      tokenUsage: {
        total: usage
      }
    }
  });
}

function emitTextDelta(delta, runtime) {
  if (typeof delta !== "string" || delta.trim() === "") {
    return;
  }

  runtime.emittedTextDelta = true;

  writeMessage({
    method: "codex/event/agent_message_delta",
    params: { delta }
  });
}

function maybeEmitFinalAssistantText(message, runtime) {
  if (runtime.emittedTextDelta) {
    return;
  }

  const text = collectText(message?.content).join("");

  emitTextDelta(text, runtime);
}

function emitTurnFailed(message, runtime) {
  if (runtime.terminalEventSent) {
    return;
  }

  runtime.terminalEventSent = true;

  writeMessage({
    method: "turn/failed",
    params: {
      error: { message },
      message
    }
  });
}

function rememberClaudeSessionId(runtime, payload) {
  const sessionId =
    normalizeEnvString(payload?.session_id) ||
    normalizeEnvString(payload?.event?.session_id) ||
    normalizeEnvString(payload?.message?.session_id);

  if (sessionId) {
    runtime.sessionId = sessionId;
  }
}

function usageFromPayload(payload) {
  return (
    normalizeUsage(payload?.usage) ||
    normalizeUsage(payload?.event?.usage) ||
    normalizeUsage(payload?.event?.message?.usage) ||
    normalizeUsage(payload?.message?.usage)
  );
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return null;
  }

  const normalized = { ...usage };
  const input = integerLike(
    usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? usage.promptTokens
  );
  const output = integerLike(
    usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens
  );
  const total =
    integerLike(usage.total_tokens ?? usage.total ?? usage.totalTokens) ??
    (Number.isInteger(input) && Number.isInteger(output) ? input + output : null);

  if (Number.isInteger(input)) {
    normalized.input_tokens = input;
  }

  if (Number.isInteger(output)) {
    normalized.output_tokens = output;
  }

  if (Number.isInteger(total)) {
    normalized.total_tokens = total;
  }

  return normalized;
}

async function maybeWriteMcpConfig(dynamicTools, runtime) {
  if (!hasLinearGraphqlTool(dynamicTools)) {
    return null;
  }

  const configDir = await mkdtemp(path.join(os.tmpdir(), "symphony-claude-mcp-"));
  const configPath = path.join(configDir, "mcp-config.json");

  runtime.tempDir = configDir;

  await writeFile(
    configPath,
    JSON.stringify({
      mcpServers: {
        linear_graphql: {
          command: process.execPath,
          args: [linearMcpServerPath],
          env: compactObject({
            LINEAR_API_KEY: normalizeEnvString(process.env.LINEAR_API_KEY),
            SYMPHONY_LINEAR_ENDPOINT:
              normalizeEnvString(process.env.SYMPHONY_LINEAR_ENDPOINT) ||
              normalizeEnvString(process.env.LINEAR_ENDPOINT)
          })
        }
      }
    })
  );

  return configPath;
}

function resolveAllowedTools(dynamicTools) {
  const override = normalizeEnvString(process.env.SYMPHONY_CLAUDE_ALLOWED_TOOLS);
  const baseTools =
    override?.split(",").map((tool) => tool.trim()).filter(Boolean) ?? [...defaultAllowedTools];

  if (hasLinearGraphqlTool(dynamicTools)) {
    baseTools.push(linearMcpToolName);
  }

  return [...new Set(baseTools)];
}

function resolvePermissionMode(approvalPolicy) {
  const override = normalizeEnvString(process.env.SYMPHONY_CLAUDE_PERMISSION_MODE);

  if (override) {
    return override;
  }

  if (approvalPolicy === "never") {
    return "bypassPermissions";
  }

  const serializedPolicy =
    approvalPolicy === undefined ? "undefined" : JSON.stringify(approvalPolicy);

  throw new Error(
    `Claude CLI bridge requires \`codex.approval_policy: never\` or ` +
      `\`SYMPHONY_CLAUDE_PERMISSION_MODE\`; received ${serializedPolicy}.`
  );
}

function buildSystemPrompt(params, dynamicTools) {
  const lines = [
    "You are running inside Symphony's unattended Claude Code CLI bridge.",
    "Continue working from the current workspace instead of asking for interactive operator input."
  ];

  if (typeof params?.title === "string" && params.title.trim() !== "") {
    lines.push(`Current task title: ${params.title.trim()}`);
  }

  if (hasLinearGraphqlTool(dynamicTools)) {
    lines.push("A Linear GraphQL MCP server is available as `linear_graphql`.");
  }

  return lines.join("\n");
}

function buildChildEnv() {
  const env = { ...process.env };

  // Avoid Claude's nested-session guard when Symphony itself is launched from an agent session.
  delete env.CLAUDECODE;

  return env;
}

function extractPrompt(input) {
  if (!Array.isArray(input)) {
    return "";
  }

  return input
    .map((item) => (item?.type === "text" && typeof item?.text === "string" ? item.text : null))
    .filter(Boolean)
    .join("\n\n");
}

function collectText(value) {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectText);
  }

  if (value && typeof value === "object") {
    return [
      ...collectText(value.text),
      ...collectText(value.delta),
      ...collectText(value.content)
    ];
  }

  return [];
}

function hasLinearGraphqlTool(dynamicTools) {
  return Array.isArray(dynamicTools) && dynamicTools.some((tool) => tool?.name === "linear_graphql");
}

function integerLike(value) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function normalizeEnvString(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function normalizePath(value) {
  const normalized = normalizeEnvString(value);
  return normalized ? path.resolve(normalized) : undefined;
}

function extractErrorMessage(payload) {
  return (
    normalizeEnvString(payload?.result) ||
    normalizeEnvString(payload?.error?.message) ||
    normalizeEnvString(payload?.message) ||
    "Claude CLI returned an error result."
  );
}

function summarizeProcessFailure(stderrLines, stdoutLines) {
  const stderr = stderrLines.find(Boolean);

  if (stderr) {
    return stderr;
  }

  const stdoutError = stdoutLines.find((line) => /\b(error|failed|fatal|exception)\b/i.test(line));

  return stdoutError;
}

function formatError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

async function cleanupRuntime(runtime) {
  if (runtime.tempDir) {
    await rm(runtime.tempDir, { force: true, recursive: true });
  }
}

function stopActiveTurn(signal) {
  const child = state.turn?.child;

  if (child && !child.killed) {
    child.kill(signal);
  }
}
