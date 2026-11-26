/**
 * Client for the prediction route: the server splits the painted pixels
 * into training and test pixels, fits the model chosen in the user's
 * preferences, and scores it on the test pixels.
 */

import { appUrls, ensureOk } from './http';

export interface PredictionResult {
  /** One class id per mask pixel */
  mask: Uint8Array;
  /** 0 not tested, 1 test pixel predicted correctly, 2 wrongly */
  errors: Uint8Array;
  /** [actual class][predicted class], over all project classes */
  confusionMatrix: number[][];
  /** Accuracy per class that took part, keyed by class id */
  perClassAccuracy: Record<string, number>;
  /** n * prod(accuracy) / sum(accuracy), the IRIS score */
  overallAccuracy: number;
  worstClass: number | null;
  nTrain: number;
  nTest: number;
  model: { type: string; n_features: number; fit_seconds: number; [key: string]: unknown };
}

const decode = (base64: string): Uint8Array => {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
};

/** `pixels` and `labels`: every pixel the user painted and its class. */
export async function predictMask(imageId: string, pixels: number[], labels: number[]): Promise<PredictionResult> {
  const response = await ensureOk(await fetch(
    `${appUrls().main}api/v1/images/${encodeURIComponent(imageId)}/predict`, {
      method: 'POST',
      body: JSON.stringify({ user_pixels: pixels, user_labels: labels }),
      credentials: 'same-origin',
    }));
  const body = await response.json();
  return {
    mask: decode(body.mask),
    errors: decode(body.errors),
    confusionMatrix: body.confusion_matrix,
    perClassAccuracy: body.per_class_accuracy,
    overallAccuracy: body.overall_accuracy,
    worstClass: body.worst_class,
    nTrain: body.n_train,
    nTest: body.n_test,
    model: body.model,
  };
}
