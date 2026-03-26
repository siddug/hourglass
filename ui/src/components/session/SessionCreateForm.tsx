'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getConnectors,
  createSession,
  createScheduledTask,
  fetchFromServer,
  getSkillsConfig,
  getPersonalities,
  getProjects,
  createPersonality,
  createProject,
  type Connector,
  type ApprovalMode,
  type AgentMode,
  type ImageData,
  type HealthResponse,
  type ScheduleType,
  type Personality,
  type Project,
} from '@/lib/api';
import { WorkDirSelector } from '@/components/chat/WorkDirSelector';
import { ChatInput } from '@/components/chat/ChatInput';
import { Button, Input, Spinner, Dialog, Dropdown, AILogo } from '@/components/ui';
import { useServer } from '@/contexts/ServerContext';
import { parseConfigString } from '@/lib/servers';

interface SessionCreateFormProps {
  onSessionCreated?: (sessionId: string, startedImmediately: boolean) => void;
  onScheduledTaskCreated?: () => void;
  onCancel?: () => void;
  showCancelButton?: boolean;
  showSaveToTriageButton?: boolean;
  showScheduleButton?: boolean;
  initialWorkDir?: string;
}

export function SessionCreateForm({
  onSessionCreated,
  onScheduledTaskCreated,
  onCancel,
  showCancelButton = false,
  showSaveToTriageButton = false,
  showScheduleButton = false,
  initialWorkDir,
}: SessionCreateFormProps) {
  const { servers, addServer, switchServer } = useServer();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add server form state
  const [configString, setConfigString] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState<{ name: string; url: string } | null>(null);

  // Form state
  const [workDir, setWorkDir] = useState(initialWorkDir || '~/Documents');
  const [connector, setConnector] = useState('');
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittingToTriage, setSubmittingToTriage] = useState(false);
  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('auto');
  const [agentMode, setAgentMode] = useState<AgentMode>('default');
  const [images, setImages] = useState<ImageData[]>([]);

  // Scheduling state
  const [showScheduleOptions, setShowScheduleOptions] = useState(false);
  const [scheduleType, setScheduleType] = useState<ScheduleType>('cron');
  const [cronExpression, setCronExpression] = useState('0 9 * * *');
  const [runAt, setRunAt] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [inheritContext, setInheritContext] = useState(false);

  // Personality & Project state
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [personalityId, setPersonalityId] = useState('');
  const [projectId, setProjectId] = useState('');

  // Inline creation dialogs
  const [showNewPersonality, setShowNewPersonality] = useState(false);
  const [newPName, setNewPName] = useState('');
  const [newPReadableId, setNewPReadableId] = useState('');
  const [newPInstructions, setNewPInstructions] = useState('');
  const [newPSaving, setNewPSaving] = useState(false);

  const [showNewProject, setShowNewProject] = useState(false);
  const [newPrName, setNewPrName] = useState('');
  const [newPrSlug, setNewPrSlug] = useState('');
  const [newPrSaving, setNewPrSaving] = useState(false);

  // Advanced options state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [skillsDirectory, setSkillsDirectory] = useState('');
  const [globalSkillsDir, setGlobalSkillsDir] = useState<string | null>(null);

  const cronPresets = [
    { label: 'Every minute', value: '* * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Daily 9 AM', value: '0 9 * * *' },
    { label: 'Midnight', value: '0 0 * * *' },
    { label: 'Weekdays 9 AM', value: '0 9 * * 1-5' },
    { label: 'Weekly', value: '0 0 * * 0' },
    { label: 'Monthly', value: '0 0 1 * *' },
  ];

  const handleValidateServer = async () => {
    setServerError(null);
    setValidated(null);
    if (!configString.trim()) {
      setServerError('Please paste a config string');
      return;
    }
    try {
      const parsed = parseConfigString(configString.trim());
      setValidating(true);
      await fetchFromServer<HealthResponse>(parsed.url, parsed.authKey, '/api/health');
      setValidated({ name: parsed.name, url: parsed.url });
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Failed to validate server');
    } finally {
      setValidating(false);
    }
  };

  const handleAddServer = () => {
    try {
      const parsed = parseConfigString(configString.trim());
      const config = addServer(parsed);
      switchServer(config.id);
      setConfigString('');
      setServerError(null);
      setValidated(null);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Failed to add server');
    }
  };

  const fetchConnectors = useCallback(async () => {
    try {
      setError(null);
      const connectorsRes = await getConnectors();
      setConnectors(connectorsRes.connectors);
      const available = connectorsRes.connectors.filter((c) => c.status === 'available');
      if (available.length > 0 && !connector) {
        const claude = available.find((c) => c.name === 'claude');
        setConnector(claude ? claude.name : available[0].name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch connectors');
    } finally {
      setLoading(false);
    }
  }, [connector]);

  const fetchSkillsConfig = useCallback(async () => {
    try {
      const config = await getSkillsConfig();
      if (config.globalDirectory) {
        setGlobalSkillsDir(config.globalDirectory);
        setSkillsDirectory(config.globalDirectory);
      }
    } catch {
      // Skills config is optional
    }
  }, []);

  const fetchPersonalitiesAndProjects = useCallback(async () => {
    try {
      const [personalitiesRes, projectsRes] = await Promise.all([
        getPersonalities({ limit: 100 }),
        getProjects({ status: 'active', limit: 100 }),
      ]);
      setPersonalities(personalitiesRes.personalities);
      setProjects(projectsRes.projects);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    if (servers.length > 0) {
      fetchConnectors();
      fetchSkillsConfig();
      fetchPersonalitiesAndProjects();
    } else {
      setLoading(false);
    }
  }, [fetchConnectors, fetchSkillsConfig, fetchPersonalitiesAndProjects, servers.length]);

  const nameToSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleCreateNewPersonality = async () => {
    if (!newPName.trim() || !newPReadableId.trim() || !newPInstructions.trim()) return;
    setNewPSaving(true);
    try {
      const created = await createPersonality({
        name: newPName.trim(),
        readableId: newPReadableId.trim(),
        instructions: newPInstructions.trim(),
      });
      await fetchPersonalitiesAndProjects();
      setPersonalityId(created.id);
      setShowNewPersonality(false);
      setNewPName('');
      setNewPReadableId('');
      setNewPInstructions('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create personality');
    } finally {
      setNewPSaving(false);
    }
  };

  const handleCreateNewProject = async () => {
    if (!newPrName.trim() || !newPrSlug.trim()) return;
    setNewPrSaving(true);
    try {
      const created = await createProject({
        name: newPrName.trim(),
        projectSlug: newPrSlug.trim(),
      });
      await fetchPersonalitiesAndProjects();
      setProjectId(created.id);
      setShowNewProject(false);
      setNewPrName('');
      setNewPrSlug('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setNewPrSaving(false);
    }
  };

  const handleSubmit = async (startImmediately: boolean = true) => {
    if (!connector || !workDir || (!prompt.trim() && images.length === 0)) {
      setError('Please fill in all fields');
      return;
    }
    setSubmitting(true);
    if (!startImmediately) setSubmittingToTriage(true);
    setError(null);

    try {
      const session = await createSession({
        connector,
        workDir,
        prompt: prompt.trim(),
        startImmediately,
        enableApprovals: true,
        approvalMode,
        agentMode,
        images: images.length > 0 ? images : undefined,
        skillsDirectory: skillsDirectory.trim() || undefined,
        personalityId: personalityId || undefined,
        projectId: projectId || undefined,
      });
      setSubmitting(false);
      setSubmittingToTriage(false);
      onSessionCreated?.(session.id, startImmediately);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      setSubmitting(false);
      setSubmittingToTriage(false);
    }
  };

  const handleScheduleSubmit = async () => {
    if (!connector || !workDir || !prompt.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (scheduleType === 'cron' && !cronExpression) {
      setError('Please enter a cron expression');
      return;
    }
    if (scheduleType === 'once' && !runAt) {
      setError('Please select a date and time');
      return;
    }
    setSubmittingSchedule(true);
    setError(null);

    try {
      await createScheduledTask({
        prompt: prompt.trim(),
        connector,
        workDir,
        scheduleType,
        cronExpression: scheduleType === 'cron' ? cronExpression : undefined,
        runAt: scheduleType === 'once' ? new Date(runAt).toISOString() : undefined,
        timezone,
        inheritContext,
        agentMode,
        approvalMode,
        personalityId: personalityId || undefined,
        projectId: projectId || undefined,
      });
      setSubmittingSchedule(false);
      setShowScheduleOptions(false);
      onScheduledTaskCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create scheduled task');
      setSubmittingSchedule(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <Spinner className="h-8 w-8 text-hg-primary" />
      </div>
    );
  }

  // No server state
  if (servers.length === 0) {
    return (
      <div className="max-w-lg mx-auto space-y-6 p-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-hg-on-surface">No Server Connected</h2>
          <p className="text-sm text-hg-on-surface-variant">
            Add a hourglass server to get started.
          </p>
        </div>

        <div className="rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-5 space-y-4">
          <div>
            <label className="font-label text-hg-on-surface-variant mb-2 block">Connection Config</label>
            <Input
              value={configString}
              onChange={(e) => { setConfigString(e.target.value); setValidated(null); setServerError(null); }}
              placeholder="vibe://eyJuYW1lIjoi..."
              className="font-mono text-sm"
            />
          </div>

          {serverError && (
            <div className="text-sm text-hg-error bg-hg-error/10 px-3 py-2 rounded-lg">
              {serverError}
            </div>
          )}

          {validated && (
            <div className="text-sm bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/20">
              <div className="font-medium text-emerald-600 dark:text-emerald-400">Server reachable</div>
              <div className="text-hg-on-surface-variant mt-1">
                <span className="font-medium">{validated.name}</span>
                <span className="ml-2 opacity-60">{validated.url}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {!validated ? (
              <Button onClick={handleValidateServer} disabled={validating || !configString.trim()}>
                {validating ? 'Validating...' : 'Validate'}
              </Button>
            ) : (
              <Button onClick={handleAddServer}>Add & Connect</Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const availableConnectors = connectors.filter((c) => c.status === 'available');

  // Main form — bento grid layout
  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-hg-on-surface">Initialize Session</h1>
          <p className="text-sm text-hg-on-surface-variant font-mono mt-1">
            workspace: {workDir}
          </p>
        </div>
        {showCancelButton && (
          <Button variant="ghost" onClick={onCancel} disabled={submitting || submittingSchedule}>
            Cancel
          </Button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-hg-error/10 border border-hg-error/20 rounded-xl text-hg-error text-sm">
          {error}
        </div>
      )}

      {/* Bento Grid: Left (prompt + config) | Right (execution params) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* ===== LEFT COLUMN ===== */}
        <div className="space-y-5">
          {/* Primary Directive Card */}
          <div className="rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-label text-hg-on-surface-variant">Primary Directive</span>
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Ready for input
              </span>
            </div>
            <ChatInput
              value={prompt}
              onChange={setPrompt}
              onSubmit={() => handleSubmit(true)}
              disabled={!connector || availableConnectors.length === 0}
              submitting={submitting || submittingSchedule}
              images={images}
              onImagesChange={setImages}
              placeholder="What are we building today? Describe the objective, edge cases, and constraints..."
            />
          </div>

          {/* Bottom Row: Connector + Working Dir/Project */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Connector Card */}
            <div className="rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-5">
              <span className="font-label text-hg-on-surface-variant mb-3 block">Preferred Agentic Connector</span>
              <div className="space-y-2">
                {availableConnectors.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setConnector(c.name)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                      connector === c.name
                        ? 'border-hg-primary/40 bg-hg-primary/5'
                        : 'border-hg-outline-variant/20 hover:border-hg-outline-variant/40'
                    }`}
                  >
                    <AILogo provider={c.name} className="w-6 h-6" />
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-hg-on-surface">{c.displayName}</div>
                      {c.version && (
                        <div className="text-[10px] text-hg-on-surface-variant">{c.version}</div>
                      )}
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      c.status === 'available'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-hg-surface-container-high text-hg-on-surface-variant'
                    }`}>
                      {c.status === 'available' ? 'Online' : 'Offline'}
                    </span>
                  </button>
                ))}
                {availableConnectors.length === 0 && (
                  <p className="text-xs text-hg-on-surface-variant/60 text-center py-4">
                    No connectors available
                  </p>
                )}
              </div>
            </div>

            {/* Working Directory + Project Card */}
            <div className="rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-5 space-y-4">
              <div>
                <span className="font-label text-hg-on-surface-variant mb-2 block">Working Directory</span>
                <WorkDirSelector value={workDir} onChange={setWorkDir} />
              </div>
              <div>
                <span className="font-label text-hg-on-surface-variant mb-2 block">Project Context</span>
                <Dropdown
                  value={projectId}
                  onChange={setProjectId}
                  options={[
                    { value: '', label: 'None' },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  placeholder="Select project..."
                  className="w-full"
                />
                <button
                  type="button"
                  onClick={() => setShowNewProject(true)}
                  className="mt-1.5 text-[11px] text-hg-primary hover:text-hg-primary/80 transition-colors"
                >
                  + Create new project
                </button>
              </div>
            </div>
          </div>

          {/* Schedule Options (expandable) */}
          {showScheduleOptions && (
            <div className="rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-label text-hg-on-surface-variant">Schedule Options</span>
                <button
                  type="button"
                  onClick={() => setShowScheduleOptions(false)}
                  className="text-hg-on-surface-variant hover:text-hg-on-surface cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Schedule Type */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-hg-on-surface">
                  <input
                    type="radio"
                    name="scheduleType"
                    value="cron"
                    checked={scheduleType === 'cron'}
                    onChange={() => setScheduleType('cron')}
                    className="accent-[var(--hg-primary)]"
                  />
                  Recurring (cron)
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-hg-on-surface">
                  <input
                    type="radio"
                    name="scheduleType"
                    value="once"
                    checked={scheduleType === 'once'}
                    onChange={() => setScheduleType('once')}
                    className="accent-[var(--hg-primary)]"
                  />
                  One-time
                </label>
              </div>

              {scheduleType === 'cron' ? (
                <div>
                  <Input
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    placeholder="0 9 * * *"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {cronPresets.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setCronExpression(preset.value)}
                        className={`px-2 py-1 text-[10px] rounded-md border transition-colors cursor-pointer ${
                          cronExpression === preset.value
                            ? 'bg-hg-primary/10 border-hg-primary/30 text-hg-primary'
                            : 'border-hg-outline-variant/30 text-hg-on-surface-variant hover:border-hg-outline-variant'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <Input
                  type="datetime-local"
                  value={runAt}
                  onChange={(e) => setRunAt(e.target.value)}
                />
              )}

              <label className="flex items-start gap-3 cursor-pointer border-t border-hg-outline-variant/20 pt-4">
                <input
                  type="checkbox"
                  checked={inheritContext}
                  onChange={(e) => setInheritContext(e.target.checked)}
                  className="mt-1 accent-[var(--hg-primary)]"
                />
                <div>
                  <span className="text-sm font-medium text-hg-on-surface">Inherit context between runs</span>
                  <p className="text-[11px] text-hg-on-surface-variant mt-0.5">
                    Each execution continues from the previous session's context.
                  </p>
                </div>
              </label>

              <Button
                onClick={handleScheduleSubmit}
                disabled={!connector || !workDir || !prompt.trim() || submittingSchedule}
                className="w-full"
              >
                {submittingSchedule ? <Spinner className="h-4 w-4 mr-2" /> : null}
                Create Scheduled Task
              </Button>
            </div>
          )}
        </div>

        {/* ===== RIGHT COLUMN: Execution Parameters ===== */}
        <div className="space-y-5">
          <div className="rounded-xl border border-hg-outline-variant/30 bg-hg-surface-container-low p-5 space-y-5">
            <h3 className="text-sm font-semibold text-hg-on-surface">Execution Parameters</h3>

            {/* Personality Mask */}
            <div>
              <span className="font-label text-hg-on-surface-variant mb-2 block">Personality Mask</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPersonalityId('')}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors cursor-pointer ${
                    !personalityId
                      ? 'bg-hg-primary/10 border-hg-primary/30 text-hg-primary'
                      : 'border-hg-outline-variant/30 text-hg-on-surface-variant hover:border-hg-outline-variant'
                  }`}
                >
                  None
                </button>
                {personalities.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPersonalityId(p.id)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors cursor-pointer ${
                      personalityId === p.id
                        ? 'bg-hg-primary/10 border-hg-primary/30 text-hg-primary'
                        : 'border-hg-outline-variant/30 text-hg-on-surface-variant hover:border-hg-outline-variant'
                    }`}
                  >
                    @{p.readableId}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowNewPersonality(true)}
                  className="px-3 py-1.5 text-xs rounded-full border border-dashed border-hg-outline-variant/30 text-hg-on-surface-variant hover:border-hg-primary/30 hover:text-hg-primary transition-colors cursor-pointer"
                >
                  + New
                </button>
              </div>
            </div>

            {/* Agent Mode */}
            <div>
              <span className="font-label text-hg-on-surface-variant mb-2 block">Agent Mode</span>
              <p className="text-[11px] text-hg-on-surface-variant/70 mb-2">Deep multi-step analysis and planning</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAgentMode('default')}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    agentMode === 'default'
                      ? 'border-hg-primary/40 bg-hg-primary/10 text-hg-primary'
                      : 'border-hg-outline-variant/30 text-hg-on-surface-variant hover:border-hg-outline-variant'
                  }`}
                >
                  Default
                </button>
                <button
                  type="button"
                  onClick={() => setAgentMode('plan')}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    agentMode === 'plan'
                      ? 'border-hg-tertiary/40 bg-hg-tertiary/10 text-hg-tertiary'
                      : 'border-hg-outline-variant/30 text-hg-on-surface-variant hover:border-hg-outline-variant'
                  }`}
                >
                  Plan
                </button>
              </div>
            </div>

            {/* Approval Mode */}
            <div>
              <span className="font-label text-hg-on-surface-variant mb-2 block">Approval Mode</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setApprovalMode('manual')}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    approvalMode === 'manual'
                      ? 'border-hg-primary/40 bg-hg-primary/10 text-hg-primary'
                      : 'border-hg-outline-variant/30 text-hg-on-surface-variant hover:border-hg-outline-variant'
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setApprovalMode('auto')}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    approvalMode === 'auto'
                      ? 'border-hg-primary/40 bg-hg-primary/10 text-hg-primary'
                      : 'border-hg-outline-variant/30 text-hg-on-surface-variant hover:border-hg-outline-variant'
                  }`}
                >
                  Auto
                </button>
              </div>
            </div>

            {/* Advanced Options Toggle */}
            <div className="border-t border-hg-outline-variant/20 pt-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-[11px] text-hg-on-surface-variant hover:text-hg-on-surface flex items-center gap-1 transition-colors"
              >
                <svg
                  className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Advanced Options
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-3">
                  <div>
                    <span className="font-label text-hg-on-surface-variant mb-1 block">
                      Skills Directory
                      {globalSkillsDir && (
                        <span className="ml-1 normal-case tracking-normal font-normal opacity-60">(global)</span>
                      )}
                    </span>
                    <WorkDirSelector value={skillsDirectory} onChange={setSkillsDirectory} />
                  </div>
                </div>
              )}
            </div>

            {/* Initiate Session Button */}
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={!connector || !workDir || (!prompt.trim() && images.length === 0) || submitting || submittingSchedule}
              className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white bg-hg-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer"
            >
              {submitting && !submittingToTriage ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner className="h-4 w-4" />
                  Initiating...
                </span>
              ) : (
                'INITIATE SESSION'
              )}
            </button>

            {/* Secondary actions */}
            {(showSaveToTriageButton || showScheduleButton) && (
              <div className="flex gap-2">
                {showScheduleButton && !showScheduleOptions && (
                  <button
                    type="button"
                    onClick={() => setShowScheduleOptions(true)}
                    disabled={!connector || !workDir || !prompt.trim() || submitting}
                    className="flex-1 py-2 px-3 text-xs rounded-lg border border-hg-outline-variant/30 text-hg-on-surface-variant hover:border-hg-outline-variant disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    Schedule...
                  </button>
                )}
                {showSaveToTriageButton && (
                  <button
                    type="button"
                    onClick={() => handleSubmit(false)}
                    disabled={!connector || !workDir || !prompt.trim() || submitting || submittingSchedule}
                    className="flex-1 py-2 px-3 text-xs rounded-lg border border-hg-outline-variant/30 text-hg-on-surface-variant hover:border-hg-outline-variant disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    {submittingToTriage ? <Spinner className="h-3 w-3 mr-1 inline" /> : null}
                    Save to Triage
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Personality Dialog */}
      <Dialog open={showNewPersonality} onClose={() => setShowNewPersonality(false)} title="Create Personality">
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-label text-hg-on-surface-variant mb-1 block">Name</label>
              <Input
                value={newPName}
                onChange={(e) => {
                  setNewPName(e.target.value);
                  if (!newPReadableId || newPReadableId === `@${nameToSlug(newPName)}`) {
                    setNewPReadableId(`@${nameToSlug(e.target.value)}`);
                  }
                }}
                placeholder="e.g. Mark"
              />
            </div>
            <div>
              <label className="font-label text-hg-on-surface-variant mb-1 block">@ID</label>
              <Input
                value={newPReadableId}
                onChange={(e) => setNewPReadableId(e.target.value)}
                placeholder="@mark"
                className="font-mono"
              />
            </div>
          </div>
          <div>
            <label className="font-label text-hg-on-surface-variant mb-1 block">Instructions</label>
            <textarea
              value={newPInstructions}
              onChange={(e) => setNewPInstructions(e.target.value)}
              placeholder="Define who this agent is, its expertise, behavior..."
              className="w-full px-3 py-2 text-sm border border-hg-outline-variant/30 rounded-lg bg-hg-surface-container text-hg-on-surface focus:ring-2 focus:ring-hg-primary/50 focus:border-hg-primary/50 min-h-[80px] outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowNewPersonality(false)}>Cancel</Button>
            <Button onClick={handleCreateNewPersonality} disabled={newPSaving || !newPName.trim() || !newPReadableId.trim() || !newPInstructions.trim()}>
              {newPSaving ? <Spinner className="h-4 w-4" /> : 'Create'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* New Project Dialog */}
      <Dialog open={showNewProject} onClose={() => setShowNewProject(false)} title="Create Project">
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-label text-hg-on-surface-variant mb-1 block">Name</label>
              <Input
                value={newPrName}
                onChange={(e) => {
                  setNewPrName(e.target.value);
                  if (!newPrSlug || newPrSlug === nameToSlug(newPrName)) {
                    setNewPrSlug(nameToSlug(e.target.value));
                  }
                }}
                placeholder="Project name"
              />
            </div>
            <div>
              <label className="font-label text-hg-on-surface-variant mb-1 block">Slug</label>
              <Input
                value={newPrSlug}
                onChange={(e) => setNewPrSlug(e.target.value)}
                placeholder="project-slug"
                className="font-mono"
              />
            </div>
          </div>
          <p className="text-xs text-hg-on-surface-variant">
            Workspace: ~/.hourglass/projects/{newPrSlug || 'slug'}/
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowNewProject(false)}>Cancel</Button>
            <Button onClick={handleCreateNewProject} disabled={newPrSaving || !newPrName.trim() || !newPrSlug.trim()}>
              {newPrSaving ? <Spinner className="h-4 w-4" /> : 'Create'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
