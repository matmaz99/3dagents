'use client';

import { useState, FormEvent } from 'react';
import { projectStore } from '@/store/projectStore';
import { GitHubConfig, ClickUpConfig } from '@/types/project';

interface NewProjectFormProps {
    onClose: () => void;
    onProjectCreated: (projectId: string) => void;
}

export function NewProjectForm({ onClose, onProjectCreated }: NewProjectFormProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [githubRepo, setGithubRepo] = useState(''); // format: owner/repo
    const [clickupListId, setClickupListId] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!name.trim()) {
            setError('Project name is required');
            return;
        }

        setIsSubmitting(true);

        try {
            // Parse GitHub config if provided
            let github: GitHubConfig | undefined;
            if (githubRepo.trim()) {
                const parts = githubRepo.trim().split('/');
                if (parts.length !== 2 || !parts[0] || !parts[1]) {
                    setError('GitHub repo must be in format: owner/repo');
                    setIsSubmitting(false);
                    return;
                }
                github = { owner: parts[0], repo: parts[1] };
            }

            // Parse ClickUp config if provided
            let clickup: ClickUpConfig | undefined;
            if (clickupListId.trim()) {
                clickup = { listId: clickupListId.trim() };
            }

            // Create the project
            const project = projectStore.createProject(name.trim(), {
                description: description.trim() || undefined,
                github,
                clickup,
            });

            onProjectCreated(project.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create project');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h2 className="text-white font-semibold text-lg">New Project</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Project Name */}
                    <div>
                        <label className="block text-gray-400 text-sm mb-1">
                            Project Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="My Awesome Project"
                            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
                            autoFocus
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-gray-400 text-sm mb-1">
                            Description
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of the project..."
                            rows={2}
                            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 resize-none"
                        />
                    </div>

                    {/* Integrations Section */}
                    <div className="pt-2 border-t border-gray-700">
                        <h3 className="text-gray-300 text-sm font-medium mb-3">Integrations (Optional)</h3>

                        {/* GitHub */}
                        <div className="mb-3">
                            <label className="block text-gray-400 text-sm mb-1">
                                <span className="flex items-center gap-1.5">
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                                    </svg>
                                    GitHub Repository
                                </span>
                            </label>
                            <input
                                type="text"
                                value={githubRepo}
                                onChange={(e) => setGithubRepo(e.target.value)}
                                placeholder="owner/repository"
                                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
                            />
                            <p className="text-gray-500 text-xs mt-1">
                                Format: owner/repo (e.g., facebook/react)
                            </p>
                        </div>

                        {/* ClickUp */}
                        <div>
                            <label className="block text-gray-400 text-sm mb-1">
                                <span className="flex items-center gap-1.5">
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M3.5 9.5c-.4.4-.4 1 0 1.4l6.5 6.5c.4.4 1 .4 1.4 0l9.6-9.6c.4-.4.4-1 0-1.4l-1.4-1.4c-.4-.4-1-.4-1.4 0L10.7 12 6.3 7.6c-.4-.4-1-.4-1.4 0L3.5 9z" />
                                    </svg>
                                    ClickUp List ID
                                </span>
                            </label>
                            <input
                                type="text"
                                value={clickupListId}
                                onChange={(e) => setClickupListId(e.target.value)}
                                placeholder="abc123xyz"
                                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
                            />
                            <p className="text-gray-500 text-xs mt-1">
                                Found in your ClickUp list URL
                            </p>
                        </div>
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                        >
                            {isSubmitting ? 'Creating...' : 'Create Project'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
