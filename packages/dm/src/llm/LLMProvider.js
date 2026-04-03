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
        ];
        if (Array.isArray(entry.systemBlocks) && entry.systemBlocks.length > 0) {
            entry.systemBlocks.forEach((b, i) => {
                lines.push(`--- SYSTEM BLOCK ${i + 1} ---`);
                lines.push(b.text || '(empty)');
                lines.push(`--- END SYSTEM BLOCK ${i + 1} ---`);
            });
        } else {
            lines.push('--- SYSTEM PROMPT ---');
            lines.push(entry.systemPrompt || '(none)');
            lines.push('--- END SYSTEM PROMPT ---');
        }
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
        // Default model to Claude Sonnet if not specified (override via ANTHROPIC_MODEL env var)
        const model = request.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
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

        // System prompt with prompt caching enabled.
        // Supports two modes:
        //   1. systemBlocks: array of { text } objects → multiple content blocks,
        //      each with its own cache_control breakpoint. Use this to separate
        //      shared static content (world knowledge) from per-NPC content.
        //   2. systemPrompt: single string → one content block (legacy path).
        // systemBlocks takes precedence when provided.
        let system;
        if (Array.isArray(request.systemBlocks)) {
            system = request.systemBlocks
                .filter(b => b.text)
                .map(b => ({ type: 'text', text: b.text, cache_control: { type: 'ephemeral' } }));
        } else {
            const systemText = request.systemPrompt || '';
            system = systemText
                ? [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }]
                : [];
        }

        const response = await this.anthropicClient.messages.create({
            model: request.model,
            max_tokens: request.maxTokens || 4096,
            system,
            messages,
        });
        const text = response.content[0].text;

        const result = {
            text,
            content: text,
            model: response.model,
            usage: response.usage,
        };

        // Log the raw Anthropic SDK response — every field, nothing stripped.
        // The SDK uses a class with non-enumerable properties, so we force them
        // into a plain object so JSON.stringify catches everything.
        const rawForLog = {
            id: response.id,
            type: response.type,
            role: response.role,
            model: response.model,
            stop_reason: response.stop_reason,
            stop_sequence: response.stop_sequence,
            content: response.content,
            usage: response.usage,
        };
        this._logResponse(request, rawForLog);

        return result;
    }

    /**
     * Log the raw Anthropic SDK response — nothing stripped, nothing reinterpreted.
     * @param {object} request - The original request
     * @param {object} rawResponse - The raw response object
     */
    _logResponse(request, rawResponse) {
        try {
            const date = new Date().toISOString().slice(0, 10);
            const logDir = resolve(__dirname, '../../../../logs');
            mkdirSync(logDir, { recursive: true });
            const logPath = resolve(logDir, `llm-${date}.log`);
            const separator = '-'.repeat(80);
            const lines = [
                `\n${separator}`,
                `RESPONSE — ${new Date().toISOString()}`,
                `npcId: ${request.npcId ?? '(none)'}  npcName: ${request.npcName ?? '(none)'}`,
                `${separator}`,
                '--- RAW ANTHROPIC RESPONSE ---',
                JSON.stringify(rawResponse, null, 2),
                '--- END RAW ANTHROPIC RESPONSE ---',
            ];
            appendFileSync(logPath, lines.join('\n') + '\n', 'utf8');
        } catch {
            // never crash the server over logging
        }
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
