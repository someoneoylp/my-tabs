export function createActionManager(api) {
  let lastAction = null;

  return {
    async closeTabs(tabs, label) {
      const closableTabs = tabs.filter(tab => tab.id !== undefined && tab.url);
      const ids = closableTabs.map(tab => tab.id);
      await api.closeTabs(ids);
      lastAction = {
        type: 'close-tabs',
        label,
        tabs: closableTabs.map(tab => ({
          title: tab.title,
          url: tab.url,
          windowId: tab.windowId
        })),
        at: new Date().toISOString()
      };
      return { closed: ids.length, label };
    },

    canUndo() {
      return Boolean(lastAction);
    },

    getLastAction() {
      return lastAction;
    },

    async undoLastAction() {
      if (!lastAction) {
        return { restored: 0, failed: 0, message: '没有可撤销的操作' };
      }

      let restored = 0;
      let failed = 0;
      for (const tab of lastAction.tabs) {
        try {
          await api.createTab({ url: tab.url, windowId: tab.windowId, active: false });
          restored += 1;
        } catch {
          failed += 1;
        }
      }

      lastAction = null;
      return {
        restored,
        failed,
        message: failed > 0 ? `已恢复 ${restored} 个，失败 ${failed} 个` : `已恢复 ${restored} 个 Tab`
      };
    }
  };
}
