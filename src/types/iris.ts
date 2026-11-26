import type { AIModelConfig as AIModelSchema, ClassConfig, ProjectConfig } from './config.generated';

// IRIS API Type Definitions

export interface User {
  id: number;
  name: string;
  email?: string; // Optional for backward compatibility
  created: string;
  isAdmin: boolean;
  image_seed: number;
  segmentation: {
    score: number;
    score_unverified: number;
    n_masks: number;
    rank?: number;
    last_masks?: Action[];
  };
}

export interface Action {
  id: number;
  type: string;
  image_id: string;
  user_id: number;
  last_modification: string;
  time_spent: string;
  score: number;
  unverified: boolean;
  complete: boolean;
  notes?: string;
  difficulty: number;
  username?: string; // Added by API for admin views
}

// Data Transfer Objects (DTOs) - match backend API property names
export interface UserDto {
  id: number;
  name: string;
  created: string;
  admin: boolean; // Backend uses 'admin'
  image_seed: number;
  segmentation: {
    score: number;
    score_unverified: number;
    n_masks: number;
    rank?: number;
    last_masks?: Action[];
  };
}

export interface UsersApiResponse {
  users: UserDto[]; // API response contains DTOs
}

export interface ImageStats {
  processed: number;
  total: number;
}

export interface ActionsApiResponse {
  actions: Action[];
  image_stats: ImageStats;
  order_by: string;
  ascending: boolean;
}

// Images API types
export interface ImageTypeStats {
  score: number;
  count: number;
  difficulty: number;
  time_spent: number;
}

export interface ImageData {
  image_id: string;
  types: {
    [key: string]: ImageTypeStats;
  };
}

export interface ImagesApiResponse {
  images: ImageData[];
  order_by: string;
  ascending: boolean;
}

// Preferences/Config Types
// The project config is generated from iris/schema.py
export type { ClassConfig, ProjectConfig };

/** A user's AI settings: the server fills in every default. */
export type AIModelConfig = {
  [K in Exclude<keyof AIModelSchema, 'class_weight'>]-?: NonNullable<AIModelSchema[K]>;
} & { class_weight: 'balanced' | null };

export interface UserInfo {
  id: number;
  name: string;
  admin: boolean;
  created: string;
  image_seed: number;
  segmentation: {
    score: number;
    score_unverified: number;
    n_masks: number;
    rank?: number;
    last_masks?: Action[];
  };
  config?: any; // Project configuration (only available for current user or admin)
}

export interface ConfusionMatrix {
  matrix: number[][]; // 2D array [actual_class][predicted_class]
  classCount: number;
  totalSamples: number;
  accuracyStats: {
    overall: number; // Overall accuracy (acc_prod / acc_sum)
    perClass: number[]; // Per-class accuracy (tp[class] / test_n_samples[class])
    worstClass: number | null; // Class with lowest accuracy
    worstAccuracy: number; // Lowest accuracy value
    truePositives: { [classId: number]: number }; // tp values from legacy code
  };
  timestamp: Date;
  classes: string[]; // Class names for display
}

export interface UserConfig {
  segmentation: {
    ai_model: AIModelConfig;
  };
  classes: ClassConfig[];
}

export interface UserConfigApiResponse {
  config: UserConfig;
  all_bands: string[];
  is_admin: boolean;
}

// User Profile Types
export interface SegmentationMask {
  image_id: string;
  score: number;
  score_unverified: boolean;
  last_modification: string;
  time_spent: string;
}

// User pixel counts per class
export interface UserPixelCounts {
  total: number;
  [classId: number]: number; // Per-class pixel counts
}

// AI Training Validation Result
export interface AITrainingValidation {
  isValid: boolean;
  classesWithEnoughPixels: number;
  totalPixels: number;
  classPixelCounts: { [classId: number]: number };
  minPixelsRequired: number;
  minClassesRequired: number;
}

export interface UserProfile {
  id: number;
  name: string;
  email?: string; // Optional for backward compatibility
  admin: boolean;
  created: string;
  image_seed: number;
  segmentation: {
    rank: number | null;
    score: number;
    score_unverified: number;
    n_masks: number;
    last_masks: SegmentationMask[];
  };
  is_current_user: boolean;
}

export interface CurrentUserResponse {
  user: UserDto | null;
}
