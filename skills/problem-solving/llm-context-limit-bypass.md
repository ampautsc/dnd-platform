# LLM Context Limit Bypass via Generator Factory

## Category
problem-solving

## Tags
#llm #generation #token-limits #factory #automation #scripting

## Description
When you need an LLM to generate massive amounts of structured content (like hundreds of JSON files) that significantly exceeds a single LLM output token limit, do not attempt to force the LLM to output files directly in the chat. The output will inevitably truncate. Instead, build a Generator Factory.

## Prerequisites
- Node.js environment
- Seed data source
- Clear understanding of the target output schema

## Steps
1. **Create a Seed Database**: Group and define the inputs in a structured format (e.g., `npc-seed-database.json`). Make it massive so the executing agent has raw material.
2. **Build a Prompt Template**: Write a text file with strict instructions and `{placeholder}` variables mapping to the seed data fields.
3. **Develop the Generation Script**: Write a Node script that iterates over the seed database, injects the fields into the prompt template, and dispatches API calls to the LLM.
4. **Build Auto-Savers**: Ensure the script writes the LLM's response directly to individual files (`fs.writeFileSync`) and updates any necessary index/registry files programmatically.
5. **Run Locally**: The user (or CI) runs the script locally, bypassing the conversational UI token constraints and allowing infinite horizontal scaling.

## Examples
Used successfully to queue 128 D&D Pop-Culture NPCs. By handing off a `generate-pop-culture-npcs.js` script and a 600-line JSON seed file, we avoided single-turn context limits and ensured perfect schema conformity across hundreds of files.

## Common Pitfalls
- **Direct Output Assumptions:** Believing the LLM can generate 30 perfectly formatted files in one go. It usually stops after 3 or 4.
- **Rate Limits:** Real API integrations in the loop script need sleep/delay timers (`await new Promise(r => setTimeout(r, 1000))`) to avoid bursting API quotas.
- **Malformed LLM Output:** Make sure the prompt explicitly enforces a pure JSON return so `JSON.parse()` doesn't throw errors when the script processes the LLM's response.

## Related Skills
- `skills/problem-solving/task-decomposition.md`