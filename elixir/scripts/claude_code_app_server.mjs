#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const state = {
  queryLoader: null,
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
    console.error(`Claude bridge received malformed JSON: ${error?.message || error}`);
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
      dynamicTools: Array.isArray(envelope?.params?.dynamicTools) ? envelope.params.dynamicTools : [],
      id: randomUUID(),
      sandbox: envelope?.params?.sandbox
    };

    writeResponse(envelope.id, { thread: { id: state.thread.id } });
    return;
  }

  if (method === "turn/start" && Object.hasOwn(envelope, "id")) {
    if (!state.thread) {
      writeError(envelope.id, "Claude bridge received `turn/start` before `thread/start`.", -32000);
      return;
    }

    const turnId = randomUUID();

    state.turn = {
      abortController: new AbortController(),
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
  try {
    const prompt = extractPrompt(params.input);
    const permissionMode = resolvePermissionMode(params.approvalPolicy ?? state.thread?.approvalPolicy);
    const options = compactObject({
      abortController: turnState.abortController,
      allowDangerouslySkipPermissions:
        permissionMode === "bypassPermissions" ? true : undefined,
      model: normalizeEnvString(process.env.SYMPHONY_CLAUDE_MODEL),
      mcpServers: buildMcpServers(state.thread?.dynamicTools),
      permissionMode
    });
    const query = await loadQuery();

    let usage;

    for await (const message of query({ options, prompt })) {
      usage = extractUsage(message) ?? usage;

      for (const delta of extractTextDeltas(message)) {
        writeMessage({
          method: "codex/event/agent_message_delta",
          params: { delta }
        });
      }
    }

    writeMessage(compactObject({ method: "turn/completed", usage }));
  } catch (error) {
    writeMessage({
      method: "turn/failed",
      params: {
        message: formatError(error)
      }
    });
  } finally {
    if (state.turn?.id === turnState.id) {
      state.turn = null;
    }
  }
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
    `Claude bridge requires \`codex.approval_policy: never\` or ` +
      `\`SYMPHONY_CLAUDE_PERMISSION_MODE\`; received ${serializedPolicy}.`
  );
}

function buildMcpServers(dynamicTools) {
  if (!Array.isArray(dynamicTools) || !dynamicTools.some((tool) => tool?.name === "linear_graphql")) {
    return undefined;
  }

  return {
    linear_graphql: {
      args: [linearMcpServerPath],
      command: process.execPath,
      env: compactObject({
        LINEAR_API_KEY: normalizeEnvString(process.env.LINEAR_API_KEY),
        SYMPHONY_LINEAR_ENDPOINT:
          normalizeEnvString(process.env.SYMPHONY_LINEAR_ENDPOINT) ||
          normalizeEnvString(process.env.LINEAR_ENDPOINT)
      }),
      type: "stdio"
    }
  };
}

async function loadQuery() {
  if (!state.queryLoader) {
    const specifier = resolveModuleSpecifier(
      normalizeEnvString(process.env.SYMPHONY_CLAUDE_SDK_QUERY_MODULE) ||
        normalizeEnvString(process.env.SYMPHONY_CLAUDE_CODE_QUERY_MODULE) ||
        "@anthropic-ai/claude-agent-sdk"
    );

    state.queryLoader = import(specifier).then((module) => {
      if (typeof module?.query !== "function") {
        throw new Error(`Claude SDK module ${specifier} does not export \`query\`.`);
      }

      return module.query;
    });
  }

  return state.queryLoader;
}

function resolveModuleSpecifier(specifier) {
  if (path.isAbsolute(specifier) || specifier.startsWith(".")) {
    return pathToFileURL(path.resolve(specifier)).href;
  }

  return specifier;
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

function extractTextDeltas(message) {
  const candidates = [
    message?.delta,
    message?.text,
    message?.content,
    message?.message?.content,
    message?.result
  ];

  return candidates.flatMap(collectText).filter((value) => value.trim() !== "");
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

function extractUsage(message) {
  if (message && typeof message === "object" && message.usage && typeof message.usage === "object") {
    return message.usage;
  }

  return null;
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined)
  );
}

function normalizeEnvString(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function formatError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}
