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
}

function createModel(options: AgentModelOptions = {}) {
  if (!config.llm.apiKey) throw new Error('LLM_API_KEY is not configured');

  return new ChatOpenAI({
    apiKey: config.llm.apiKey,
    model: options.model || config.llm.model,
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
}): Promise<T> {
  const model = createModel({
    model: options.model,
    temperature: 0,
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs,
  });
  const chain = model.withStructuredOutput(options.schema, {
    name: options.name,
    method: 'jsonMode',
  });

  return (await chain.invoke(toLangChainMessages(options.messages), {
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
}): AsyncGenerator<string> {
  const model = createModel(options);
  const stream = await model.stream(toLangChainMessages(options.messages), {
    tags: ['picolah-agent', 'answer-writer'],
    metadata: { agent: 'PicolahAnswerWriter' },
  });

  let emitted = false;
  for await (const chunk of stream) {
    const text = messageContentToText(chunk.content);
    if (!text) continue;
    emitted = true;
    yield text;
  }
  if (!emitted) throw new Error('LLM returned an empty response');
}
