'use client';

import { useState, useEffect } from 'react';
import { Project } from '@/types/project';
import { projectStore } from '@/store/projectStore';

interface ProjectSidebarProps {
    onSelectProject: (project: Project) => void;
    onCreateProject: () => void;
    activeProjectId: string | null;
}

export function ProjectSidebar({
    onSelectProject,
    onCreateProject,
    activeProjectId,
}: ProjectSidebarProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Subscribe to project store changes
    useEffect(() => {
        const loadProjects = () => {
            setProjects(projectStore.getProjects());
        };

        loadProjects();
        const unsubscribe = projectStore.subscribe(loadProjects);
        return unsubscribe;
    }, []);

    if (isCollapsed) {
        return (
            <div className="w-12 h-full bg-gray-900 border-r border-gray-700 flex flex-col items-center py-3">
                <button
                    onClick={() => setIsCollapsed(false)}
                    className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                    title="Expand sidebar"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                </button>

                <div className="mt-4 space-y-2">
                    {projects.map(project => (
                        <button
                            key={project.id}
                            onClick={() => onSelectProject(project)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                activeProjectId === project.id
                                    ? 'ring-2 ring-white/50'
                                    : 'hover:ring-1 hover:ring-gray-600'
                            }`}
                            style={{ backgroundColor: project.color }}
                            title={project.name}
                        >
                            <span className="text-white text-xs font-bold">
                                {project.name.charAt(0).toUpperCase()}
                            </span>
                        </button>
                    ))}
                </div>

                <button
                    onClick={onCreateProject}
                    className="mt-auto w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                    title="New project"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </button>
            </div>
        );
    }

    return (
        <div className="w-56 h-full bg-gray-900 border-r border-gray-700 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-700">
                <h2 className="text-white font-semibold text-sm">Projects</h2>
                <button
                    onClick={() => setIsCollapsed(true)}
                    className="w-6 h-6 rounded hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                    title="Collapse sidebar"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                </button>
            </div>

            {/* Project list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {projects.map(project => (
                    <button
                        key={project.id}
                        onClick={() => onSelectProject(project)}
                        className={`w-full p-2 rounded-lg text-left transition-all ${
                            activeProjectId === project.id
                                ? 'bg-gray-800 ring-1 ring-gray-600'
                                : 'hover:bg-gray-800/50'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: project.color }}
                            />
                            <span className="text-white text-sm font-medium truncate">
                                {project.name}
                            </span>
                        </div>
                        {project.description && (
                            <p className="text-gray-500 text-xs mt-1 truncate pl-5">
                                {project.description}
                            </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 pl-5">
                            {project.github && (
                                <span
                                    className="text-xs px-1.5 py-0.5 bg-gray-700 rounded text-gray-400"
                                    title={`GitHub: ${project.github.owner}/${project.github.repo}`}
                                >
                                    GH
                                </span>
                            )}
                            {project.clickup && (
                                <span
                                    className="text-xs px-1.5 py-0.5 bg-gray-700 rounded text-gray-400"
                                    title="ClickUp connected"
                                >
                                    CU
                                </span>
                            )}
                        </div>
                    </button>
                ))}

                {projects.length === 0 && (
                    <div className="text-gray-500 text-sm text-center py-4">
                        No projects yet
                    </div>
                )}
            </div>

            {/* New project button */}
            <div className="p-2 border-t border-gray-700">
                <button
                    onClick={onCreateProject}
                    className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New Project
                </button>
            </div>
        </div>
    );
}
