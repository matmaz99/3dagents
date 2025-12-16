'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { WorldScene, GameEvents } from '@/game/WorldScene';
import { AgentPersonality, getAgentById } from '@/agents/personalities';

interface GameCanvasProps {
    onNearAgent: (agent: AgentPersonality | null, distance: number) => void;
    onInteractRequest: (agent: AgentPersonality) => void;
    isInteracting: boolean;
}

export function GameCanvas({ onNearAgent, onInteractRequest, isInteracting }: GameCanvasProps) {
    const gameRef = useRef<Phaser.Game | null>(null);
    const sceneRef = useRef<WorldScene | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const initRef = useRef(false);

    const handleNearAgent = useCallback((agentId: string, distance: number) => {
        const agent = getAgentById(agentId);
        onNearAgent(agent || null, distance);
    }, [onNearAgent]);

    const handleLeaveAgent = useCallback(() => {
        onNearAgent(null, 0);
    }, [onNearAgent]);

    const handleInteractRequest = useCallback((agentId: string) => {
        const agent = getAgentById(agentId);
        if (agent) {
            onInteractRequest(agent);
        }
    }, [onInteractRequest]);

    // Store callbacks in refs so they're always current
    const callbacksRef = useRef({ handleNearAgent, handleLeaveAgent, handleInteractRequest });
    useEffect(() => {
        callbacksRef.current = { handleNearAgent, handleLeaveAgent, handleInteractRequest };
    }, [handleNearAgent, handleLeaveAgent, handleInteractRequest]);

    useEffect(() => {
        if (sceneRef.current) {
            sceneRef.current.setPlayerInteracting(isInteracting);
        }
    }, [isInteracting]);

    useEffect(() => {
        // Prevent double initialization in React strict mode
        if (initRef.current) return;
        initRef.current = true;

        // Dynamic import Phaser (client-side only)
        const initGame = async () => {
            if (typeof window === 'undefined' || gameRef.current) return;

            // Wait for container to be ready
            await new Promise(resolve => setTimeout(resolve, 100));

            const Phaser = (await import('phaser')).default;
            const { WorldScene: WorldSceneClass } = await import('@/game/WorldScene');

            // Create a custom scene class that can set up events
            class GameWorldScene extends WorldSceneClass {
                create() {
                    super.create();

                    // Set up event handlers after scene is created
                    const events: GameEvents = {
                        onNearAgent: (agentId, distance) => callbacksRef.current.handleNearAgent(agentId, distance),
                        onLeaveAgent: () => callbacksRef.current.handleLeaveAgent(),
                        onInteractRequest: (agentId) => callbacksRef.current.handleInteractRequest(agentId),
                    };
                    this.setGameEvents(events);
                    sceneRef.current = this;
                    setIsLoading(false);
                }
            }

            // Create game config
            const config: Phaser.Types.Core.GameConfig = {
                type: Phaser.AUTO,
                parent: containerRef.current || 'game-container',
                backgroundColor: '#1a1a2e',
                pixelArt: true,
                scale: {
                    mode: Phaser.Scale.RESIZE,
                    width: '100%',
                    height: '100%',
                },
                physics: {
                    default: 'arcade',
                    arcade: {
                        gravity: { x: 0, y: 0 },
                        debug: false,
                    },
                },
                scene: [GameWorldScene],
            };

            // Create game instance
            const game = new Phaser.Game(config);
            gameRef.current = game;
        };

        initGame();

        return () => {
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
                sceneRef.current = null;
            }
        };
    }, []);

    return (
        <div className="relative w-full h-full">
            <div
                ref={containerRef}
                id="game-container"
                className="w-full h-full"
            />
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e]">
                    <div className="text-white text-xl animate-pulse">Loading AI Office...</div>
                </div>
            )}
        </div>
    );
}
