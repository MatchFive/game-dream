import type { VisualReview, VisionProvider, VisionRequest } from './types.js';

export interface FakeVisionProviderOptions {
  review?: Partial<VisualReview>;
}

const DEFAULT_REVIEW: VisualReview = {
  readable: true,
  hud_visible: true,
  player_visible: true,
  enemy_visible: true,
  dialogue_readable: true,
  issues: [],
};

export class FakeVisionProvider implements VisionProvider {
  readonly name = 'fake';
  private readonly _review: VisualReview;

  constructor(options: FakeVisionProviderOptions = {}) {
    this._review = {
      ...DEFAULT_REVIEW,
      ...options.review,
      issues: [...(options.review?.issues ?? [])],
    };
  }

  async review(_request: VisionRequest): Promise<VisualReview> {
    return { ...this._review, issues: [...this._review.issues] };
  }
}
