import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { saveThenGo, goFromToolbar, goToPickedImage, imageUrl } from './navigation';
import { useSegmentationStore } from '../stores/segmentationStore';
import ActionInfoModal from '../components/segmentation/ActionInfoModal';

const images = ['a', 'b', 'c'].map(id => ({
  image_id: id, has_user_annotation: false, has_any_annotation: false, annotation_count: 0,
}));

describe('navigation', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let location: { href: string };
  let save: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    location = { href: '' };
    vi.stubGlobal('location', location);
    Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true });
    save = vi.fn().mockResolvedValue(undefined);
    useSegmentationStore.setState({
      images, currentImageId: 'b', currentImageIndex: 1,
      maskChanged: false, showDialogueBeforeNextImage: false,
      actionInfoPrompt: null, notice: null, loadingMessage: null,
      saveCurrentMask: save as unknown as () => Promise<void>,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds image URLs', () => {
    expect(imageUrl('x y')).toBe('/segmentation/?image_id=x%20y');
  });

  it('Enter saves, then opens the next image', async () => {
    await saveThenGo('next');
    expect(save).toHaveBeenCalled();
    expect(location.href).toBe('/segmentation/?image_id=c');
  });

  it('does not navigate when the save fails', async () => {
    save.mockRejectedValue(new Error('nope'));
    await saveThenGo('next');
    expect(location.href).toBe('');
  });

  it('says so at the end of the list', async () => {
    useSegmentationStore.setState({ currentImageId: 'c', currentImageIndex: 2 });
    await saveThenGo('next');
    expect(location.href).toBe('');
    expect(useSegmentationStore.getState().notice?.text).toBe('No more images');
  });

  it('toolbar arrows save only when there are changes', async () => {
    await goFromToolbar('prev');
    expect(save).not.toHaveBeenCalled();
    expect(location.href).toBe('/segmentation/?image_id=a');
    useSegmentationStore.setState({ maskChanged: true });
    await goFromToolbar('next');
    expect(save).toHaveBeenCalled();
  });

  it('picking an image with no changes goes straight there', async () => {
    await goToPickedImage('a');
    expect(location.href).toBe('/segmentation/?image_id=a');
  });

  it('picking an image with changes asks for action info first', async () => {
    useSegmentationStore.setState({ maskChanged: true, showDialogueBeforeNextImage: true });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 7, difficulty: 2, notes: 'hm', complete: false })));
    await goToPickedImage('a');
    expect(location.href).toBe('');
    expect(useSegmentationStore.getState().actionInfoPrompt).toMatchObject({ targetImageId: 'a', action: { id: 7 } });

    render(<ActionInfoModal />);
    expect(screen.getByText('easy')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/complete and ready/));
    fetchMock.mockResolvedValueOnce(new Response('ok'));
    await act(async () => { fireEvent.click(screen.getByText('Save and continue')); });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/set_action_info/7');
    expect(JSON.parse(init.body)).toEqual({ complete: true, difficulty: 2, notes: 'hm' });
    expect(location.href).toBe('/segmentation/?image_id=a');
  });

  it('goes to the picked image when there is no action info yet', async () => {
    useSegmentationStore.setState({ maskChanged: true, showDialogueBeforeNextImage: true });
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    await goToPickedImage('a');
    expect(location.href).toBe('/segmentation/?image_id=a');
  });
});
