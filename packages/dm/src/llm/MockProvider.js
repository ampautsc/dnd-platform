export class MockProvider {
    constructor() {
        this.history = [];
        this.responseSequence = [];
        this.singleResponse = null;
    }

    setMockResponse(text) {
        this.responseSequence = [];
        this.singleResponse = text;
    }

    setMockSequence(sequence) {
        this.responseSequence = [...sequence];
        this.singleResponse = null;
    }

    getHistory() {
        return this.history;
    }

    getLastRequest() {
        return this.history.length > 0 ? this.history[this.history.length - 1] : null;
    }

    clearHistory() {
        this.history = [];
    }

    async generateResponse(request) {
        this.history.push(request);
        
        // Use sequence if available, pop until last element
        if (this.responseSequence.length > 0) {
            const currentResponse = this.responseSequence.length > 1 ? 
                this.responseSequence.shift() : 
                this.responseSequence[0];
            return { text: currentResponse, raw: request };
        }
        
        return { text: this.singleResponse ?? 'Mock Response Data', raw: request };
    }
}
