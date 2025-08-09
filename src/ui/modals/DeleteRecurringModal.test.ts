/**
 * @file DeleteRecurringModal.test.ts
 * @brief Comprehensive tests for DeleteRecurringModal UI component
 */

import { App, ButtonComponent, Modal, Setting } from 'obsidian';
import { DeleteRecurringModal } from './DeleteRecurringModal';

// Mock Obsidian components
jest.mock(
  'obsidian',
  () => ({
    Modal: class {
      modalEl = {
        addClass: jest.fn(),
        removeClass: jest.fn()
      };
      contentEl = {
        createEl: jest.fn().mockReturnValue({
          setText: jest.fn(),
          addClass: jest.fn()
        }),
        empty: jest.fn()
      };
      constructor(app: any) {}
      open() {}
      close() {}
    },
    Setting: jest.fn().mockImplementation(() => ({
      setName: jest.fn().mockReturnThis(),
      setDesc: jest.fn().mockReturnThis(),
      addButton: jest.fn().mockReturnThis()
    })),
    ButtonComponent: class {
      setButtonText = jest.fn().mockReturnThis();
      setCta = jest.fn().mockReturnThis();
      onClick = jest.fn().mockReturnThis();
    },
    App: class {}
  }),
  { virtual: true }
);

const mockSetting = Setting as jest.MockedClass<typeof Setting>;
const mockButtonComponent = ButtonComponent as jest.MockedClass<typeof ButtonComponent>;

