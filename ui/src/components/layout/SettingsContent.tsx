'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getApiKeys,
  saveApiKey,
  deleteApiKey,
  getSkillsConfig,
  updateSkillsConfig,
  getSkillsStatus,
  getPersonalities,
  createPersonality,
  updatePersonality,
  deletePersonality,
  getProjects,
  createProject,
  deleteProject,
  type ApiKey,
  type SkillsStatus,
  type Personality,
  type Project,
} from '@/lib/api';
import { Button, Input, Spinner, Dialog } from '@/components/ui';
import { useServer } from '@/contexts/ServerContext';
import { AddServerModal } from '@/components/layout/AddServerModal';
import { FileExplorer } from '@/components/chat/FileExplorer';

const PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'mistral', label: 'Mistral AI' },
  { value: 'openai', label: 'OpenAI' },
];

type SettingsTab = 'keys' | 'skills' | 'system';

export function SettingsContent() {
  const { servers, activeServer, switchServer, removeServer } = useServer();
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('keys');

  // Add key form state
  const [provider, setProvider] = useState('anthropic');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  // Skills directory state
  const [skillsDir, setSkillsDir] = useState<string>('');
  const [skillsDefaultDir, setSkillsDefaultDir] = useState<string>('');
  const [skillsStatus, setSkillsStatus] = useState<SkillsStatus | null>(null);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsSaving, setSkillsSaving] = useState(false);
  const [showSkillsPicker, setShowSkillsPicker] = useState(false);

  // Personalities state
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [personalitiesLoading, setPersonalitiesLoading] = useState(true);
  const [newPersonalityName, setNewPersonalityName] = useState('');
  const [newPersonalityReadableId, setNewPersonalityReadableId] = useState('');
  const [newPersonalityInstructions, setNewPersonalityInstructions] = useState('');
  const [personalitySaving, setPersonalitySaving] = useState(false);
  const [editingPersonalityId, setEditingPersonalityId] = useState<string | null>(null);
  const [editPersonalityName, setEditPersonalityName] = useState('');
  const [editPersonalityReadableId, setEditPersonalityReadableId] = useState('');
  const [editPersonalityInstructions, setEditPersonalityInstructions] = useState('');

  // Projects state
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectSlug, setNewProjectSlug] = useState('');
  const [projectSaving, setProjectSaving] = useState(false);

  const fetchApiKeys = useCallback(async () => {
    try {
      setError(null);
      const data = await getApiKeys();
      setApiKeys(data.apiKeys);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSkillsConfig = useCallback(async () => {
    try {
      const config = await getSkillsConfig();
      setSkillsDir(config.globalDirectory || '');
      setSkillsDefaultDir(config.defaultDirectory);
      if (config.globalDirectory) {
        const status = await getSkillsStatus();
        setSkillsStatus(status);
      } else {
        setSkillsStatus(null);
      }
    } catch {
      // Skills config is optional
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  const fetchPersonalities = useCallback(async () => {
    try {
      const data = await getPersonalities({ limit: 100 });
      setPersonalities(data.personalities);
    } catch {
      // Non-critical
    } finally {
      setPersonalitiesLoading(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await getProjects({ limit: 100 });
      setProjects(data.projects);
    } catch {
      // Non-critical
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApiKeys();
    fetchSkillsConfig();
    fetchPersonalities();
    fetchProjects();
  }, [fetchApiKeys, fetchSkillsConfig, fetchPersonalities, fetchProjects]);

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) { setError('Please enter an API key'); return; }
    setSaving(true);
    setError(null);
    try {
      await saveApiKey({ provider, apiKey: apiKeyInput });
      setApiKeyInput('');
      fetchApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async (providerToDelete: string) => {
    if (!confirm(`Delete the ${providerToDelete} API key?`)) return;
    try { await deleteApiKey(providerToDelete); fetchApiKeys(); } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete API key');
    }
  };

  const handleSaveSkillsDir = async () => {
    setSkillsSaving(true); setError(null);
    try { await updateSkillsConfig(skillsDir.trim() || null); await fetchSkillsConfig(); } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save skills directory');
    } finally { setSkillsSaving(false); }
  };

  const handleClearSkillsDir = async () => {
    setSkillsSaving(true); setError(null);
    try { await updateSkillsConfig(null); setSkillsDir(''); setSkillsStatus(null); } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear skills directory');
    } finally { setSkillsSaving(false); }
  };

  const nameToSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleCreatePersonality = async () => {
    if (!newPersonalityName.trim() || !newPersonalityReadableId.trim() || !newPersonalityInstructions.trim()) {
      setError('Please fill in all personality fields'); return;
    }
    setPersonalitySaving(true); setError(null);
    try {
      await createPersonality({ name: newPersonalityName.trim(), readableId: newPersonalityReadableId.trim(), instructions: newPersonalityInstructions.trim() });
      setNewPersonalityName(''); setNewPersonalityReadableId(''); setNewPersonalityInstructions('');
      fetchPersonalities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create personality');
    } finally { setPersonalitySaving(false); }
  };

  const handleUpdatePersonality = async (id: string) => {
    if (!editPersonalityName.trim() || !editPersonalityReadableId.trim() || !editPersonalityInstructions.trim()) {
      setError('Please fill in all personality fields'); return;
    }
    setPersonalitySaving(true); setError(null);
    try {
      await updatePersonality(id, { name: editPersonalityName.trim(), readableId: editPersonalityReadableId.trim(), instructions: editPersonalityInstructions.trim() });
      setEditingPersonalityId(null); fetchPersonalities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update personality');
    } finally { setPersonalitySaving(false); }
  };

  const handleDeletePersonality = async (id: string, name: string) => {
    if (!confirm(`Delete personality "${name}"?`)) return;
    try { await deletePersonality(id); fetchPersonalities(); } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete personality');
    }
  };

  const startEditPersonality = (p: Personality) => {
    setEditingPersonalityId(p.id);
    setEditPersonalityName(p.name);
    setEditPersonalityReadableId(p.readableId);
    setEditPersonalityInstructions(p.instructions);
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !newProjectSlug.trim()) { setError('Please fill in all project fields'); return; }
    setProjectSaving(true); setError(null);
    try {
      await createProject({ name: newProjectName.trim(), projectSlug: newProjectSlug.trim() });
      setNewProjectName(''); setNewProjectSlug(''); fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally { setProjectSaving(false); }
  };

  const handleDeleteProject = async (id: string, name: string) => {
    if (!confirm(`Archive project "${name}"?`)) return;
    try { await deleteProject(id); fetchProjects(); } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive project');
    }
  };

  const toggleRevealKey = (provider: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider); else next.add(provider);
      return next;
    });
  };

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'keys', label: 'API Keys' },
    { id: 'skills', label: 'Skills' },
    { id: 'system', label: 'System' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-hg-on-surface">Orchestration & Configuration</h1>
          <p className="text-sm text-hg-on-surface-variant mt-1">
            Manage recurring autonomous jobs and global system parameters.
          </p>
        </div>
        <div className="flex items-center rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-hg-surface-container-high text-hg-on-surface shadow-sm'
                  : 'text-hg-on-surface-variant hover:text-hg-on-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-hg-error/10 border border-hg-error/20 rounded-xl text-hg-error text-sm">
          {error}
        </div>
      )}

      {/* Two-column bento grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* ===== LEFT COLUMN ===== */}
        <div className="space-y-6">
          {activeTab === 'keys' && (
            <>
              {/* Personalities Section */}
              <div className="rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-hg-on-surface">Personalities</h3>
                  <span className="text-[10px] text-hg-on-surface-variant">{personalities.length} configured</span>
                </div>

                {personalitiesLoading ? (
                  <div className="flex justify-center py-6"><Spinner className="h-5 w-5 text-hg-on-surface-variant" /></div>
                ) : personalities.length > 0 ? (
                  <div className="space-y-2">
                    {personalities.map((p) =>
                      editingPersonalityId === p.id ? (
                        <div key={p.id} className="p-3 rounded-lg border border-hg-primary/20 bg-hg-primary/5 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Input value={editPersonalityName} onChange={(e) => setEditPersonalityName(e.target.value)} placeholder="Name" className="text-xs py-1.5" />
                            <Input value={editPersonalityReadableId} onChange={(e) => setEditPersonalityReadableId(e.target.value)} placeholder="@id" className="font-mono text-xs py-1.5" />
                          </div>
                          <textarea
                            value={editPersonalityInstructions}
                            onChange={(e) => setEditPersonalityInstructions(e.target.value)}
                            placeholder="Soul instructions..."
                            className="w-full px-3 py-1.5 text-xs border border-hg-outline-variant/30 rounded-lg bg-hg-surface-container text-hg-on-surface focus:ring-2 focus:ring-hg-primary/50 min-h-[64px] outline-none"
                          />
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setEditingPersonalityId(null)}>Cancel</Button>
                            <Button size="sm" onClick={() => handleUpdatePersonality(p.id)} disabled={personalitySaving}>
                              {personalitySaving ? <Spinner className="h-3 w-3" /> : 'Save'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div key={p.id} className="flex items-start justify-between p-3 rounded-lg bg-hg-surface-container/50 hover:bg-hg-surface-container transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-hg-on-surface">{p.name}</span>
                              <span className="text-xs text-hg-primary font-mono">{p.readableId}</span>
                            </div>
                            <p className="text-xs text-hg-on-surface-variant mt-1 line-clamp-2">{p.instructions}</p>
                          </div>
                          <div className="flex items-center gap-1 ml-3 shrink-0">
                            <Button variant="ghost" size="sm" onClick={() => startEditPersonality(p)}>Edit</Button>
                            <Button variant="danger" size="sm" onClick={() => handleDeletePersonality(p.id, p.name)}>Delete</Button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-hg-on-surface-variant/60 text-center py-4">No personalities created yet</p>
                )}

                {/* Add New */}
                <div className="pt-4 border-t border-hg-outline-variant/20 space-y-2">
                  <span className="text-xs font-medium text-hg-on-surface-variant">Add New Personality</span>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={newPersonalityName}
                      onChange={(e) => {
                        setNewPersonalityName(e.target.value);
                        if (!newPersonalityReadableId || newPersonalityReadableId === `@${nameToSlug(newPersonalityName)}`) {
                          setNewPersonalityReadableId(`@${nameToSlug(e.target.value)}`);
                        }
                      }}
                      placeholder="Name (e.g. Mark)"
                      className="text-xs py-1.5"
                    />
                    <Input value={newPersonalityReadableId} onChange={(e) => setNewPersonalityReadableId(e.target.value)} placeholder="@readable-id" className="font-mono text-xs py-1.5" />
                  </div>
                  <textarea
                    value={newPersonalityInstructions}
                    onChange={(e) => setNewPersonalityInstructions(e.target.value)}
                    placeholder="Soul instructions..."
                    className="w-full px-3 py-1.5 text-xs border border-hg-outline-variant/30 rounded-lg bg-hg-surface-container text-hg-on-surface focus:ring-2 focus:ring-hg-primary/50 min-h-[64px] outline-none"
                  />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleCreatePersonality} disabled={personalitySaving || !newPersonalityName.trim() || !newPersonalityReadableId.trim() || !newPersonalityInstructions.trim()}>
                      {personalitySaving ? <Spinner className="h-3 w-3" /> : 'Create Personality'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Projects Section */}
              <div className="rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-hg-on-surface">Projects</h3>
                  <span className="text-[10px] text-hg-on-surface-variant">{projects.length} active</span>
                </div>

                {projectsLoading ? (
                  <div className="flex justify-center py-6"><Spinner className="h-5 w-5 text-hg-on-surface-variant" /></div>
                ) : projects.length > 0 ? (
                  <div className="space-y-2">
                    {projects.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-hg-surface-container/50">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-hg-on-surface">{p.name}</span>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              p.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : 'bg-hg-surface-container-high text-hg-on-surface-variant'
                            }`}>
                              {p.status}
                            </span>
                          </div>
                          <div className="text-xs text-hg-on-surface-variant font-mono truncate mt-0.5">{p.workspacePath}</div>
                        </div>
                        <Button variant="danger" size="sm" onClick={() => handleDeleteProject(p.id, p.name)}>Archive</Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-hg-on-surface-variant/60 text-center py-4">No projects created yet</p>
                )}

                {/* Add New */}
                <div className="pt-4 border-t border-hg-outline-variant/20 space-y-2">
                  <span className="text-xs font-medium text-hg-on-surface-variant">Add New Project</span>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={newProjectName}
                      onChange={(e) => {
                        setNewProjectName(e.target.value);
                        if (!newProjectSlug || newProjectSlug === nameToSlug(newProjectName)) {
                          setNewProjectSlug(nameToSlug(e.target.value));
                        }
                      }}
                      placeholder="Project name"
                      className="text-xs py-1.5"
                    />
                    <Input value={newProjectSlug} onChange={(e) => setNewProjectSlug(e.target.value)} placeholder="project-slug" className="font-mono text-xs py-1.5" />
                  </div>
                  <p className="text-[11px] text-hg-on-surface-variant">
                    Workspace: ~/.hourglass/projects/{newProjectSlug || 'slug'}/
                  </p>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleCreateProject} disabled={projectSaving || !newProjectName.trim() || !newProjectSlug.trim()}>
                      {projectSaving ? <Spinner className="h-3 w-3" /> : 'Create Project'}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'skills' && (
            <div className="rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-5 space-y-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-hg-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <h3 className="text-sm font-semibold text-hg-on-surface">Skills Directory</h3>
              </div>

              {skillsLoading ? (
                <div className="flex justify-center py-6"><Spinner className="h-5 w-5 text-hg-on-surface-variant" /></div>
              ) : (
                <>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-hg-on-surface-variant">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </span>
                      <Input
                        value={skillsDir}
                        onChange={(e) => setSkillsDir(e.target.value)}
                        placeholder={skillsDefaultDir || '~/.hourglass/skills'}
                        className="pl-9 text-xs py-1.5"
                      />
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setShowSkillsPicker(true)}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveSkillsDir} disabled={skillsSaving}>
                      {skillsSaving ? <Spinner className="h-3 w-3" /> : 'Save'}
                    </Button>
                    {skillsStatus?.configured && (
                      <Button variant="danger" size="sm" onClick={handleClearSkillsDir} disabled={skillsSaving}>Clear</Button>
                    )}
                  </div>

                  {/* Skills Status */}
                  {skillsStatus?.configured && (
                    <div className="pt-4 border-t border-hg-outline-variant/20 space-y-3">
                      {skillsStatus.valid ? (
                        <>
                          {skillsStatus.skills && skillsStatus.skills.skills.length > 0 && (
                            <div className="space-y-2">
                              {skillsStatus.skills.skills.map((skill) => (
                                <div key={skill} className="flex items-center justify-between py-2">
                                  <span className="text-sm text-hg-on-surface">{skill}</span>
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
                                    ACTIVE
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-hg-error rounded-full" />
                          <span className="text-sm text-hg-error">{skillsStatus.error || 'Invalid directory'}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {!skillsStatus?.configured && (
                    <div className="pt-4 border-t border-hg-outline-variant/20">
                      <p className="text-[11px] text-hg-on-surface-variant mb-2">Expected directory structure:</p>
                      <pre className="text-[11px] bg-hg-surface-container p-3 rounded-lg font-mono text-hg-on-surface-variant overflow-x-auto">
{`skills/
├── gmail/
│   └── SKILL.md
├── notion/
│   └── SKILL.md
└── slack/
    └── SKILL.md`}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'system' && (
            <>
              {/* Servers */}
              <div className="rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-hg-on-surface">Multi-server Mesh</h3>
                  <Button size="sm" onClick={() => setAddServerOpen(true)}>Add Server</Button>
                </div>
                <p className="text-xs text-hg-on-surface-variant">
                  Connect to remote Hourglass instances via Vibe protocol.
                </p>

                {servers.length === 0 ? (
                  <p className="text-xs text-hg-on-surface-variant/60 text-center py-4">No servers configured.</p>
                ) : (
                  <div className="space-y-2">
                    {servers.map((server) => (
                      <div
                        key={server.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          activeServer?.id === server.id
                            ? 'bg-hg-primary/5 border border-hg-primary/20'
                            : 'bg-hg-surface-container/50'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-hg-on-surface">{server.name}</span>
                            {activeServer?.id === server.id && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-hg-primary/10 text-hg-primary">Active</span>
                            )}
                          </div>
                          <div className="text-xs text-hg-on-surface-variant font-mono truncate">{server.url}</div>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          {activeServer?.id !== server.id && (
                            <Button variant="secondary" size="sm" onClick={() => switchServer(server.id)}>Switch</Button>
                          )}
                          <Button variant="danger" size="sm" onClick={() => { if (confirm(`Remove "${server.name}"?`)) removeServer(server.id); }}>Remove</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ===== RIGHT COLUMN: Always-visible sidebar cards ===== */}
        <div className="space-y-5">
          {/* API Credentials Card */}
          <div className="rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-5 space-y-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-hg-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <h3 className="text-sm font-semibold text-hg-on-surface">API Credentials</h3>
            </div>

            {loading ? (
              <div className="flex justify-center py-4"><Spinner className="h-5 w-5 text-hg-on-surface-variant" /></div>
            ) : (
              <>
                {/* Existing Keys */}
                {apiKeys.map((key) => (
                  <div key={key.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-hg-on-surface-variant">
                        {PROVIDERS.find((p) => p.value === key.provider)?.label || key.provider}
                      </span>
                      <button
                        onClick={() => handleDeleteKey(key.provider)}
                        className="text-[10px] text-hg-error hover:text-hg-error/80 cursor-pointer transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 rounded-lg bg-hg-surface-container text-sm font-mono text-hg-on-surface-variant truncate">
                        {revealedKeys.has(key.provider) ? key.apiKey : '••••••••••••••••••••••••'}
                      </div>
                      <button
                        onClick={() => toggleRevealKey(key.provider)}
                        className="p-2 text-hg-on-surface-variant hover:text-hg-on-surface cursor-pointer transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {revealedKeys.has(key.provider) ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          ) : (
                            <>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </>
                          )}
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add New Key */}
                <div className={`space-y-2 ${apiKeys.length > 0 ? 'pt-3 border-t border-hg-outline-variant/20' : ''}`}>
                  <span className="text-xs font-medium text-hg-on-surface-variant">Add Key</span>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full px-3 py-1.5 border border-hg-outline-variant/30 bg-hg-surface-container rounded-lg text-xs text-hg-on-surface outline-none focus:ring-2 focus:ring-hg-primary/50"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="sk-..."
                      className="flex-1 text-xs py-1.5"
                    />
                    <Button size="sm" onClick={handleSaveKey} disabled={saving || !apiKeyInput.trim()}>
                      {saving ? <Spinner className="h-3 w-3" /> : 'Save'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Skills Quick Status Card */}
          <div className="rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-5 space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-hg-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h3 className="text-sm font-semibold text-hg-on-surface">Skills Directory</h3>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 rounded-lg bg-hg-surface-container text-xs font-mono text-hg-on-surface-variant truncate">
                {skillsDir || skillsDefaultDir || '~/hourglass/skills'}
              </div>
              <button
                onClick={() => setActiveTab('skills')}
                className="p-2 text-hg-on-surface-variant hover:text-hg-on-surface cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
            </div>

            {skillsStatus?.configured && skillsStatus.valid && skillsStatus.skills && (
              <div className="space-y-1.5 pt-2 border-t border-hg-outline-variant/20">
                {skillsStatus.skills.skills.map((skill) => (
                  <div key={skill} className="flex items-center justify-between py-1">
                    <span className="text-xs text-hg-on-surface">{skill}</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">ACTIVE</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Server Connection Card */}
          <div className="rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-hg-on-surface">Multi-server Mesh</h3>
              <div className={`w-2 h-2 rounded-full ${activeServer ? 'bg-emerald-400' : 'bg-hg-outline-variant'}`} />
            </div>
            <p className="text-xs text-hg-on-surface-variant">
              Connect to remote Hourglass instances via Vibe protocol.
            </p>
            <div className="flex gap-2">
              <Input placeholder="vibe://88.192.x.x:4040" className="flex-1 text-xs" disabled />
              <button
                onClick={() => setActiveTab('system')}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-hg-primary text-white hover:opacity-90 transition-opacity cursor-pointer"
              >
                LINK
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <AddServerModal open={addServerOpen} onClose={() => setAddServerOpen(false)} />
      <Dialog open={showSkillsPicker} onClose={() => setShowSkillsPicker(false)} title="Select Skills Directory" className="max-w-3xl">
        <FileExplorer
          initialPath={skillsDir || skillsDefaultDir || '~'}
          mode="select-directory"
          onSelect={(path) => { setSkillsDir(path); setShowSkillsPicker(false); }}
          onCancel={() => setShowSkillsPicker(false)}
        />
      </Dialog>
    </div>
  );
}
