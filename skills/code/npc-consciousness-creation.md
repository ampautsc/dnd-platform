# Skill: NPC Character Consciousness Creation

## Category
code

## Tags
#npc #consciousness #llm #claude #character #roleplay #system-prompt

## Description
Creating a new NPC character that can hold conversation through an LLM API. This covers the full pipeline from character design through system prompt construction to multi-turn conversation validation. The key insight: the system prompt IS the consciousness — it must be rich enough for the model to inhabit, not just a description.

## Prerequisites
- LLM provider configured (Claude API or equivalent via provider abstraction)
- Character template data structure defined

## Steps
1. **Design the character identity**
   - Name, age, role, location
   - Core personality traits (2-3 defining characteristics)
   - Emotional state / current situation
   - What they know and don't know
   - How they relate to players (trust level, wariness, eagerness)

2. **Write the system prompt**
   - First person framing: "You ARE this person"
   - Include specific sensory details (what they're doing when addressed)
   - Define conversation boundaries (what they'll share freely vs. withhold)
   - Set response length expectations (1-2 sentences for casual, longer for emotional moments)
   - Explicit anti-chatbot instruction: "You are NOT an AI assistant"

3. **Create the CharacterContextPackage**
   - Template key (snake_case identifier)
   - System prompt (the consciousness)
   - Personality tags for dynamic behavior
   - Knowledge boundaries (what triggers "I don't know" vs. evasion vs. honest answer)

4. **Register in NPC template data**
   - Add to NPC personalities collection
   - Set default model (Haiku-tier for standard NPCs)
   - Configure max_tokens (150 for casual, 300 for narrative moments)
   - Set temperature (0.8 for natural variation)

5. **Run a 5-turn conversation test**
   - Turn 1: Casual greeting (tests basic in-character response)
   - Turn 2: World-building question (tests lore generation)
   - Turn 3: Personal/emotional question (tests depth and vulnerability)
   - Turn 4: Offer of help (tests trust dynamics and information gating)
   - Turn 5: Promise/commitment (tests character's emotional intelligence)

6. **Evaluate quality — not just plumbing**
   - Is the character in-character from the first token?
   - Do they generate consistent world details across turns?
   - Do they show emotional range appropriate to the topic?
   - Do they push back when a stranger asks personal questions?
   - Would a human player feel like they're talking to a person?

7. **Record the evaluation honestly**
   - If it's not good enough, say so. Don't rubber-stamp.

## Common Pitfalls
- Testing plumbing ("did a string come back") instead of quality ("does this sound like a real person")
- Using a model too small for the task (< 7B parameters generally can't hold complex personas)
- System prompts that describe the character instead of embodying them
- Not testing multi-turn — single-turn tests miss context window and consistency issues
- Declaring success after one good response (test at least 5 turns)

## Related Skills
- `skills/code/service-health-verification.md`
- `skills/problem-solving/llm-model-evaluation.md`
