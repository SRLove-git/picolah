import type { BaseMessage, MessageContent } from '@langchain/core/messages';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import type { z } from 'zod';
import { config } from '../config.ts';

export type AgentMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: MessageContent };

export interface AgentModelOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  disableThinking?: boolean;
}

function createModel(options: AgentModelOptions = {}) {
  if (!config.llm.apiKey) throw new Error('LLM_API_KEY is not configured');
  const model = options.model || config.llm.model;

  return new ChatOpenAI({
    apiKey: config.llm.apiKey,
    model,
    // V4.1 Flash defaults to thinking mode. These short JSON/answer tasks need
    // their bounded output budget for the answer, not hidden reasoning tokens.
    ...(options.disableThinking || model === 'deepseek-flash' ? { modelKwargs: { thinking: { type: 'disabled' } } } : {}),
    temperature: options.temperature ?? 0,
    maxTokens: options.maxTokens,
    timeout: options.timeoutMs ?? 60_000,
    maxRetries: 1,
    configuration: {
      baseURL: config.llm.baseUrl,
    },
  });
}

export function toLangChainMessages(messages: AgentMessage[]): BaseMessage[] {
  return messages.map((message) =>
    message.role === 'system'
      ? new SystemMessage(message.content)
      : new HumanMessage({ content: message.content }),
  );
}

export async function invokeStructuredAgent<T extends Record<string, unknown>>(options: {
  messages: AgentMessage[];
  schema: z.ZodType<T>;
  name: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  disableThinking?: boolean;
}): Promise<T> {
  const model = createModel({
    model: options.model,
    temperature: 0,
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs,
    disableThinking: options.disableThinking,
  });
  const chain = model.withStructuredOutput(options.schema, {
    name: options.name,
    method: 'jsonMode',
  });

  return (await chain.invoke(toLangChainMessages(options.messages), {
    signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    tags: ['picolah-agent', 'structured-understanding'],
    metadata: { agent: options.name },
  })) as T;
}

export function messageContentToText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .map((block) => {
      if ('text' in block && typeof block.text === 'string') return block.text;
      return '';
    })
    .join('');
}

export async function* streamAgentAnswer(options: {
  messages: AgentMessage[];
  model?: string;
  temperature: number;
  maxTokens: number;
  timeoutMs?: number;
  disableThinking?: boolean;
}): AsyncGenerator<string> {
  const model = createModel(options);
  // The HTTP client's request timeout ends at the response headers. Keep the
  // stream cancellable while waiting for the first or next piece of text.
  const controller = new AbortController();
  const idle = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
  idle.unref();
  try {
    const stream = await model.stream(toLangChainMessages(options.messages), {
      signal: controller.signal,
      tags: ['picolah-agent', 'answer-writer'],
      metadata: { agent: 'PicolahAnswerWriter' },
    });

    let emitted = false;
    for await (const chunk of stream) {
      const text = messageContentToText(chunk.content);
      if (!text) continue;
      idle.refresh();
      emitted = true;
      yield text;
    }
    controller.signal.throwIfAborted();
    if (!emitted) throw new Error('LLM returned an empty response');
  } finally {
    clearTimeout(idle);
    controller.abort();
  }
}
