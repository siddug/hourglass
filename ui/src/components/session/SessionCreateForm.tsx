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
import { ConnectorSelector } from '@/components/chat/ConnectorSelector';
import { ChatInput } from '@/components/chat/ChatInput';
import { Button, Input, Spinner, Dialog, Dropdown } from '@/components/ui';
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
  const [cronExpression, setCronExpression] = useState('0 9 * * *'); // Default: 9 AM daily
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

  // Common cron presets
  const cronPresets = [
    { label: 'Every minute', value: '* * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Every day at 9 AM', value: '0 9 * * *' },
    { label: 'Every day at midnight', value: '0 0 * * *' },
    { label: 'Weekdays at 9 AM', value: '0 9 * * 1-5' },
    { label: 'Every Sunday', value: '0 0 * * 0' },
    { label: 'First of month', value: '0 0 1 * *' },
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
      // Set default connector
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
      // Ignore - skills config is optional
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
      // Non-critical - personalities/projects are optional
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
    if (!startImmediately) {
      setSubmittingToTriage(true);
    }
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
      // Reset form state before calling callback to ensure clean dismissal
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
      // Reset form state
      setSubmittingSchedule(false);
      setShowScheduleOptions(false);
      onScheduledTaskCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create scheduled task');
      setSubmittingSchedule(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-8">
        <Spinner className="h-8 w-8 text-blue-600" />
      </div>
    );
  }

  // No servers configured — show add server form instead of session form
  if (servers.length === 0) {
    return (
      <div className="space-y-6 p-4">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">No Server Connected</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Add a hourglass server to get started with creating sessions.
          </p>
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Connection Config</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Paste the connection config string from your hourglass server terminal output.
            </p>
            <Input
              value={configString}
              onChange={(e) => {
                setConfigString(e.target.value);
                setValidated(null);
                setServerError(null);
              }}
              placeholder="vibe://eyJuYW1lIjoi..."
              className="font-mono text-sm"
            />
          </div>

          {serverError && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">
              {serverError}
            </div>
          )}

          {validated && (
            <div className="text-sm bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded border border-green-200 dark:border-green-800">
              <div className="font-medium text-green-700 dark:text-green-300">Server reachable</div>
              <div className="text-green-600 dark:text-green-400 mt-1">
                <span className="font-medium">{validated.name}</span>
                <span className="text-gray-500 ml-2">{validated.url}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {!validated ? (
              <Button onClick={handleValidateServer} disabled={validating || !configString.trim()}>
                {validating ? 'Validating...' : 'Validate'}
              </Button>
            ) : (
              <Button onClick={handleAddServer}>
                Add & Connect
              </Button>
            )}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium">How to get the connection config</h3>
          <ol className="text-xs text-gray-500 dark:text-gray-400 space-y-2 list-decimal list-inside">
            <li>
              Clone and set up the <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">hourglass server</code> repository
            </li>
            <li>
              Install dependencies with <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">npm install</code>
            </li>
            <li>
              Start the server with <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">npm run dev</code>
            </li>
            <li>
              Copy the <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">vibe://...</code> connection string printed in the terminal
            </li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Configuration Section */}
      <div className="space-y-4">
        {/* Working Directory */}
        <div>
          <label className="block text-sm font-medium mb-2">Working Directory</label>
          <WorkDirSelector value={workDir} onChange={setWorkDir} />
        </div>

        {/* Connector */}
        <ConnectorSelector
          connectors={connectors}
          value={connector}
          onChange={setConnector}
        />

        {/* Approval Mode Selector */}
        <div>
          <label className="block text-sm font-medium mb-2">Approval Mode</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setApprovalMode('manual')}
              className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors cursor-pointer ${
                approvalMode === 'manual'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="font-medium">Manual</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Approve each tool call
              </div>
            </button>
            <button
              type="button"
              onClick={() => setApprovalMode('auto')}
              className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors cursor-pointer ${
                approvalMode === 'auto'
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="font-medium">Auto Approve</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Approve all automatically
              </div>
            </button>
          </div>
        </div>

        {/* Agent Mode Selector */}
        <div>
          <label className="block text-sm font-medium mb-2">Agent Mode</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAgentMode('default')}
              className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors cursor-pointer ${
                agentMode === 'default'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="font-medium">Default</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Full agent capabilities
              </div>
            </button>
            <button
              type="button"
              onClick={() => setAgentMode('plan')}
              className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors cursor-pointer ${
                agentMode === 'plan'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="font-medium">Plan</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Read-only analysis mode
              </div>
            </button>
          </div>
        </div>

        {/* Personality & Project Selectors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Personality</label>
            <div className="flex gap-2">
              <Dropdown
                value={personalityId}
                onChange={setPersonalityId}
                options={[
                  { value: '', label: 'None' },
                  ...personalities.map((p) => ({ value: p.id, label: `${p.name} (${p.readableId})` })),
                ]}
                placeholder="Select personality..."
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setShowNewPersonality(true)}
                className="px-2 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors whitespace-nowrap"
              >
                + New
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Project</label>
            <div className="flex gap-2">
              <Dropdown
                value={projectId}
                onChange={setProjectId}
                options={[
                  { value: '', label: 'None' },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
                placeholder="Select project..."
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setShowNewProject(true)}
                className="px-2 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors whitespace-nowrap"
              >
                + New
              </button>
            </div>
          </div>
        </div>

        {/* Advanced Options Toggle */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Advanced Options
          </button>

          {showAdvanced && (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
              {/* Skills Directory */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Skills Directory
                  {globalSkillsDir && (
                    <span className="ml-2 text-xs font-normal text-gray-500">(from global settings)</span>
                  )}
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Override the global skills directory for this session. Leave empty to skip skill injection.
                </p>
                <WorkDirSelector value={skillsDirectory} onChange={setSkillsDirectory} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chat Input */}
      <div>
        <label className="block text-sm font-medium mb-2">Task</label>
        <ChatInput
          value={prompt}
          onChange={setPrompt}
          onSubmit={() => handleSubmit(true)}
          disabled={!connector || connectors.filter(c => c.status === 'available').length === 0}
          submitting={submitting || submittingSchedule}
          images={images}
          onImagesChange={setImages}
          placeholder="What would you like the agent to do? (Enter to send, Shift+Enter for new line)"
        />
      </div>

      {/* Schedule Options (shown when Schedule button is clicked) */}
      {showScheduleOptions && (
        <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900 dark:text-gray-100">Schedule Options</h3>
            <button
              type="button"
              onClick={() => setShowScheduleOptions(false)}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Schedule Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Schedule Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scheduleType"
                  value="cron"
                  checked={scheduleType === 'cron'}
                  onChange={() => setScheduleType('cron')}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Recurring (cron)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scheduleType"
                  value="once"
                  checked={scheduleType === 'once'}
                  onChange={() => setScheduleType('once')}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">One-time</span>
              </label>
            </div>
          </div>

          {/* Cron Expression or DateTime */}
          {scheduleType === 'cron' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Cron Expression
              </label>
              <Input
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 9 * * *"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {cronPresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setCronExpression(preset.value)}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                      cronExpression === preset.value
                        ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-300'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Format: minute hour day-of-month month day-of-week
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Run At
              </label>
              <Input
                type="datetime-local"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
              />
            </div>
          )}

          {/* Context Inheritance */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={inheritContext}
                onChange={(e) => setInheritContext(e.target.checked)}
                className="mt-1 text-blue-600"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Inherit context between runs
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Each execution will continue from the previous session's context (conversation history).
                </p>
              </div>
            </label>
          </div>

          {/* Create Schedule Button */}
          <div className="pt-2">
            <Button
              onClick={handleScheduleSubmit}
              disabled={!connector || !workDir || !prompt.trim() || submittingSchedule}
              className="w-full"
            >
              {submittingSchedule ? <Spinner className="h-4 w-4 mr-2" /> : null}
              Create Scheduled Task
            </Button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {(showCancelButton || showSaveToTriageButton || showScheduleButton) && (
        <div className="flex justify-end gap-2 pt-2">
          {showCancelButton && (
            <Button variant="ghost" onClick={onCancel} disabled={submitting || submittingSchedule}>
              Cancel
            </Button>
          )}
          {showScheduleButton && !showScheduleOptions && (
            <Button
              variant="secondary"
              onClick={() => setShowScheduleOptions(true)}
              disabled={!connector || !workDir || !prompt.trim() || submitting}
            >
              Schedule...
            </Button>
          )}
          {showSaveToTriageButton && (
            <Button
              variant="secondary"
              onClick={() => handleSubmit(false)}
              disabled={!connector || !workDir || !prompt.trim() || submitting || submittingSchedule}
            >
              {submittingToTriage ? <Spinner className="h-4 w-4 mr-2" /> : null}
              Save to Triage
            </Button>
          )}
          {showSaveToTriageButton && (
            <Button
              variant="primary"
              onClick={() => handleSubmit(true)}
              disabled={!connector || !workDir || !prompt.trim() || submitting || submittingSchedule}
            >
              {submitting && !submittingToTriage ? <Spinner className="h-4 w-4 mr-2" /> : null}
              Start Now
            </Button>
          )}
        </div>
      )}

      {/* Connectors Status */}
      {connectors.length > 0 && (
        <div className="pt-4 border-t border-[var(--card-border)]">
          <p className="text-xs text-gray-500 mb-2">Available Connectors:</p>
          <div className="flex flex-wrap gap-2">
            {connectors.map((c) => (
              <span
                key={c.name}
                className={`px-2 py-1 text-xs rounded-full ${
                  c.status === 'available'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                }`}
              >
                {c.displayName}
                {c.version && ` v${c.version}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* New Personality Dialog */}
      <Dialog open={showNewPersonality} onClose={() => setShowNewPersonality(false)} title="Create Personality">
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
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
              <label className="block text-sm font-medium mb-1">@ID</label>
              <Input
                value={newPReadableId}
                onChange={(e) => setNewPReadableId(e.target.value)}
                placeholder="@mark"
                className="font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Instructions</label>
            <textarea
              value={newPInstructions}
              onChange={(e) => setNewPInstructions(e.target.value)}
              placeholder="Define who this agent is, its expertise, behavior..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 min-h-[80px]"
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
              <label className="block text-sm font-medium mb-1">Name</label>
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
              <label className="block text-sm font-medium mb-1">Slug</label>
              <Input
                value={newPrSlug}
                onChange={(e) => setNewPrSlug(e.target.value)}
                placeholder="project-slug"
                className="font-mono"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
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
