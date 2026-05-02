import { getContextMenuCapabilities } from './EventContextMenuBuilder';

jest.mock(
  'obsidian',
  () => ({
    Menu: class {},
    Notice: class {}
  }),
  { virtual: true }
);

jest.mock('../../features/i18n/i18n', () => ({
  t: (key: string) => key
}));

describe('EventContextMenuBuilder capabilities', () => {
  it('preserves generic task actions by default for existing providers', () => {
    expect(
      getContextMenuCapabilities({
        canCreate: true,
        canEdit: true,
        canDelete: true
      }).allowGenericTaskActions
    ).toBe(true);
  });

  it('omits generic task actions for providers with native task semantics', () => {
    expect(
      getContextMenuCapabilities({
        canCreate: false,
        canEdit: true,
        canDelete: true,
        contextMenu: {
          providesNativeTaskSemantics: true
        }
      }).allowGenericTaskActions
    ).toBe(false);
  });

  it('lets a provider explicitly override native-task generic action defaults', () => {
    expect(
      getContextMenuCapabilities({
        canCreate: false,
        canEdit: true,
        canDelete: true,
        contextMenu: {
          providesNativeTaskSemantics: true,
          allowGenericTaskActions: true
        }
      }).allowGenericTaskActions
    ).toBe(true);
  });
});