describe('DeleteRecurringModal', () => {
  let mockApp: App;
  let onPromote: jest.Mock;
  let onDeleteAll: jest.Mock;
  let onDeleteInstance: jest.Mock;

  beforeEach(() => {
    mockApp = new App();
    onPromote = jest.fn();
    onDeleteAll = jest.fn();
    onDeleteInstance = jest.fn();

    // Reset mocks
    jest.clearAllMocks();
    mockSetting.mockClear();
  });

  describe('constructor', () => {
    it('should initialize with required callbacks', () => {
      const modal = new DeleteRecurringModal(mockApp, onPromote, onDeleteAll);

      expect(modal).toBeInstanceOf(Modal);
      expect(modal).toBeInstanceOf(DeleteRecurringModal);
    });

    it('should initialize with optional instance deletion callback', () => {
      const modal = new DeleteRecurringModal(
        mockApp, 
        onPromote, 
        onDeleteAll, 
        onDeleteInstance, 
        '2024-01-15'
      );

      expect(modal).toBeInstanceOf(DeleteRecurringModal);
    });

    it('should initialize with Google calendar flag', () => {
      const modal = new DeleteRecurringModal(
        mockApp,
        onPromote,
        onDeleteAll,
        onDeleteInstance,
        '2024-01-15',
        true
      );

      expect(modal).toBeInstanceOf(DeleteRecurringModal);
    });
  });

  describe('onOpen', () => {
    it('should set up modal styling and title', () => {
      const modal = new DeleteRecurringModal(mockApp, onPromote, onDeleteAll);

      modal.onOpen();

      expect(modal.modalEl.addClass).toHaveBeenCalledWith('full-calendar-confirm-modal');
      expect(modal.contentEl.createEl).toHaveBeenCalledWith('h2', { text: 'Delete Recurring Event' });
      expect(modal.contentEl.createEl).toHaveBeenCalledWith('p', {
        text: 'This is a recurring event. What would you like to do with all of its future "override" instances (i.e., events that you have dragged or modified)?'
      });
    });

    it('should create delete instance setting when callback and date provided', () => {
      const modal = new DeleteRecurringModal(
        mockApp,
        onPromote,
        onDeleteAll,
        onDeleteInstance,
        '2024-01-15'
      );

      modal.onOpen();

      // Should have multiple settings created
      expect(mockSetting).toHaveBeenCalled();
      
      // Check if the setting was configured properly
      const settingInstances = mockSetting.mock.instances;
      const deleteInstanceSetting = settingInstances[0];
      
      expect(deleteInstanceSetting.setName).toHaveBeenCalledWith('Delete only this instance');
      expect(deleteInstanceSetting.setDesc).toHaveBeenCalledWith(
        'Delete only the instance on 2024-01-15. This will skip this date in the recurrence.'
      );
      expect(deleteInstanceSetting.addButton).toHaveBeenCalled();
    });

    it('should not create delete instance setting when no callback provided', () => {
      const modal = new DeleteRecurringModal(mockApp, onPromote, onDeleteAll);

      modal.onOpen();

      // Should still create settings, but not the delete instance one
      expect(mockSetting).toHaveBeenCalled();
      
      const settingInstances = mockSetting.mock.instances;
      // First setting should be promote (for non-Google) or delete all
      const firstSetting = settingInstances[0];
      expect(firstSetting.setName).not.toHaveBeenCalledWith('Delete only this instance');
    });

    it('should not create delete instance setting when no date provided', () => {
      const modal = new DeleteRecurringModal(
        mockApp,
        onPromote,
        onDeleteAll,
        onDeleteInstance
      );

      modal.onOpen();

      expect(mockSetting).toHaveBeenCalled();
      
      const settingInstances = mockSetting.mock.instances;
      const firstSetting = settingInstances[0];
      expect(firstSetting.setName).not.toHaveBeenCalledWith('Delete only this instance');
    });

    it('should create promote setting for non-Google calendars', () => {
      const modal = new DeleteRecurringModal(
        mockApp,
        onPromote,
        onDeleteAll,
        undefined,
        undefined,
        false
      );

      modal.onOpen();

      expect(mockSetting).toHaveBeenCalled();
      
      const settingInstances = mockSetting.mock.instances;
      const promoteSetting = settingInstances.find(instance => 
        instance.setName.mock.calls.some(call => call[0] === 'Promote child events')
      );
      
      expect(promoteSetting).toBeTruthy();
      expect(promoteSetting?.setDesc).toHaveBeenCalledWith(
        'Turn all overriden events (if any) into standalone, single events. They will no longer be linked to this recurring series.'
      );
    });

    it('should not create promote setting for Google calendars', () => {
      const modal = new DeleteRecurringModal(
        mockApp,
        onPromote,
        onDeleteAll,
        undefined,
        undefined,
        true
      );

      modal.onOpen();

      expect(mockSetting).toHaveBeenCalled();
      
      const settingInstances = mockSetting.mock.instances;
      const promoteSetting = settingInstances.find(instance => 
        instance.setName.mock.calls.some(call => call[0] === 'Promote child events')
      );
      
      expect(promoteSetting).toBeFalsy();
    });

    it('should always create delete all setting', () => {
      const modal = new DeleteRecurringModal(mockApp, onPromote, onDeleteAll);

      modal.onOpen();

      expect(mockSetting).toHaveBeenCalled();
      
      const settingInstances = mockSetting.mock.instances;
      const deleteAllSetting = settingInstances.find(instance => 
        instance.setName.mock.calls.some(call => call[0] === 'Delete child events')
      );
      
      expect(deleteAllSetting).toBeTruthy();
      expect(deleteAllSetting?.setDesc).toHaveBeenCalledWith(
        'Delete all future override events associated with this recurring series. This cannot be undone.'
      );
    });

    it('should always create cancel button', () => {
      const modal = new DeleteRecurringModal(mockApp, onPromote, onDeleteAll);

      modal.onOpen();

      expect(mockSetting).toHaveBeenCalled();
      
      const settingInstances = mockSetting.mock.instances;
      const cancelSetting = settingInstances[settingInstances.length - 1];
      expect(cancelSetting.addButton).toHaveBeenCalled();
    });
  });

  describe('button interactions', () => {
    let modal: DeleteRecurringModal;

    beforeEach(() => {
      modal = new DeleteRecurringModal(
        mockApp,
        onPromote,
        onDeleteAll,
        onDeleteInstance,
        '2024-01-15',
        false
      );

      // Mock the close method
      modal.close = jest.fn();
    });

    it('should handle delete instance button click', () => {
      modal.onOpen();

      // Find the button callback for delete instance
      const settingInstances = mockSetting.mock.instances;
      const deleteInstanceSetting = settingInstances[0];
      
      // Get the button callback
      const addButtonCall = deleteInstanceSetting.addButton.mock.calls[0];
      const buttonCallback = addButtonCall[0];
      
      // Create a mock button and call the callback
      const mockButton = new mockButtonComponent();
      buttonCallback(mockButton);
      
      // Simulate the onClick callback
      const onClickCall = mockButton.onClick.mock.calls[0];
      const clickCallback = onClickCall[0];
      clickCallback();

      expect(modal.close).toHaveBeenCalled();
      expect(onDeleteInstance).toHaveBeenCalled();
    });

    it('should handle promote button click', () => {
      modal.onOpen();

      // Find the promote setting (should be second for non-Google with instance deletion)
      const settingInstances = mockSetting.mock.instances;
      const promoteSetting = settingInstances.find(instance => 
        instance.setName.mock.calls.some(call => call[0] === 'Promote child events')
      );
      
      expect(promoteSetting).toBeTruthy();
      
      // Get the button callback
      const addButtonCall = promoteSetting!.addButton.mock.calls[0];
      const buttonCallback = addButtonCall[0];
      
      // Create a mock button and call the callback
      const mockButton = new mockButtonComponent();
      buttonCallback(mockButton);
      
      // Simulate the onClick callback
      const onClickCall = mockButton.onClick.mock.calls[0];
      const clickCallback = onClickCall[0];
      clickCallback();

      expect(modal.close).toHaveBeenCalled();
      expect(onPromote).toHaveBeenCalled();
    });

    it('should handle delete all button click', () => {
      modal.onOpen();

      // Find the delete all setting
      const settingInstances = mockSetting.mock.instances;
      const deleteAllSetting = settingInstances.find(instance => 
        instance.setName.mock.calls.some(call => call[0] === 'Delete child events')
      );
      
      expect(deleteAllSetting).toBeTruthy();
      
      // Get the button callback
      const addButtonCall = deleteAllSetting!.addButton.mock.calls[0];
      const buttonCallback = addButtonCall[0];
      
      // Create a mock button and call the callback
      const mockButton = new mockButtonComponent();
      buttonCallback(mockButton);
      
      // Simulate the onClick callback
      const onClickCall = mockButton.onClick.mock.calls[0];
      const clickCallback = onClickCall[0];
      clickCallback();

      expect(modal.close).toHaveBeenCalled();
      expect(onDeleteAll).toHaveBeenCalled();
    });

    it('should handle cancel button click', () => {
      modal.onOpen();

      // Find the cancel setting (should be last)
      const settingInstances = mockSetting.mock.instances;
      const cancelSetting = settingInstances[settingInstances.length - 1];
      
      // Get the button callback
      const addButtonCall = cancelSetting.addButton.mock.calls[0];
      const buttonCallback = addButtonCall[0];
      
      // Create a mock button and call the callback
      const mockButton = new mockButtonComponent();
      buttonCallback(mockButton);
      
      // Simulate the onClick callback
      const onClickCall = mockButton.onClick.mock.calls[0];
      const clickCallback = onClickCall[0];
      clickCallback();

      expect(modal.close).toHaveBeenCalled();
      expect(onPromote).not.toHaveBeenCalled();
      expect(onDeleteAll).not.toHaveBeenCalled();
      expect(onDeleteInstance).not.toHaveBeenCalled();
    });
  });

  describe('button configuration', () => {
    it('should configure delete instance button correctly', () => {
      const modal = new DeleteRecurringModal(
        mockApp,
        onPromote,
        onDeleteAll,
        onDeleteInstance,
        '2024-01-15'
      );

      modal.onOpen();

      // Find the delete instance button configuration
      const settingInstances = mockSetting.mock.instances;
      const deleteInstanceSetting = settingInstances[0];
      
      const addButtonCall = deleteInstanceSetting.addButton.mock.calls[0];
      const buttonCallback = addButtonCall[0];
      
      const mockButton = new mockButtonComponent();
      buttonCallback(mockButton);

      expect(mockButton.setButtonText).toHaveBeenCalledWith('Delete This Instance');
      expect(mockButton.setCta).toHaveBeenCalled();
      expect(mockButton.onClick).toHaveBeenCalled();
    });

    it('should configure promote button correctly', () => {
      const modal = new DeleteRecurringModal(
        mockApp,
        onPromote,
        onDeleteAll,
        undefined,
        undefined,
        false
      );

      modal.onOpen();

      const settingInstances = mockSetting.mock.instances;
      const promoteSetting = settingInstances.find(instance => 
        instance.setName.mock.calls.some(call => call[0] === 'Promote child events')
      );
      
      const addButtonCall = promoteSetting!.addButton.mock.calls[0];
      const buttonCallback = addButtonCall[0];
      
      const mockButton = new mockButtonComponent();
      buttonCallback(mockButton);

      expect(mockButton.setButtonText).toHaveBeenCalledWith('Promote Children');
      expect(mockButton.setCta).toHaveBeenCalled();
      expect(mockButton.onClick).toHaveBeenCalled();
    });

    it('should configure delete all button correctly', () => {
      const modal = new DeleteRecurringModal(mockApp, onPromote, onDeleteAll);

      modal.onOpen();

      const settingInstances = mockSetting.mock.instances;
      const deleteAllSetting = settingInstances.find(instance => 
        instance.setName.mock.calls.some(call => call[0] === 'Delete child events')
      );
      
      const addButtonCall = deleteAllSetting!.addButton.mock.calls[0];
      const buttonCallback = addButtonCall[0];
      
      const mockButton = new mockButtonComponent();
      buttonCallback(mockButton);

      expect(mockButton.setButtonText).toHaveBeenCalledWith('Delete Everything');
      expect(mockButton.setCta).toHaveBeenCalled();
      expect(mockButton.onClick).toHaveBeenCalled();
    });

    it('should configure cancel button correctly', () => {
      const modal = new DeleteRecurringModal(mockApp, onPromote, onDeleteAll);

      modal.onOpen();

      const settingInstances = mockSetting.mock.instances;
      const cancelSetting = settingInstances[settingInstances.length - 1];
      
      const addButtonCall = cancelSetting.addButton.mock.calls[0];
      const buttonCallback = addButtonCall[0];
      
      const mockButton = new mockButtonComponent();
      buttonCallback(mockButton);

      expect(mockButton.setButtonText).toHaveBeenCalledWith('Cancel');
      expect(mockButton.onClick).toHaveBeenCalled();
    });
  });

  describe('different modal configurations', () => {
    it('should handle Google calendar modal without promote option', () => {
      const modal = new DeleteRecurringModal(
        mockApp,
        onPromote,
        onDeleteAll,
        onDeleteInstance,
        '2024-01-15',
        true
      );

      modal.onOpen();

      const settingInstances = mockSetting.mock.instances;
      
      // Should have delete instance, delete all, and cancel (no promote)
      expect(settingInstances.length).toBe(3);
      
      // Verify no promote setting was created
      const promoteSettings = settingInstances.filter(instance => 
        instance.setName.mock.calls.some(call => call[0] === 'Promote child events')
      );
      expect(promoteSettings).toHaveLength(0);
    });

    it('should handle minimal configuration (only callbacks)', () => {
      const modal = new DeleteRecurringModal(mockApp, onPromote, onDeleteAll);

      modal.onOpen();

      const settingInstances = mockSetting.mock.instances;
      
      // Should have promote, delete all, and cancel (no delete instance)
      expect(settingInstances.length).toBe(3);
      
      // Verify delete instance setting was not created
      const deleteInstanceSettings = settingInstances.filter(instance => 
        instance.setName.mock.calls.some(call => call[0] === 'Delete only this instance')
      );
      expect(deleteInstanceSettings).toHaveLength(0);
    });

    it('should handle maximum configuration (all options)', () => {
      const modal = new DeleteRecurringModal(
        mockApp,
        onPromote,
        onDeleteAll,
        onDeleteInstance,
        '2024-01-15',
        false
      );

      modal.onOpen();

      const settingInstances = mockSetting.mock.instances;
      
      // Should have delete instance, promote, delete all, and cancel
      expect(settingInstances.length).toBe(4);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle missing instance date gracefully', () => {
      const modal = new DeleteRecurringModal(
        mockApp,
        onPromote,
        onDeleteAll,
        onDeleteInstance,
        undefined,
        false
      );

      expect(() => modal.onOpen()).not.toThrow();
      
      // Should not create delete instance setting
      const settingInstances = mockSetting.mock.instances;
      const deleteInstanceSettings = settingInstances.filter(instance => 
        instance.setName.mock.calls.some(call => call[0] === 'Delete only this instance')
      );
      expect(deleteInstanceSettings).toHaveLength(0);
    });

    it('should handle callback errors gracefully', () => {
      const faultyCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      const modal = new DeleteRecurringModal(
        mockApp,
        faultyCallback,
        onDeleteAll,
        onDeleteInstance,
        '2024-01-15'
      );

      modal.close = jest.fn();
      modal.onOpen();

      const settingInstances = mockSetting.mock.instances;
      const promoteSetting = settingInstances.find(instance => 
        instance.setName.mock.calls.some(call => call[0] === 'Promote child events')
      );
      
      const addButtonCall = promoteSetting!.addButton.mock.calls[0];
      const buttonCallback = addButtonCall[0];
      
      const mockButton = new mockButtonComponent();
      buttonCallback(mockButton);
      
      const onClickCall = mockButton.onClick.mock.calls[0];
      const clickCallback = onClickCall[0];

      // Should not throw when callback throws
      expect(() => clickCallback()).not.toThrow();
      expect(modal.close).toHaveBeenCalled();
    });

    it('should handle null/undefined callbacks', () => {
      const modal = new DeleteRecurringModal(
        mockApp,
        onPromote,
        onDeleteAll,
        undefined,
        '2024-01-15'
      );

      modal.onOpen();

      // Should not create delete instance setting when callback is undefined
      const settingInstances = mockSetting.mock.instances;
      const deleteInstanceSettings = settingInstances.filter(instance => 
        instance.setName.mock.calls.some(call => call[0] === 'Delete only this instance')
      );
      expect(deleteInstanceSettings).toHaveLength(0);
    });

    it('should handle date formatting edge cases', () => {
      const modal = new DeleteRecurringModal(
        mockApp,
        onPromote,
        onDeleteAll,
        onDeleteInstance,
        '2024-12-31', // Year-end date
        false
      );

      modal.onOpen();

      const settingInstances = mockSetting.mock.instances;
      const deleteInstanceSetting = settingInstances[0];
      
      expect(deleteInstanceSetting.setDesc).toHaveBeenCalledWith(
        'Delete only the instance on 2024-12-31. This will skip this date in the recurrence.'
      );
    });
  });

  describe('onClose', () => {
    it('should have onClose method available', () => {
      const modal = new DeleteRecurringModal(mockApp, onPromote, onDeleteAll);
      
      expect(modal.onClose).toBeDefined();
      expect(typeof modal.onClose).toBe('function');
    });

    it('should call onClose without errors', () => {
      const modal = new DeleteRecurringModal(mockApp, onPromote, onDeleteAll);
      
      expect(() => modal.onClose()).not.toThrow();
    });
  });
});