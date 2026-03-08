#!/usr/bin/env node

const defaultLinearEndpoint = "https://api.linear.app/graphql";
const protocolVersion = "2024-11-05";
const toolSpec = {
  description: "Execute a raw GraphQL query or mutation against Linear using Symphony's configured auth.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      query: {
        description: "GraphQL query or mutation document to execute against Linear.",
        type: "string"
      },
      variables: {
        additionalProperties: true,
        description: "Optional GraphQL variables object.",
        type: ["object", "null"]
      }
    },
    required: ["query"],
    type: "object"
  },
  name: "linear_graphql"
};

let buffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  void parseMessages();
});

async function parseMessages() {
  while (true) {
    const separatorIndex = buffer.indexOf("\r\n\r\n");

    if (separatorIndex === -1) {
      return;
    }

    const headersText = buffer.subarray(0, separatorIndex).toString("utf8");
    const contentLength = parseContentLength(headersText);

    if (contentLength === null) {
      writeError(null, -32700, "Missing Content-Length header.");
      buffer = Buffer.alloc(0);
      return;
    }

    const messageStart = separatorIndex + 4;

    if (buffer.length < messageStart + contentLength) {
      return;
    }

    const messageBuffer = buffer.subarray(messageStart, messageStart + contentLength);
    buffer = buffer.subarray(messageStart + contentLength);

    let message;

    try {
      message = JSON.parse(messageBuffer.toString("utf8"));
    } catch (error) {
      writeError(null, -32700, `Invalid JSON payload: ${error?.message || error}`);
      continue;
    }

    await handleMessage(message);
  }
}

async function handleMessage(message) {
  const method = message?.method;

  if (method === "initialize") {
    writeResult(message.id, {
      capabilities: {
        tools: {}
      },
      protocolVersion: protocolVersion,
      serverInfo: {
        name: "symphony-linear-graphql",
        version: "0.1.0"
      }
    });
    return;
  }

  if (method === "notifications/initialized" || method === "initialized") {
    return;
  }

  if (method === "ping") {
    writeResult(message.id, {});
    return;
  }

  if (method === "tools/list") {
    writeResult(message.id, { tools: [toolSpec] });
    return;
  }

  if (method === "tools/call") {
    const toolName = message?.params?.name;

    if (toolName !== toolSpec.name) {
      writeResult(message.id, toolErrorResult(`Unsupported tool: ${String(toolName)}`));
      return;
    }

    const argumentsPayload = message?.params?.arguments ?? {};
    const result = await executeLinearGraphql(argumentsPayload);
    writeResult(message.id, result);
    return;
  }

  if (message && Object.hasOwn(message, "id")) {
    writeError(message.id, -32601, `Unsupported method: ${String(method)}`);
  }
}

async function executeLinearGraphql(argumentsPayload) {
  const query = normalizeQuery(argumentsPayload?.query);

  if (!query) {
    return toolErrorResult("`linear_graphql` requires a non-empty `query` string.");
  }

  const variables = normalizeVariables(argumentsPayload?.variables);

  if (variables === null) {
    return toolErrorResult("`linear_graphql.variables` must be a JSON object when provided.");
  }

  const apiKey = normalizeEnvString(process.env.LINEAR_API_KEY);

  if (!apiKey) {
    return toolErrorResult(
      "Symphony is missing Linear auth. Set `LINEAR_API_KEY` before launching the Claude bridge."
    );
  }

  const endpoint =
    normalizeEnvString(process.env.SYMPHONY_LINEAR_ENDPOINT) || defaultLinearEndpoint;

  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify({ query, variables }),
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    const body = await response.json();

    if (!response.ok) {
      return toolErrorResult(`Linear GraphQL request failed with HTTP ${response.status}.`, {
        body
      });
    }

    return {
      content: [
        {
          text: JSON.stringify(body, null, 2),
          type: "text"
        }
      ],
      isError: hasGraphqlErrors(body)
    };
  } catch (error) {
    return toolErrorResult(
      `Linear GraphQL request failed before receiving a successful response: ${formatError(error)}`
    );
  }
}

function hasGraphqlErrors(body) {
  return Array.isArray(body?.errors) && body.errors.length > 0;
}

function toolErrorResult(message, data = undefined) {
  return {
    content: [
      {
        text: JSON.stringify(
          data === undefined
            ? { error: { message } }
            : { error: { data, message } },
          null,
          2
        ),
        type: "text"
      }
    ],
    isError: true
  };
}

function normalizeQuery(query) {
  if (typeof query !== "string") {
    return null;
  }

  const trimmed = query.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeVariables(variables) {
  if (variables === undefined || variables === null) {
    return {};
  }

  if (variables && typeof variables === "object" && !Array.isArray(variables)) {
    return variables;
  }

  return null;
}

function parseContentLength(headersText) {
  for (const line of headersText.split("\r\n")) {
    const [name, value] = line.split(":");

    if (name?.toLowerCase() === "content-length") {
      const parsed = Number.parseInt(value?.trim() || "", 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  return null;
}

function writeResult(id, result) {
  writeMessage({
    id,
    jsonrpc: "2.0",
    result
  });
}

function writeError(id, code, message) {
  writeMessage({
    error: {
      code,
      message
    },
    id,
    jsonrpc: "2.0"
  });
}

function writeMessage(payload) {
  const body = JSON.stringify(payload);
  const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
  process.stdout.write(header);
  process.stdout.write(body);
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
