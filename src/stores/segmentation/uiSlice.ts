import type { SliceCreator, UiSlice } from './types';

export const createUiSlice: SliceCreator<UiSlice> = (set, get) => ({
  isLoading: false,
  loadingMessage: null,
  notice: null,
  errorModal: { isOpen: false, title: 'Error', message: '' },
  loginRequired: false,
  actionInfoPrompt: null,
  resetMaskConfirmOpen: false,

  setLoadingMessage: (loadingMessage) => set({ loadingMessage }),

  showNotice: (text, timeoutMs, key) => {
    const id = Date.now() + Math.random();
    set({ notice: { text, key, id } });
    if (timeoutMs !== undefined) {
      setTimeout(() => {
        if (get().notice?.id === id) set({ notice: null });
      }, timeoutMs);
    }
  },

  hideNotice: () => set({ notice: null }),

  showErrorModal: (message, title = 'Error') => set({ errorModal: { isOpen: true, title, message } }),
  hideErrorModal: () => set({ errorModal: { isOpen: false, title: 'Error', message: '' } }),

  requestLogin: () => set({ loginRequired: true, loadingMessage: null }),
  clearLoginRequest: () => set({ loginRequired: false }),

  openActionInfoPrompt: (action, targetImageId) => set({ actionInfoPrompt: { action, targetImageId } }),
  closeActionInfoPrompt: () => set({ actionInfoPrompt: null }),

  requestResetMask: () => set({ resetMaskConfirmOpen: true }),
  closeResetMaskConfirm: () => set({ resetMaskConfirmOpen: false }),
});
