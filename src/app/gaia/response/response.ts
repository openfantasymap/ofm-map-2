import { ChangeDetectionStrategy, Component, inject, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export type ImageState = 'none' | 'loading' | 'ready' | 'error';

/** A Gaia answer as shown in the dialog; the image fills in asynchronously. */
export interface GaiaView {
  description?: string;
  image_prompt?: string;
  image: Signal<string | null>;
  imageState: Signal<ImageState>;
  imageError: Signal<string | null>;
  /** Paint (or repaint) the view; absent when no OpenRouter account is linked. */
  paint?: () => void;
}

@Component({
  selector: 'app-response',
  imports: [MatDialogModule, MatButtonModule, MatExpansionModule, MatProgressSpinnerModule],
  templateUrl: './response.html',
  styleUrl: './response.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Response {
  readonly data = inject<GaiaView>(MAT_DIALOG_DATA);
}
