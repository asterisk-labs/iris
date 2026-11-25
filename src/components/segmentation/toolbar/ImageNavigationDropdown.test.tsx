/**
 * Tests for ImageNavigationDropdown component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '../../../test/test-utils';
import { ImageNavigationDropdown } from './ImageNavigationDropdown';
import { useSegmentationStore } from '../../../stores/segmentationStore';

describe('ImageNavigationDropdown', () => {
  const mockImages = [
    {
      image_id: 'image_001',
      has_user_annotation: true,
      has_any_annotation: true,
      annotation_count: 1
    },
    {
      image_id: 'image_002',
      has_user_annotation: false,
      has_any_annotation: true,
      annotation_count: 2
    },
    {
      image_id: 'image_003',
      has_user_annotation: false,
      has_any_annotation: false,
      annotation_count: 0
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up store with test data
    useSegmentationStore.setState({
      images: mockImages,
      currentImageId: 'image_001',
      currentImageIndex: 0
    });
  });

  it('should render current image name', () => {
    const onNavigate = vi.fn();
    render(
      <ImageNavigationDropdown
        onNavigate={onNavigate}
      />
    );

    expect(screen.getByText('image_001')).toBeInTheDocument();
  });

  it('should use images from store', () => {
    const onNavigate = vi.fn();
    render(
      <ImageNavigationDropdown
        onNavigate={onNavigate}
      />
    );

    // Images should be available from store, not fetched
    expect(screen.getByText('image_001')).toBeInTheDocument();
  });

  it('should open dropdown when button is clicked', async () => {
    const onNavigate = vi.fn();
    render(
      <ImageNavigationDropdown
        onNavigate={onNavigate}
      />
    );

    const dropdown = screen.getByText('image_001').closest('div');
    fireEvent.click(dropdown!);

    await waitFor(() => {
      expect(screen.getByText('Image')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  it('should display all images in dropdown', async () => {
    const onNavigate = vi.fn();
    render(
      <ImageNavigationDropdown
        onNavigate={onNavigate}
      />
    );

    const dropdown = screen.getByText('image_001').closest('div');
    fireEvent.click(dropdown!);

    await waitFor(() => {
      expect(screen.getAllByText('image_001').length).toBeGreaterThan(0);
      expect(screen.getByText('image_002')).toBeInTheDocument();
      expect(screen.getByText('image_003')).toBeInTheDocument();
    });
  });

  it('should call onNavigate when image is selected', async () => {
    const onNavigate = vi.fn();
    render(
      <ImageNavigationDropdown
        onNavigate={onNavigate}
      />
    );

    const dropdown = screen.getByText('image_001').closest('div');
    fireEvent.click(dropdown!);

    await waitFor(() => {
      const image002 = screen.getAllByText('image_002')[0];
      fireEvent.click(image002.closest('.image-dropdown-item')!);
    });

    expect(onNavigate).toHaveBeenCalledWith('image_002');
  });

  it('should close dropdown after selecting image', async () => {
    const onNavigate = vi.fn();
    render(
      <ImageNavigationDropdown
        onNavigate={onNavigate}
      />
    );

    const dropdown = screen.getByText('image_001').closest('div');
    fireEvent.click(dropdown!);

    await waitFor(() => {
      const image002 = screen.getAllByText('image_002')[0];
      fireEvent.click(image002.closest('.image-dropdown-item')!);
    });

    // Dropdown should be closed (header not visible)
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
  });

  it('should show empty state when no images in store', () => {
    useSegmentationStore.setState({
      images: [],
      currentImageId: null,
      currentImageIndex: -1
    });

    const onNavigate = vi.fn();
    render(
      <ImageNavigationDropdown
        onNavigate={onNavigate}
      />
    );

    const dropdown = screen.getByTitle('Select image to navigate');
    fireEvent.click(dropdown);

    expect(screen.getByText('No images loaded')).toBeInTheDocument();
  });

  describe('sorting and filtering', () => {
    const names = () => Array.from(document.querySelectorAll('.image-name')).map(e => e.textContent);
    const image = (image_id: string, done = false) => ({
      image_id, has_user_annotation: done, has_any_annotation: done, annotation_count: done ? 1 : 0,
    });

    beforeEach(() => {
      useSegmentationStore.setState({
        images: [image('tile10'), image('tile2', true), image('Coast')],
        currentImageId: 'tile10',
        currentImageIndex: 0,
      });
      render(<ImageNavigationDropdown onNavigate={vi.fn()} />);
      fireEvent.click(screen.getByTitle('Select image to navigate'));
    });

    it('sorts by name by default, with numbers in order, and leaves the store alone', () => {
      expect(names()).toEqual(['Coast', 'tile2', 'tile10']);
      expect(useSegmentationStore.getState().images.map(i => i.image_id)).toEqual(['tile10', 'tile2', 'Coast']);
    });

    it('can show the order Next follows', () => {
      fireEvent.click(screen.getByText('My order'));
      expect(names()).toEqual(['tile10', 'tile2', 'Coast']);
      fireEvent.click(screen.getByText('A–Z'));
      expect(names()).toEqual(['Coast', 'tile2', 'tile10']);
    });

    it('can hide images the user has annotated', () => {
      fireEvent.click(screen.getByText('To do'));
      expect(names()).toEqual(['Coast', 'tile10']);
    });

    it('finds images by name', () => {
      const input = screen.getByLabelText('Find an image');
      fireEvent.change(input, { target: { value: 'TILE' } });
      expect(names()).toEqual(['tile2', 'tile10']);
      fireEvent.change(input, { target: { value: 'nothing' } });
      expect(screen.getByText('No matching images')).toBeInTheDocument();
    });
  });
});
