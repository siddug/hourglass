'use client';

import { useState } from 'react';
import { Dialog, Button, Input } from '@/components/ui';
import { parseConfigString } from '@/lib/servers';
import { fetchFromServer, type HealthResponse } from '@/lib/api';
import { useServer } from '@/contexts/ServerContext';

interface AddServerModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddServerModal({ open, onClose }: AddServerModalProps) {
  const { addServer, switchServer } = useServer();
  const [configString, setConfigString] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState<{ name: string; url: string } | null>(null);

  const handleValidate = async () => {
    setError(null);
    setValidated(null);

    if (!configString.trim()) {
      setError('Please paste a config string');
      return;
    }

    try {
      const parsed = parseConfigString(configString.trim());
      setValidating(true);

      // Validate by calling the server's health endpoint
      await fetchFromServer<HealthResponse>(parsed.url, parsed.authKey, '/api/health');

      setValidated({ name: parsed.name, url: parsed.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to validate server');
    } finally {
      setValidating(false);
    }
  };

  const handleAdd = () => {
    try {
      const parsed = parseConfigString(configString.trim());
      const config = addServer(parsed);
      switchServer(config.id);
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add server');
    }
  };

  const handleClose = () => {
    setConfigString('');
    setError(null);
    setValidated(null);
    setValidating(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} title="Add Server">
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Connection Config</label>
          <p className="text-xs text-gray-500 mb-2">
            Paste the connection config string from your hourglass server terminal output.
          </p>
          <Input
            value={configString}
            onChange={(e) => {
              setConfigString(e.target.value);
              setValidated(null);
              setError(null);
            }}
            placeholder="vibe://eyJuYW1lIjoi..."
            className="font-mono text-sm"
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">
            {error}
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

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          {!validated ? (
            <Button onClick={handleValidate} disabled={validating || !configString.trim()}>
              {validating ? 'Validating...' : 'Validate'}
            </Button>
          ) : (
            <Button onClick={handleAdd}>
              Add & Switch
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
