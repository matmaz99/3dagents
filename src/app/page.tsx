'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { AgentPersonality } from '@/agents/personalities';
import { AgentIndicator } from '@/components/AgentIndicator';
import { ChatOverlay } from '@/components/ChatOverlay';

// Dynamic import for Phaser (client-side only)
const GameCanvas = dynamic(
  () => import('@/components/GameCanvas').then(mod => mod.GameCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[#1a1a2e]">
        <div className="text-white text-xl animate-pulse">Loading AI Office...</div>
      </div>
    ),
  }
);

export default function Home() {
  const [nearbyAgent, setNearbyAgent] = useState<AgentPersonality | null>(null);
  const [nearbyDistance, setNearbyDistance] = useState<number>(0);
  const [chattingAgent, setChattingAgent] = useState<AgentPersonality | null>(null);

  const handleNearAgent = useCallback((agent: AgentPersonality | null, distance: number) => {
    setNearbyAgent(agent);
    setNearbyDistance(distance);
  }, []);

  const handleInteractRequest = useCallback((agent: AgentPersonality) => {
    setChattingAgent(agent);
  }, []);

  const handleCloseChat = useCallback(() => {
    setChattingAgent(null);
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#1a1a2e]">
      {/* Game Canvas */}
      <GameCanvas
        onNearAgent={handleNearAgent}
        onInteractRequest={handleInteractRequest}
        isInteracting={chattingAgent !== null}
      />

      {/* Agent proximity indicator */}
      {nearbyAgent && !chattingAgent && (
        <AgentIndicator agent={nearbyAgent} distance={nearbyDistance} />
      )}

      {/* Chat overlay */}
      {chattingAgent && (
        <ChatOverlay agent={chattingAgent} onClose={handleCloseChat} />
      )}

      {/* Header info */}
      <div className="fixed top-4 left-4 z-30">
        <h1 className="text-white text-2xl font-bold drop-shadow-lg">🏢 AI Office</h1>
        <p className="text-gray-400 text-sm mt-1">Walk around and meet your AI coworkers</p>
      </div>

      {/* Mini legend */}
      <div className="fixed top-4 right-4 z-30 bg-gray-900/80 backdrop-blur-sm rounded-xl p-3 border border-gray-700">
        <div className="text-white text-xs font-semibold mb-2">Coworkers</div>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#9b59b6]" />
            <span className="text-gray-300">Luna - Philosopher</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#2ecc71]" />
            <span className="text-gray-300">Max - Enthusiast</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#3498db]" />
            <span className="text-gray-300">Sage - Artist</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#e67e22]" />
            <span className="text-gray-300">Rex - Comedian</span>
          </div>
        </div>
      </div>
    </div>
  );
}
