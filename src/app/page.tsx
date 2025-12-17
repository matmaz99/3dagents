'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { AgentPersonality } from '@/agents/personalities';
import { AgentIndicator } from '@/components/AgentIndicator';
import { ChatPanel } from '@/components/ChatPanel';
import { ProjectSidebar } from '@/components/ProjectSidebar';
import { NewProjectForm } from '@/components/NewProjectForm';
import { projectStore } from '@/store/projectStore';
import { Project } from '@/types/project';
import type { GameCanvasHandle } from '@/components/GameCanvas';

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
  const gameCanvasRef = useRef<GameCanvasHandle>(null);
  const [nearbyAgent, setNearbyAgent] = useState<AgentPersonality | null>(null);
  const [nearbyDistance, setNearbyDistance] = useState<number>(0);

  // Project state
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [isProjectsLoaded, setIsProjectsLoaded] = useState(false);

  // Load projects on mount
  useEffect(() => {
    // Initial load - set both projects and active project
    const allProjects = projectStore.getProjects();
    setProjects(allProjects);

    const active = projectStore.getActiveProject();
    if (active) {
      setActiveProject(active);
    } else if (allProjects.length > 0) {
      setActiveProject(allProjects[0]);
      projectStore.setActiveProject(allProjects[0].id);
    }

    setIsProjectsLoaded(true);

    // Subscribe ONLY updates projects list, NOT active project
    // This prevents the subscription from overriding user selections
    const handleStoreChange = () => {
      setProjects(projectStore.getProjects());
    };

    const unsubscribe = projectStore.subscribe(handleStoreChange);
    return unsubscribe;
  }, []);

  const handleNearAgent = useCallback((agent: AgentPersonality | null, distance: number) => {
    setNearbyAgent(agent);
    setNearbyDistance(distance);
  }, []);

  const handleInteractRequest = useCallback(() => {
    // No longer needed - chat is always available in side panel
  }, []);

  const handleEnterCallStation = useCallback(() => {
    // No longer needed
  }, []);

  const handleLeaveCallStation = useCallback(() => {
    // No longer needed
  }, []);

  const handleAgentArrived = useCallback(() => {
    // No longer needed
  }, []);

  // Project management handlers
  const handleSelectProject = (project: Project) => {
    // Set flag to prevent game space detection from overriding this selection
    userSelectedProjectRef.current = true;
    setActiveProject(project);
    projectStore.setActiveProject(project.id);
    if (gameCanvasRef.current) {
      gameCanvasRef.current.focusOnProject(project.id);
    }
    // Reset flag after focus animation completes
    setTimeout(() => {
      userSelectedProjectRef.current = false;
    }, 1000);
  };

  const handleCreateProject = useCallback(() => {
    setShowNewProjectForm(true);
  }, []);

  const handleProjectCreated = useCallback((projectId: string) => {
    setShowNewProjectForm(false);
    const project = projectStore.getProject(projectId);
    if (project) {
      setActiveProject(project);
      projectStore.setActiveProject(projectId);
      // Refresh projects list
      setProjects(projectStore.getProjects());
      // Focus on new project
      setTimeout(() => {
        gameCanvasRef.current?.focusOnProject(projectId);
      }, 100);
    }
  }, []);

  // Track if user manually selected a project (to prevent game space detection from overriding)
  const userSelectedProjectRef = useRef(false);

  const handleSpaceChanged = useCallback((projectId: string | null) => {
    // Don't override if user just manually selected a project
    if (userSelectedProjectRef.current) {
      return;
    }
    if (projectId) {
      const project = projectStore.getProject(projectId);
      if (project) {
        setActiveProject(project);
        projectStore.setActiveProject(projectId);
      }
    }
  }, []);

  const handleZoomChanged = useCallback((zoom: number) => {
    setCurrentZoom(zoom);
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#1a1a2e] flex">
      {/* Project sidebar (left) */}
      <ProjectSidebar
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        activeProjectId={activeProject?.id || null}
      />

      {/* Main game area */}
      <div className="flex-1 relative">
        {/* Game Canvas - only render after projects are loaded */}
        {isProjectsLoaded && (
          <GameCanvas
            ref={gameCanvasRef}
            onNearAgent={handleNearAgent}
            onInteractRequest={handleInteractRequest}
            onEnterCallStation={handleEnterCallStation}
            onLeaveCallStation={handleLeaveCallStation}
            onAgentArrived={handleAgentArrived}
            isInteracting={false}
            projects={projects}
            activeProjectId={activeProject?.id || null}
            onSpaceChanged={handleSpaceChanged}
            onZoomChanged={handleZoomChanged}
          />
        )}
        {!isProjectsLoaded && (
          <div className="w-full h-full flex items-center justify-center bg-[#1a1a2e]">
            <div className="text-white text-xl animate-pulse">Loading...</div>
          </div>
        )}

        {/* Agent proximity indicator */}
        {nearbyAgent && (
          <AgentIndicator agent={nearbyAgent} distance={nearbyDistance} />
        )}

        {/* Header info */}
        <div className="absolute top-4 left-4 z-30 pointer-events-none">
          <h1 className="text-white text-2xl font-bold drop-shadow-lg">AI Office</h1>
          {activeProject ? (
            <div className="flex items-center gap-2 mt-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: activeProject.color }}
              />
              <p className="text-gray-300 text-sm font-medium">{activeProject.name}</p>
            </div>
          ) : (
            <p className="text-gray-400 text-sm mt-1">Select a project to get started</p>
          )}
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-4 left-4 z-30 flex items-center gap-2 bg-gray-900/80 rounded-lg px-3 py-2">
          <button
            onClick={() => gameCanvasRef.current?.zoomOutToOverview()}
            className="w-8 h-8 rounded bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            title="Zoom out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="text-gray-400 text-sm w-12 text-center">
            {Math.round(currentZoom * 100)}%
          </span>
          <button
            onClick={() => gameCanvasRef.current?.zoomInToSpace()}
            className="w-8 h-8 rounded bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            title="Zoom in"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chat panel (right side) - key forces remount on project change */}
      <ChatPanel
        key={activeProject?.id || 'no-project'}
        gameRef={gameCanvasRef}
        project={activeProject || undefined}
      />

      {/* New project form modal */}
      {showNewProjectForm && (
        <NewProjectForm
          onClose={() => setShowNewProjectForm(false)}
          onProjectCreated={handleProjectCreated}
        />
      )}
    </div>
  );
}
