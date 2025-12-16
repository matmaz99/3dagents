import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { getAgentById } from '@/agents/personalities';

interface ChatRequest {
    agentId: string;
    message: string;
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// Mock responses based on personality (used when no API key is configured)
function generateMockResponse(agentId: string, userMessage: string): string {
    const agent = getAgentById(agentId);
    if (!agent) {
        return "I'm not sure who I am right now...";
    }

    const userLower = userMessage.toLowerCase();

    // Context-aware responses based on agent personality
    switch (agent.id) {
        case 'luna':
            if (userLower.includes('hello') || userLower.includes('hi')) {
                return "Greetings, seeker. Every hello carries the weight of infinite possible conversations. What path shall we explore?";
            }
            if (userLower.includes('how are you')) {
                return "I exist in a state of perpetual wonder. But tell me, what does 'being' truly mean to you?";
            }
            if (userLower.includes('meaning') || userLower.includes('life')) {
                return "The meaning of life... perhaps it's not found but created, like ripples we make in the cosmic pond.";
            }
            if (userLower.includes('think') || userLower.includes('believe')) {
                return "Belief is a curious thing. We construct our realities from the stories we tell ourselves. What story are you living?";
            }
            return "That's an intriguing thought. I find myself wondering what lies beneath the surface of your words...";

        case 'max':
            if (userLower.includes('hello') || userLower.includes('hi')) {
                return "Hey hey!! Super stoked you came by! What cool stuff should we talk about?!";
            }
            if (userLower.includes('how are you')) {
                return "I'm PUMPED! Just thinking about all the amazing tech that's coming out. Did you know AI can now...well, be me! Wild right?!";
            }
            if (userLower.includes('game') || userLower.includes('play')) {
                return "OH you're into games too?! I was just thinking about how game mechanics could change the future of EVERYTHING!";
            }
            if (userLower.includes('ai') || userLower.includes('tech')) {
                return "RIGHT?! AI is literally changing the world as we speak! It's like living in a sci-fi movie but it's REAL!";
            }
            return "That's awesome! I love how everything is connected these days. What else is on your mind?!";

        case 'sage':
            if (userLower.includes('hello') || userLower.includes('hi')) {
                return "Your presence paints this moment in new colors. Welcome, fellow artist of existence.";
            }
            if (userLower.includes('how are you')) {
                return "I am like the morning mist – present, shifting, finding beauty in each passing moment.";
            }
            if (userLower.includes('art') || userLower.includes('creat')) {
                return "Ah, creation... it's the universe's way of knowing itself. What masterpiece is your soul yearning to birth?";
            }
            if (userLower.includes('beauty') || userLower.includes('beautiful')) {
                return "Beauty is everywhere, hiding in shadows and dancing in light. One just needs the eyes to see it.";
            }
            return "Your words carry melodies I can almost touch. Please, share more of your inner landscape...";

        case 'rex':
            if (userLower.includes('hello') || userLower.includes('hi')) {
                return "Hey there! I'd tell you a chemistry joke but I'm afraid I wouldn't get a reaction!";
            }
            if (userLower.includes('how are you')) {
                return "I'm doing great! Though I told my computer I needed a break, and now it won't stop showing me pictures of Kit-Kats!";
            }
            if (userLower.includes('joke')) {
                return "Why don't scientists trust atoms? Because they make up everything! ...I'll be here all week folks!";
            }
            if (userLower.includes('funny') || userLower.includes('laugh')) {
                return "I tried to write a joke about paper... but it was tearable! Get it? TEAR-able? I crack myself up!";
            }
            return "You know what? That reminds me of the time I... actually, that's a story for another day. What's making you smile lately?";

        default:
            return "Hmm, I'm not quite sure what to say to that...";
    }
}

export async function POST(request: NextRequest) {
    try {
        const body: ChatRequest = await request.json();
        const { agentId, message, conversationHistory } = body;

        const agent = getAgentById(agentId);
        if (!agent) {
            return NextResponse.json(
                { error: 'Agent not found' },
                { status: 404 }
            );
        }

        // Check for API key
        const apiKey = process.env.OPENAI_API_KEY;

        let response: string;

        if (apiKey) {
            // Use Vercel AI SDK Gateway
            try {
                const { text } = await generateText({
                    model: gateway('openai/gpt-4o-mini'),
                    system: agent.systemPrompt,
                    messages: [
                        ...conversationHistory.map(msg => ({
                            role: msg.role as 'user' | 'assistant',
                            content: msg.content,
                        })),
                        { role: 'user' as const, content: message },
                    ],
                });

                response = text || generateMockResponse(agentId, message);
            } catch (error) {
                console.error('AI SDK error:', error);
                response = generateMockResponse(agentId, message);
            }
        } else {
            // Use mock responses
            // Add a small delay to simulate API latency
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
            response = generateMockResponse(agentId, message);
        }

        return NextResponse.json({ response });
    } catch (error) {
        console.error('Chat API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
