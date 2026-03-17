export class CharacterContextBuilder {
    buildContext(npcPersonality, gameState) {
        let context = [];

        if (npcPersonality.name) {
            context.push(`You are ${npcPersonality.name}.`);
        }

        if (npcPersonality.backstory) {
            context.push(npcPersonality.backstory);
        }

        if (gameState) {
            if (gameState.currentScene) {
                context.push(`Current Scene: ${gameState.currentScene}`);
            }

            if (gameState.recentEvents && gameState.recentEvents.length > 0) {
                context.push('Recent Events:');
                gameState.recentEvents.forEach(event => {
                    context.push(`- ${event}`);
                });
            }
        }

        return context.join('\n');
    }
}
