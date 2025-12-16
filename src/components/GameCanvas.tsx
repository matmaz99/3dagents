'use client';

import { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import { WorldScene, GameEvents } from '@/game/WorldScene';
import { AgentPersonality, getAgentById } from '@/agents/personalities';
import { Project } from '@/types/project';

interface GameCanvasProps {
    onNearAgent: (agent: AgentPersonality | null, distance: number) => void;
    onInteractRequest: (agent: AgentPersonality) => void;
    onEnterCallStation: () => void;
    onLeaveCallStation: () => void;
    onAgentArrived: (agent: AgentPersonality) => void;
    isInteracting: boolean;
    // Multi-space props
    projects?: Project[];
    activeProjectId?: string | null;
    onSpaceChanged?: (projectId: string | null) => void;
    onZoomChanged?: (zoom: number) => void;
}

import { AgentState } from '@/game/Agent';

export interface GameCanvasHandle {
    summonAgent: (agentId: string) => void;
    // Orchestrator methods
    walkAgentToAgent: (walkerId: string, targetId: string) => Promise<void>;
    teleportAgentToAgent: (agentId: string, targetId: string) => void;
    setAgentState: (agentId: string, state: AgentState) => void;
    getAgentPosition: (agentId: string) => { x: number; y: number } | null;
    showThoughtBubble: (bubbleId: string, agentId: string, content?: string, depth?: number) => void;
    updateThoughtBubble: (bubbleId: string, content: string) => void;
    hideThoughtBubble: (bubbleId: string) => void;
    returnAgentToDesk: (agentId: string) => Promise<void>;
    returnAllAgentsToDesks: () => void;
    // Multi-space methods
    setProjects: (projects: Project[]) => void;
    focusOnProject: (projectId: string) => void;
    zoomOutToOverview: () => void;
    zoomInToSpace: () => void;
}

export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(function GameCanvas(
    { onNearAgent, onInteractRequest, onEnterCallStation, onLeaveCallStation, onAgentArrived, isInteracting, projects, activeProjectId, onSpaceChanged, onZoomChanged },
    ref
) {
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

    const handleEnterCallStation = useCallback(() => {
        onEnterCallStation();
    }, [onEnterCallStation]);

    const handleLeaveCallStation = useCallback(() => {
        onLeaveCallStation();
    }, [onLeaveCallStation]);

    const handleAgentArrived = useCallback((agentId: string) => {
        const agent = getAgentById(agentId);
        if (agent) {
            onAgentArrived(agent);
        }
    }, [onAgentArrived]);

    // Store callbacks in refs so they're always current
    const callbacksRef = useRef({ handleNearAgent, handleLeaveAgent, handleInteractRequest, handleEnterCallStation, handleLeaveCallStation, handleAgentArrived });
    useEffect(() => {
        callbacksRef.current = { handleNearAgent, handleLeaveAgent, handleInteractRequest, handleEnterCallStation, handleLeaveCallStation, handleAgentArrived };
    }, [handleNearAgent, handleLeaveAgent, handleInteractRequest, handleEnterCallStation, handleLeaveCallStation, handleAgentArrived]);

    // Expose methods via ref for orchestrator
    useImperativeHandle(ref, () => ({
        summonAgent: (agentId: string) => {
            if (sceneRef.current) {
                sceneRef.current.summonAgent(agentId);
            }
        },
        walkAgentToAgent: async (walkerId: string, targetId: string) => {
            if (sceneRef.current) {
                await sceneRef.current.walkAgentToAgent(walkerId, targetId);
            }
        },
        teleportAgentToAgent: (agentId: string, targetId: string) => {
            if (sceneRef.current) {
                sceneRef.current.teleportAgentToAgent(agentId, targetId);
            }
        },
        setAgentState: (agentId: string, state: AgentState) => {
            if (sceneRef.current) {
                sceneRef.current.setAgentState(agentId, state);
            }
        },
        getAgentPosition: (agentId: string) => {
            if (sceneRef.current) {
                return sceneRef.current.getAgentPosition(agentId);
            }
            return null;
        },
        showThoughtBubble: (bubbleId: string, agentId: string, content?: string, depth?: number) => {
            if (sceneRef.current) {
                sceneRef.current.showThoughtBubble(bubbleId, agentId, content, depth);
            }
        },
        updateThoughtBubble: (bubbleId: string, content: string) => {
            if (sceneRef.current) {
                sceneRef.current.updateThoughtBubble(bubbleId, content);
            }
        },
        hideThoughtBubble: (bubbleId: string) => {
            if (sceneRef.current) {
                sceneRef.current.hideThoughtBubble(bubbleId);
            }
        },
        returnAgentToDesk: async (agentId: string) => {
            if (sceneRef.current) {
                await sceneRef.current.returnAgentToDesk(agentId);
            }
        },
        returnAllAgentsToDesks: () => {
            if (sceneRef.current) {
                sceneRef.current.returnAllAgentsToDesks();
            }
        },
        // Multi-space methods
        setProjects: (projects: Project[]) => {
            if (sceneRef.current) {
                sceneRef.current.setProjects(projects);
            }
        },
        focusOnProject: (projectId: string) => {
            if (sceneRef.current) {
                sceneRef.current.focusOnProject(projectId);
            }
        },
        zoomOutToOverview: () => {
            if (sceneRef.current) {
                sceneRef.current.zoomOutToOverview();
            }
        },
        zoomInToSpace: () => {
            if (sceneRef.current) {
                sceneRef.current.zoomInToSpace();
            }
        },
    }), []);

    useEffect(() => {
        if (sceneRef.current) {
            sceneRef.current.setPlayerInteracting(isInteracting);
        }
    }, [isInteracting]);

    // Sync projects with scene when they change
    useEffect(() => {
        if (sceneRef.current && projects) {
            sceneRef.current.setProjects(projects);
        }
    }, [projects]);

    // Sync active project with scene
    useEffect(() => {
        if (sceneRef.current && activeProjectId) {
            sceneRef.current.setActiveProject(activeProjectId);
        }
    }, [activeProjectId]);

    // Store multi-space callbacks
    const multiSpaceCallbacksRef = useRef({ onSpaceChanged, onZoomChanged });
    useEffect(() => {
        multiSpaceCallbacksRef.current = { onSpaceChanged, onZoomChanged };
    }, [onSpaceChanged, onZoomChanged]);

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
            // Store initial projects in a ref so scene can access them
            const initialProjectsRef = { current: projects };

            class GameWorldScene extends WorldSceneClass {
                init() {
                    // Set projects before create() runs
                    if (initialProjectsRef.current && initialProjectsRef.current.length > 0) {
                        this.setProjects(initialProjectsRef.current);
                    }
                }

                create() {
                    super.create();

                    // Set up event handlers after scene is created
                    const events: GameEvents = {
                        onNearAgent: (agentId, distance) => callbacksRef.current.handleNearAgent(agentId, distance),
                        onLeaveAgent: () => callbacksRef.current.handleLeaveAgent(),
                        onInteractRequest: (agentId) => callbacksRef.current.handleInteractRequest(agentId),
                        onEnterCallStation: () => callbacksRef.current.handleEnterCallStation(),
                        onLeaveCallStation: () => callbacksRef.current.handleLeaveCallStation(),
                        onAgentArrived: (agentId) => callbacksRef.current.handleAgentArrived(agentId),
                        // Multi-space events
                        onSpaceChanged: (projectId) => multiSpaceCallbacksRef.current.onSpaceChanged?.(projectId),
                        onZoomChanged: (zoom) => multiSpaceCallbacksRef.current.onZoomChanged?.(zoom),
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
});
