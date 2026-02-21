import { describe, it, expect, vi } from 'vitest';
import { ApprovalService, createApprovalService, type ApprovalServiceMode } from './approval-service.js';

describe('ApprovalService', () => {
  describe('mode management', () => {
    it('should default to manual mode', () => {
      const service = new ApprovalService();
      expect(service.mode).toBe('manual');
      expect(service.isAutoApprove()).toBe(false);
    });

    it('should allow setting mode in constructor', () => {
      const service = new ApprovalService({ mode: 'auto' });
      expect(service.mode).toBe('auto');
      expect(service.isAutoApprove()).toBe(true);
    });

    it('should allow changing mode at runtime', () => {
      const service = new ApprovalService({ mode: 'manual' });
      expect(service.mode).toBe('manual');

      service.setMode('auto');
      expect(service.mode).toBe('auto');
      expect(service.isAutoApprove()).toBe(true);

      service.setMode('manual');
      expect(service.mode).toBe('manual');
      expect(service.isAutoApprove()).toBe(false);
    });

    it('should emit modeChanged event when mode changes', () => {
      const service = new ApprovalService();
      const callback = vi.fn();
      service.on('modeChanged', callback);

      service.setMode('auto');
      expect(callback).toHaveBeenCalledWith('auto', 'manual');

      service.setMode('manual');
      expect(callback).toHaveBeenCalledWith('manual', 'auto');
    });
  });

  describe('auto-approve mode', () => {
    it('should immediately approve in auto mode', async () => {
      const service = new ApprovalService({ mode: 'auto' });
      const autoApprovedCallback = vi.fn();
      service.on('autoApproved', autoApprovedCallback);

      const result = await service.requestApproval('test_tool', { foo: 'bar' });

      expect(result.status).toBe('approved');
      expect(result.reason).toBe('Auto-approved');
      expect(autoApprovedCallback).toHaveBeenCalled();
      expect(service.hasPending()).toBe(false);
    });

    it('should wait for user approval in manual mode', async () => {
      const service = new ApprovalService({ mode: 'manual' });
      const approvalRequestCallback = vi.fn();
      service.on('approvalRequest', approvalRequestCallback);

      // Start approval request (don't await yet)
      const approvalPromise = service.requestApproval('test_tool', { foo: 'bar' });

      // Give it a tick to set up
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have emitted the request
      expect(approvalRequestCallback).toHaveBeenCalled();
      expect(service.hasPending()).toBe(true);

      // Get the request ID
      const pendingApprovals = service.getPendingApprovals();
      expect(pendingApprovals.length).toBe(1);
      const requestId = pendingApprovals[0].requestId;

      // Respond to approval
      service.handleResponse({ requestId, status: 'approved' });

      // Now await the result
      const result = await approvalPromise;
      expect(result.status).toBe('approved');
      expect(service.hasPending()).toBe(false);
    });

    it('should switch from manual to auto mode during pending approval', async () => {
      const service = new ApprovalService({ mode: 'manual' });

      // Start approval request
      const approvalPromise = service.requestApproval('test_tool', { foo: 'bar' });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(service.hasPending()).toBe(true);

      // Switch to auto mode - existing pending should still need response
      service.setMode('auto');

      // But new requests should auto-approve
      const result2 = await service.requestApproval('another_tool', { bar: 'baz' });
      expect(result2.status).toBe('approved');
      expect(result2.reason).toBe('Auto-approved');

      // Original request still pending
      expect(service.hasPending()).toBe(true);

      // Clean up by responding to original
      const pendingApprovals = service.getPendingApprovals();
      service.handleResponse({ requestId: pendingApprovals[0].requestId, status: 'approved' });
      await approvalPromise;
    });
  });

  describe('createApprovalService helper', () => {
    it('should create service with default options', () => {
      const service = createApprovalService();
      expect(service.mode).toBe('manual');
    });

    it('should create service with custom mode', () => {
      const service = createApprovalService({ mode: 'auto' });
      expect(service.mode).toBe('auto');
    });
  });
});
