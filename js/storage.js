const Storage = {
  async getData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['mediaEntries', 'commonUrls', 'domainMaps', 'settings', 'tags', 'mediums'], (result) => {
        resolve({
          mediaEntries: result.mediaEntries || [],
          commonUrls: result.commonUrls || { novel: [], comic: [], anime: [] },
          domainMaps: result.domainMaps || {},
          settings: result.settings || { fontSize: 14 },
          tags: result.tags || [],
          mediums: result.mediums || []
        });
      });
    });
  },

  async getAll() {
    const data = await this.getData();
    return data.mediaEntries;
  },

  async save(entries) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ mediaEntries: entries }, () => {
        resolve();
      });
    });
  },

  async saveTags(tags) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ tags }, () => {
        resolve();
      });
    });
  },

  async saveMediums(mediums) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ mediums }, () => {
        resolve();
      });
    });
  },

  async saveCommonUrls(commonUrls) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ commonUrls }, () => {
        resolve();
      });
    });
  },

  async saveDomainMaps(domainMaps) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ domainMaps }, () => {
        resolve();
      });
    });
  },

  async saveSettings(settings) {
    const data = await this.getData();
    const newSettings = { ...data.settings, ...settings };
    return new Promise((resolve) => {
      chrome.storage.local.set({ settings: newSettings }, () => {
        resolve();
      });
    });
  },

  async add(entry, afterId = null) {
    const entries = await this.getAll();
    if (afterId) {
      const idx = entries.findIndex(e => e.id === afterId);
      if (idx !== -1) { entries.splice(idx + 1, 0, entry); }
      else { entries.unshift(entry); }
    } else {
      entries.unshift(entry);
    }
    await this.save(entries);
  },

  async update(id, updatedEntry) {
    let entries = await this.getAll();
    entries = entries.map(e => e.id === id ? { ...updatedEntry, id } : e);
    await this.save(entries);
  },

  async delete(id) {
    let entries = await this.getAll();
    entries = entries.filter(e => e.id !== id);
    await this.save(entries);
  }
};
