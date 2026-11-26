import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSegmentationStore } from './index';
import { MaskHistory } from '../../segmentation/mask/history';
import { encodeMasks } from '../../segmentation/mask/codec';
import { NO_LABEL } from '../../segmentation/mask/MaskDocument';
import type { ProjectConfig } from '../../types/iris';

const W = 4, H = 3, N = W * H;

const bytesResponse = (bytes: Uint8Array, status = 200) =>
  new Response(bytes as BodyInit, { status, headers: { 'Content-Type': 'application/octet-stream' } });

function setUp() {
  useSegmentationStore.setState({
    maskDocument: null,
    maskDimensions: { width: W, height: H },
    maskHistory: new MaskHistory(), canUndo: false, canRedo: false,
    isLoading: false, maskChanged: false, showDialogueBeforeNextImage: false,
    confusionMatrix: null, predictionRevision: null, loginRequired: false,
    loadingMessage: null, notice: null,
    errorModal: { isOpen: false, title: 'Error', message: '' },
    currentImageId: 'img',
    config: { segmentation: { ai_model: { train_ratio: 0.5, max_train_pixels: 1000 } } } as unknown as ProjectConfig,
  });
  useSegmentationStore.getState().setClasses([
    { name: 'a', colour: [0, 0, 0, 255] },
    { name: 'b', colour: [255, 0, 0, 255] },
  ]);
}

