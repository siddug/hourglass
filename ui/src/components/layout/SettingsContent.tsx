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
import { Button, Input, Card, CardHeader, CardContent, Spinner, Dropdown, Dialog } from '@/components/ui';
import { useServer } from '@/contexts/ServerContext';
import { AddServerModal } from '@/components/layout/AddServerModal';
import { FileExplorer } from '@/components/chat/FileExplorer';

const PROVIDERS = [
  { value: 'mistral', label: 'Mistral AI' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
];

export function SettingsContent() {
  const { servers, activeServer, switchServer, removeServer } = useServer();
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add key form state
  const [provider, setProvider] = useState('mistral');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);

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

      // Also fetch status if configured
      if (config.globalDirectory) {
        const status = await getSkillsStatus();
        setSkillsStatus(status);
      } else {
        setSkillsStatus(null);
      }
    } catch (err) {
      // Ignore errors for skills config - it's optional
      console.error('Failed to fetch skills config:', err);
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
    if (!apiKeyInput.trim()) {
      setError('Please enter an API key');
      return;
    }

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
    if (!confirm(`Are you sure you want to delete the ${providerToDelete} API key?`)) {
      return;
    }

    try {
      await deleteApiKey(providerToDelete);
      fetchApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete API key');
    }
  };

  const handleSaveSkillsDir = async () => {
    setSkillsSaving(true);
    setError(null);

    try {
      await updateSkillsConfig(skillsDir.trim() || null);
      // Refresh status
      await fetchSkillsConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save skills directory');
    } finally {
      setSkillsSaving(false);
    }
  };

  // Personality handlers
  const handleCreatePersonality = async () => {
    if (!newPersonalityName.trim() || !newPersonalityReadableId.trim() || !newPersonalityInstructions.trim()) {
      setError('Please fill in all personality fields');
      return;
    }
    setPersonalitySaving(true);
    setError(null);
    try {
      await createPersonality({
        name: newPersonalityName.trim(),
        readableId: newPersonalityReadableId.trim(),
        instructions: newPersonalityInstructions.trim(),
      });
      setNewPersonalityName('');
      setNewPersonalityReadableId('');
      setNewPersonalityInstructions('');
      fetchPersonalities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create personality');
    } finally {
      setPersonalitySaving(false);
    }
  };

  const handleUpdatePersonality = async (id: string) => {
    if (!editPersonalityName.trim() || !editPersonalityReadableId.trim() || !editPersonalityInstructions.trim()) {
      setError('Please fill in all personality fields');
      return;
    }
    setPersonalitySaving(true);
    setError(null);
    try {
      await updatePersonality(id, {
        name: editPersonalityName.trim(),
        readableId: editPersonalityReadableId.trim(),
        instructions: editPersonalityInstructions.trim(),
      });
      setEditingPersonalityId(null);
      fetchPersonalities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update personality');
    } finally {
      setPersonalitySaving(false);
    }
  };

  const handleDeletePersonality = async (id: string, name: string) => {
    if (!confirm(`Delete personality "${name}"? This cannot be undone.`)) return;
    try {
      await deletePersonality(id);
      fetchPersonalities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete personality');
    }
  };

  const startEditPersonality = (p: Personality) => {
    setEditingPersonalityId(p.id);
    setEditPersonalityName(p.name);
    setEditPersonalityReadableId(p.readableId);
    setEditPersonalityInstructions(p.instructions);
  };

  // Project handlers
  const nameToSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !newProjectSlug.trim()) {
      setError('Please fill in all project fields');
      return;
    }
    setProjectSaving(true);
    setError(null);
    try {
      await createProject({
        name: newProjectName.trim(),
        projectSlug: newProjectSlug.trim(),
      });
      setNewProjectName('');
      setNewProjectSlug('');
      fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setProjectSaving(false);
    }
  };

  const handleDeleteProject = async (id: string, name: string) => {
    if (!confirm(`Archive project "${name}"? Sessions will be preserved.`)) return;
    try {
      await deleteProject(id);
      fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive project');
    }
  };

  const handleClearSkillsDir = async () => {
    setSkillsSaving(true);
    setError(null);

    try {
      await updateSkillsConfig(null);
      setSkillsDir('');
      setSkillsStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear skills directory');
    } finally {
      setSkillsSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Servers Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Servers</h2>
              <p className="text-sm text-gray-500 mt-1">
                Manage connected hourglass server instances. Paste a connection config string from a server&apos;s terminal output to add it.
              </p>
            </div>
            <Button size="sm" onClick={() => setAddServerOpen(true)}>
              Add Server
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {servers.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-4">
              No servers configured. Add a server to get started.
            </div>
          ) : (
            servers.map((server) => (
              <div
                key={server.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  activeServer?.id === server.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                    : 'bg-gray-50 dark:bg-gray-800'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{server.name}</span>
                    {activeServer?.id === server.id && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 font-mono truncate">{server.url}</div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {activeServer?.id !== server.id && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => switchServer(server.id)}
                    >
                      Switch
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Remove server "${server.name}"?`)) {
                        removeServer(server.id);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AddServerModal open={addServerOpen} onClose={() => setAddServerOpen(false)} />

      {/* API Keys Section */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">API Keys</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage API keys for external services. Keys are stored securely and used for session name generation and other features.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing Keys */}
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner className="h-5 w-5 text-gray-400" />
            </div>
          ) : apiKeys.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-500">Saved Keys</h3>
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div>
                    <div className="font-medium">
                      {PROVIDERS.find((p) => p.value === key.provider)?.label || key.provider}
                    </div>
                    <div className="text-sm text-gray-500 font-mono">{key.apiKey}</div>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteKey(key.provider)}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 text-sm py-4">
              No API keys saved yet
            </div>
          )}

          {/* Add New Key */}
          <div className="pt-4 border-t border-[var(--card-border)] space-y-3">
            <h3 className="text-sm font-medium text-gray-500">Add New Key</h3>
            <div className="flex gap-3 items-center">
              <Dropdown
                value={provider}
                onChange={setProvider}
                options={PROVIDERS}
                className="min-w-[140px] h-10"
              />
              <Input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Enter API key..."
                className="flex-1 h-10"
              />
              <Button onClick={handleSaveKey} disabled={saving || !apiKeyInput.trim()}>
                {saving ? <Spinner className="h-4 w-4" /> : 'Save'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Skills Directory Section */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Skills Directory</h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure a shared directory for skills/commands that will be linked to Claude Code and Vibe agents at session start.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {skillsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner className="h-5 w-5 text-gray-400" />
            </div>
          ) : (
            <>
              {/* Directory Input */}
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </span>
                    <Input
                      value={skillsDir}
                      onChange={(e) => setSkillsDir(e.target.value)}
                      placeholder={skillsDefaultDir || '~/.hourglass/skills'}
                      className="pl-9 h-10"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => setShowSkillsPicker(true)}
                    title="Browse filesystem"
                  >
                    Browse
                  </Button>
                  <Button
                    onClick={handleSaveSkillsDir}
                    disabled={skillsSaving}
                  >
                    {skillsSaving ? <Spinner className="h-4 w-4" /> : 'Save'}
                  </Button>
                  {skillsStatus?.configured && (
                    <Button
                      variant="danger"
                      onClick={handleClearSkillsDir}
                      disabled={skillsSaving}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Default: {skillsDefaultDir}
                </p>
              </div>

              {/* Skills Status */}
              {skillsStatus?.configured && (
                <div className="pt-4 border-t border-[var(--card-border)]">
                  {skillsStatus.valid ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">
                          Directory valid
                        </span>
                      </div>
                      {skillsStatus.skills && skillsStatus.skills.skills.length > 0 && (
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          <p>
                            Skills: {skillsStatus.skills.skills.join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                      <span className="text-sm text-red-700 dark:text-red-400">
                        {skillsStatus.error || 'Invalid directory'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Expected Structure Help */}
              {!skillsStatus?.configured && (
                <div className="pt-4 border-t border-[var(--card-border)]">
                  <p className="text-xs text-gray-500 mb-2">Expected directory structure:</p>
                  <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded font-mono overflow-x-auto">
{`skills/
├── gmail/
│   └── SKILL.md
├── notion/
│   └── SKILL.md
└── slack/
    └── SKILL.md`}
                  </pre>
                  <p className="text-xs text-gray-500 mt-2">
                    Each skill directory will be symlinked to both Claude Code and Vibe agent config directories.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Skills Directory Picker Dialog */}
      <Dialog
        open={showSkillsPicker}
        onClose={() => setShowSkillsPicker(false)}
        title="Select Skills Directory"
        className="max-w-3xl"
      >
        <FileExplorer
          initialPath={skillsDir || skillsDefaultDir || '~'}
          mode="select-directory"
          onSelect={(path) => {
            setSkillsDir(path);
            setShowSkillsPicker(false);
          }}
          onCancel={() => setShowSkillsPicker(false)}
        />
      </Dialog>

      {/* Personalities Section */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Personalities</h2>
          <p className="text-sm text-gray-500 mt-1">
            Agent personalities define identity, @readable-id, and soul instructions that get injected into the agent&apos;s prompt.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {personalitiesLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner className="h-5 w-5 text-gray-400" />
            </div>
          ) : personalities.length > 0 ? (
            <div className="space-y-2">
              {personalities.map((p) => (
                editingPersonalityId === p.id ? (
                  // Edit mode
                  <div key={p.id} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={editPersonalityName}
                        onChange={(e) => setEditPersonalityName(e.target.value)}
                        placeholder="Name (e.g. Mark)"
                        className="h-9"
                      />
                      <Input
                        value={editPersonalityReadableId}
                        onChange={(e) => setEditPersonalityReadableId(e.target.value)}
                        placeholder="@readable-id"
                        className="h-9 font-mono"
                      />
                    </div>
                    <textarea
                      value={editPersonalityInstructions}
                      onChange={(e) => setEditPersonalityInstructions(e.target.value)}
                      placeholder="Soul instructions..."
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingPersonalityId(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => handleUpdatePersonality(p.id)} disabled={personalitySaving}>
                        {personalitySaving ? <Spinner className="h-3 w-3" /> : 'Save'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Display mode
                  <div key={p.id} className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-sm text-orange-600 dark:text-orange-400 font-mono">{p.readableId}</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.instructions}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-3 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => startEditPersonality(p)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => handleDeletePersonality(p.id, p.name)}>Delete</Button>
                    </div>
                  </div>
                )
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 text-sm py-4">
              No personalities created yet
            </div>
          )}

          {/* Add New Personality */}
          <div className="pt-4 border-t border-[var(--card-border)] space-y-3">
            <h3 className="text-sm font-medium text-gray-500">Add New Personality</h3>
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
                className="h-10"
              />
              <Input
                value={newPersonalityReadableId}
                onChange={(e) => setNewPersonalityReadableId(e.target.value)}
                placeholder="@readable-id"
                className="h-10 font-mono"
              />
            </div>
            <textarea
              value={newPersonalityInstructions}
              onChange={(e) => setNewPersonalityInstructions(e.target.value)}
              placeholder="Soul instructions — define who this agent is, how it should behave, its expertise..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 min-h-[80px]"
            />
            <div className="flex justify-end">
              <Button onClick={handleCreatePersonality} disabled={personalitySaving || !newPersonalityName.trim() || !newPersonalityReadableId.trim() || !newPersonalityInstructions.trim()}>
                {personalitySaving ? <Spinner className="h-4 w-4" /> : 'Create Personality'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Projects Section */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Projects</h2>
          <p className="text-sm text-gray-500 mt-1">
            Shared project workspaces where multiple agents can collaborate. Each project gets a folder at ~/.hourglass/projects/.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {projectsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner className="h-5 w-5 text-gray-400" />
            </div>
          ) : projects.length > 0 ? (
            <div className="space-y-2">
              {projects.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        p.status === 'active'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 font-mono truncate mt-0.5">{p.workspacePath}</div>
                  </div>
                  <div className="flex items-center gap-1 ml-3 shrink-0">
                    <Button variant="danger" size="sm" onClick={() => handleDeleteProject(p.id, p.name)}>
                      Archive
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 text-sm py-4">
              No projects created yet
            </div>
          )}

          {/* Add New Project */}
          <div className="pt-4 border-t border-[var(--card-border)] space-y-3">
            <h3 className="text-sm font-medium text-gray-500">Add New Project</h3>
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
                className="h-10"
              />
              <Input
                value={newProjectSlug}
                onChange={(e) => setNewProjectSlug(e.target.value)}
                placeholder="project-slug"
                className="h-10 font-mono"
              />
            </div>
            <p className="text-xs text-gray-500">
              Workspace will be created at: ~/.hourglass/projects/{newProjectSlug || 'project-slug'}/
            </p>
            <div className="flex justify-end">
              <Button onClick={handleCreateProject} disabled={projectSaving || !newProjectName.trim() || !newProjectSlug.trim()}>
                {projectSaving ? <Spinner className="h-4 w-4" /> : 'Create Project'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
