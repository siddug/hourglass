import type { BaseConnector, AvailabilityInfo } from './base.js';

/**
 * Connector Registry - Manages available connectors
 *
 * Provides:
 * - Connector registration and lookup
 * - Availability checking for all connectors
 * - Default connector selection
 */
export class ConnectorRegistry {
  private connectors = new Map<string, BaseConnector>();
  private defaultConnector: string | null = null;

  /**
   * Register a connector
   */
  register(connector: BaseConnector): this {
    this.connectors.set(connector.name, connector);

    // Set first connector as default if none set
    if (!this.defaultConnector) {
      this.defaultConnector = connector.name;
    }

    return this;
  }

  /**
   * Unregister a connector
   */
  unregister(name: string): boolean {
    const deleted = this.connectors.delete(name);

    // Update default if we deleted it
    if (deleted && this.defaultConnector === name) {
      this.defaultConnector = this.connectors.size > 0
        ? this.connectors.keys().next().value ?? null
        : null;
    }

    return deleted;
  }

  /**
   * Get a connector by name
   */
  get(name: string): BaseConnector | undefined {
    return this.connectors.get(name);
  }

  /**
   * Get the default connector
   */
  getDefault(): BaseConnector | undefined {
    if (!this.defaultConnector) return undefined;
    return this.connectors.get(this.defaultConnector);
  }

  /**
   * Set the default connector
   */
  setDefault(name: string): boolean {
    if (!this.connectors.has(name)) {
      return false;
    }
    this.defaultConnector = name;
    return true;
  }

  /**
   * Check if a connector is registered
   */
  has(name: string): boolean {
    return this.connectors.has(name);
  }

  /**
   * Get all registered connector names
   */
  names(): string[] {
    return Array.from(this.connectors.keys());
  }

  /**
   * Get all registered connectors
   */
  all(): BaseConnector[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Get the number of registered connectors
   */
  get size(): number {
    return this.connectors.size;
  }

  /**
   * Check availability of all registered connectors
   */
  async checkAllAvailability(): Promise<Map<string, AvailabilityInfo>> {
    const results = new Map<string, AvailabilityInfo>();

    await Promise.all(
      Array.from(this.connectors.entries()).map(async ([name, connector]) => {
        try {
          const info = await connector.checkAvailability();
          results.set(name, info);
        } catch (error) {
          results.set(name, {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })
    );

    return results;
  }

  /**
   * Get available connectors (those with status 'available')
   */
  async getAvailable(): Promise<BaseConnector[]> {
    const availability = await this.checkAllAvailability();
    const available: BaseConnector[] = [];

    for (const [name, info] of availability) {
      if (info.status === 'available') {
        const connector = this.connectors.get(name);
        if (connector) {
          available.push(connector);
        }
      }
    }

    return available;
  }

  /**
   * Clear all registered connectors
   */
  clear(): void {
    this.connectors.clear();
    this.defaultConnector = null;
  }
}

/**
 * Create a new connector registry
 */
export function createConnectorRegistry(): ConnectorRegistry {
  return new ConnectorRegistry();
}

/**
 * Global default registry instance
 */
export const defaultRegistry = new ConnectorRegistry();
