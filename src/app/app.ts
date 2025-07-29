import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Directive, HostListener, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Directive({
  selector: "[appActivateRoute]"
})
export class ActiveRoute {
  constructor(private changeDetectorRef: ChangeDetectorRef) {}

  @HostListener('activate')
  public activate() {
    this.changeDetectorRef.detectChanges();
  }
}


@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly title = signal('ofm-map-2');
}
