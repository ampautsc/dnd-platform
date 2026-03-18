// Placeholder for real provider implementation
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function llmDebugLog(entry) {
    try {
        const date = new Date().toISOString().slice(0, 10);
        const logDir = resolve(__dirname, '../../../../logs');
        mkdirSync(logDir, { recursive: true });
        const logPath = resolve(logDir, `llm-${date}.log`);
        const separator = '='.repeat(80);
        const lines = [
            `\n${separator}`,
            `TIMESTAMP: ${new Date().toISOString()}`,
            `npcId: ${entry.npcId ?? '(none)'}  npcName: ${entry.npcName ?? '(none)'}  model: ${entry.model}  maxTokens: ${entry.maxTokens}`,
            `${separator}`,
            '--- SYSTEM PROMPT ---',
            entry.systemPrompt || '(none)',
            '--- END SYSTEM PROMPT ---',
        ];
        if (Array.isArray(entry.messages)) {
            entry.messages.forEach(m => {
                lines.push(`--- ${m.role.toUpperCase()} ---`);
                lines.push(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
                lines.push(`--- END ${m.role.toUpperCase()} ---`);
            });
        } else if (entry.userPrompt) {
            lines.push('--- USER PROMPT ---');
            lines.push(entry.userPrompt);
            lines.push('--- END USER PROMPT ---');
        }
        appendFileSync(logPath, lines.join('\n') + '\n', 'utf8');
    } catch {
        // never crash the server over logging
    }
}

export class LLMProvider {
    constructor(config = {}) {
        this.anthropicKey = config.anthropicKey || process.env.ANTHROPIC_API_KEY;
        this.openaiKey = config.openaiKey || process.env.OPENAI_API_KEY;

        if (this.anthropicKey) {
            this.anthropicClient = new Anthropic({ apiKey: this.anthropicKey });
        }
        
        if (this.openaiKey) {
            this.openaiClient = new OpenAI({ apiKey: this.openaiKey });
        }
    }

    async generateResponse(request) {
        // Default model to Claude Haiku if not specified
        const model = request.model || 'claude-haiku-4-5-20251001';
        // Support both `prompt` (from CharacterResponseService) and `userPrompt` (direct)
        const userPrompt = request.userPrompt || request.prompt || '';
        const normalizedRequest = { ...request, model, userPrompt };

        if (process.env.LLM_DEBUG === '1' || process.env.LLM_DEBUG === 'true') {
            llmDebugLog(normalizedRequest);
        }

        if (model.startsWith('claude')) {
            return this.callAnthropic(normalizedRequest);
        } else if (model.startsWith('gpt')) {
            return this.callOpenAI(normalizedRequest);
        }

        throw new Error(`Unsupported model identifier: ${model}`);
    }

    async callAnthropic(request) {
        if (!this.anthropicClient) {
            throw new Error('ANTHROPIC_API_KEY is not set.');
        }

        // Multi-turn: use request.messages if provided, else build single user message
        const messages = Array.isArray(request.messages) && request.messages.length > 0
            ? request.messages
            : [{ role: 'user', content: request.userPrompt }];

        // System prompt with optional cache control for long prompts
        const system = request.systemPrompt || '';

        const response = await this.anthropicClient.messages.create({
            model: request.model,
            max_tokens: request.maxTokens || 4096,
            system,
            messages,
        });
        const text = response.content[0].text;
        return {
            text,
            content: text,
            model: response.model,
            usage: response.usage,
        };
    }

    async callOpenAI(request) {
        if (!this.openaiClient) {
            throw new Error('OPENAI_API_KEY is not set.');
        }

        // Multi-turn: use request.messages if provided, else build single user message
        const userMessages = Array.isArray(request.messages) && request.messages.length > 0
            ? request.messages
            : [{ role: 'user', content: request.userPrompt }];

        const response = await this.openaiClient.chat.completions.create({
            model: request.model,
            max_tokens: request.maxTokens || 4096,
            messages: [
                ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
                ...userMessages,
            ],
        });
        const text = response.choices[0].message.content;
        return {
            text,
            content: text,
            model: response.model,
            usage: response.usage,
        };
    }
}
