// Generated from iris/schema.py by `python -m iris.schema`. Do not edit.

export interface AIModelConfig {
  /** null for all bands */
  bands?: string[] | null;
  train_ratio?: number | null;
  max_train_pixels?: number | null;
  n_estimators?: number | null;
  max_depth?: number | null;
  n_leaves?: number | null;
  /** Threads for LightGBM; -1 is all cores */
  n_jobs?: number | null;
  use_edge_filter?: boolean | null;
  use_superpixels?: boolean | null;
  use_meshgrid?: boolean | null;
  meshgrid_cells?: string | null;
  suppression_threshold?: number | null;
  suppression_filter_size?: number | null;
  suppression_default_class?: number | null;
}

export interface ChatConfig {
  enabled?: boolean | null;
  github_repo?: string | null;
  utterances_theme?: string | null;
}

export interface ClassConfig {
  name: string;
  /** RGBA, 0 to 255 */
  colour: [number, number, number, number];
  user_colour?: [number, number, number, number] | null;
  description?: string | null;
  /** Set by the server from colour */
  css_colour?: string | null;
}

export interface ImagesConfig {
  path: string | Record<string, string>;
  /** [height, width]; read from the images when absent */
  shape?: [number, number] | null;
  thumbnails?: string | Record<string, string> | false | null;
  metadata?: string | Record<string, string> | false | null;
  /** Budget of the image cache in megabytes; 0 disables it */
  cache_mb?: number | null;
}

export interface SegmentationConfig {
  path: string;
  mask_encoding?: 'integer' | 'binary' | 'rgb' | 'rgba' | null;
  /** [x0, y0, x1, y1]; the whole image when absent */
  mask_area?: [number, number, number, number] | null;
  /** [width, height], set by the server */
  mask_shape?: [number, number] | null;
  score?: 'f1' | 'jaccard' | 'accuracy' | null;
  prioritise_unmarked_images?: boolean | null;
  unverified_threshold?: number | null;
  ai_model?: AIModelConfig | false | null;
}

export interface ViewConfig {
  type: 'image';
  /** One band expression, or three for red, green and blue */
  data: string | string[];
  description?: string | null;
  cmap?: string | null;
  clip?: number | null;
  vmin?: number | null;
  vmax?: number | null;
  stretch?: string | null;
  /** Set by the server from the key */
  name?: string | null;
}

export interface ProjectConfig {
  name: string;
  host?: string | null;
  port?: number | null;
  debug?: boolean | null;
  path?: string | null;
  images: ImagesConfig;
  classes: ClassConfig[];
  views: Record<string, ViewConfig>;
  view_groups?: Record<string, string[]> | null;
  segmentation: SegmentationConfig;
  chat?: ChatConfig | null;
}