describe('mask store actions', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setUp();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads a saved mask', async () => {
    const final = new Uint8Array(N).fill(1);
    const user = new Uint8Array(N);
    user[0] = 1;
    fetchMock.mockResolvedValue(bytesResponse(encodeMasks(final, user)));
    await useSegmentationStore.getState().loadMaskForImage('img');
    const s = useSegmentationStore.getState();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/images/img/mask');
    expect(Array.from(s.maskDocument!.final)).toEqual(Array.from(final));
    expect(s.userPixelCounts).toEqual({ 0: 0, 1: 1, total: 1 });
    expect(s.maskChanged).toBe(false);
    expect(s.canUndo).toBe(false);
    expect(s.loadingMessage).toBeNull();
  });

  it('starts from an empty mask when the user has none (404)', async () => {
    fetchMock.mockResolvedValue(new Response('No user mask available!', { status: 404 }));
    await useSegmentationStore.getState().loadMaskForImage('img');
    const s = useSegmentationStore.getState();
    expect(Array.from(s.maskDocument!.user)).toEqual(new Array(N).fill(0));
    // Not class 0, which would show the whole image in its colour
    expect(Array.from(s.maskDocument!.final)).toEqual(new Array(N).fill(NO_LABEL));
    expect(s.errorModal.isOpen).toBe(false);
  });

  it('asks for login when the session has expired (403)', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 403 }));
    await useSegmentationStore.getState().loadMaskForImage('img');
    expect(useSegmentationStore.getState().loginRequired).toBe(true);
  });

  it('reports other load failures', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    await useSegmentationStore.getState().loadMaskForImage('img');
    const { errorModal } = useSegmentationStore.getState();
    expect(errorModal.isOpen).toBe(true);
    expect(errorModal.message).toContain('boom');
  });

  describe('once a mask is loaded', () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
      await useSegmentationStore.getState().loadMaskForImage('img');
    });

    it('saves the mask in the wire format and clears the unsaved flag', async () => {
      useSegmentationStore.getState().paintPixels([0, 5], 1);
      expect(useSegmentationStore.getState().maskChanged).toBe(true);
      fetchMock.mockResolvedValueOnce(new Response('ok'));
      await useSegmentationStore.getState().saveCurrentMask();
      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe('/api/v1/images/img/mask');
      const body = init.body as Uint8Array;
      expect(body[0]).toBe(254);
      expect(body[1]).toBe(1);
      expect(body[1 + N]).toBe(1);
      expect(useSegmentationStore.getState().maskChanged).toBe(false);
      // For the Save button to say the mask was saved
      expect(useSegmentationStore.getState().maskSavedAt).not.toBeNull();
    });

    it('reports a failed save and keeps the unsaved flag', async () => {
      useSegmentationStore.getState().paintPixels([0], 1);
      fetchMock.mockResolvedValueOnce(new Response('disk full', { status: 500 }));
      await expect(useSegmentationStore.getState().saveCurrentMask()).rejects.toThrow();
      const s = useSegmentationStore.getState();
      expect(s.maskChanged).toBe(true);
      expect(s.errorModal.message).toContain('disk full');
    });

    it('does not show the HTML of a server error page', async () => {
      useSegmentationStore.getState().paintPixels([0], 1);
      fetchMock.mockResolvedValueOnce(new Response('<!doctype html><title>500 Internal Server Error</title>', { status: 500 }));
      await expect(useSegmentationStore.getState().saveCurrentMask()).rejects.toThrow();
      const { message } = useSegmentationStore.getState().errorModal;
      expect(message).toContain('Server error (500)');
      expect(message).not.toContain('<');
    });

    it('predicts: fills unpainted pixels, marks test pixels, scores, and can be undone', async () => {
      // 12 pixels: 0..5 class 0 painted, 6..11 class 1 painted -> not enough (need > 10 per class)
      await expect(useSegmentationStore.getState().predictMask()).rejects.toThrow(/at least 10 pixels/);

      // Use a larger mask so both classes have more than 10 painted pixels
      useSegmentationStore.setState({ maskDimensions: { width: 10, height: 5 } });
      fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
      await useSegmentationStore.getState().loadMaskForImage('img');
      const s0 = useSegmentationStore.getState();
      s0.paintPixels(Array.from({ length: 15 }, (_, i) => i), 0);
      s0.paintPixels(Array.from({ length: 15 }, (_, i) => 20 + i), 1);
      s0.recordHistory();

      const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
      const errors = new Uint8Array(50);
      errors.fill(2, 0, 7);
      errors.fill(1, 20, 27);
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        mask: b64(new Uint8Array(50).fill(1)), errors: b64(errors),
        confusion_matrix: [[0, 7], [0, 7]], per_class_accuracy: { 0: 0, 1: 1 },
        overall_accuracy: 0, worst_class: 0, n_train: 16, n_test: 14,
        model: { type: 'lightgbm', n_features: 3, fit_seconds: 0.1 },
      })));
      await useSegmentationStore.getState().predictMask();

      const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      expect(url).toBe('/api/v1/images/img/predict');
      // Every painted pixel goes to the server, which picks the training ones
      const sent = JSON.parse(init.body as string);
      expect(sent.user_pixels).toHaveLength(30);
      expect(sent.user_labels.filter((l: number) => l === 1)).toHaveLength(15);
      const s = useSegmentationStore.getState();
      expect(s.maskDocument!.final[0]).toBe(0); // user pixel kept
      expect(s.maskDocument!.final[40]).toBe(1); // unpainted pixel filled
      expect(Array.from(s.maskDocument!.errors).filter(v => v).length).toBe(14);
      expect(s.confusionMatrix!.matrix[0][1]).toBe(7);
      expect(s.confusionMatrix!.accuracyStats.worstClass).toBe(0);
      expect(s.predictionRevision).toBe(s.maskRevision);
      expect(s.maskChanged).toBe(true);

      useSegmentationStore.getState().undo();
      // Back to no label, as before the prediction
      expect(useSegmentationStore.getState().maskDocument!.final[40]).toBe(NO_LABEL);
    });

    it('reset clears the mask and can be undone', () => {
      const s = useSegmentationStore.getState();
      s.paintPixels([3], 1);
      s.recordHistory();
      s.resetMask();
      expect(useSegmentationStore.getState().userPixelCounts.total).toBe(0);
      useSegmentationStore.getState().undo();
      expect(useSegmentationStore.getState().maskDocument!.user[3]).toBe(1);
    });
  });
});
