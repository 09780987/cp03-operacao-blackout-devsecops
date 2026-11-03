const removeItem = Storage.prototype.removeItem;

Storage.prototype.removeItem = function (key) {
  const storageKey = this === localStorage && key === 'shadowbytes_save' ? 'blackout_save' : key;
  return removeItem.call(this, storageKey);
};

await import('./blackout/assets/index-D5b49BWm.js');
