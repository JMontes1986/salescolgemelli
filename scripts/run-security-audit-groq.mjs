#!/usr/bin/env node

import {
  defaultSecurityAuditPrompt,
  securityAuditorGroqRequestDefaults,
  securityAuditorModel,
  securityAuditorSystemPrompt,
} from "../agents/security-auditor.groq.mjs";

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  console.error("GROQ_API_KEY no está configurada.");
  console.error('Ejemplo: export GROQ_API_KEY="tu-api-key"');
  process.exit(1);
}

const userPrompt = process.argv.slice(2).join(" ").trim() || defaultSecurityAuditPrompt;

const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: securityAuditorModel,
    messages: [
      {
        role: "system",
        content: securityAuditorSystemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    stream: true,
    stop: null,
    ...securityAuditorGroqRequestDefaults,
  }),
});

if (!response.ok || !response.body) {
  const errorBody = await response.text();
  throw new Error(`Groq request failed (${response.status}): ${errorBody}`);
}

const decoder = new TextDecoder();
let buffer = "";

for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || !trimmedLine.startsWith("data:")) {
      continue;
    }

    const payload = trimmedLine.slice(5).trim();

    if (payload === "[DONE]") {
      process.stdout.write("\n");
      process.exit(0);
    }

    try {
      const parsed = JSON.parse(payload);
      process.stdout.write(parsed.choices?.[0]?.delta?.content ?? "");
    } catch {
      // Ignore partial or non-JSON stream frames.
    }
  }
}

process.stdout.write("\n");
