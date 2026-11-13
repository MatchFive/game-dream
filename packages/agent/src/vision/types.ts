export interface VisualReview {
  readable: boolean;
  hud_visible: boolean;
  player_visible: boolean;
  enemy_visible: boolean;
  dialogue_readable: boolean;
  issues: string[];
}

export interface VisionRequest {
  imagePath: string;
  system: string;
  user: string;
}

export interface VisionProvider {
  readonly name: string;
  review(request: VisionRequest): Promise<VisualReview>;
}
