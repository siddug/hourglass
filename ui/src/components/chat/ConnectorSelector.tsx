'use client';

import { type Connector } from '@/lib/api';
import { Dropdown, AILogo } from '@/components/ui';

interface ConnectorSelectorProps {
  connectors: Connector[];
  value: string;
  onChange: (value: string) => void;
}

function getConnectorIcon(connectorName: string) {
  return <AILogo provider={connectorName} className="w-5 h-5" />;
}

export function ConnectorSelector({ connectors, value, onChange }: ConnectorSelectorProps) {
  const options = connectors.length > 0
    ? connectors.map((connector) => ({
        value: connector.name,
        label: connector.status === 'available'
          ? connector.displayName
          : `${connector.displayName} (${connector.status.replace(/_/g, ' ')})`,
        icon: getConnectorIcon(connector.name),
      }))
    : [{ value: '', label: 'No connectors found' }];

  return (
    <div className="w-full">
      <label className="block text-sm font-medium mb-2">Connector</label>
      <Dropdown
        value={value}
        onChange={onChange}
        options={options}
        disabled={connectors.length === 0}
        className="w-full"
      />
    </div>
  );
}
