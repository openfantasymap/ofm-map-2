import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { OpenRouterService } from './openrouter';

/** Landing page for OpenRouter's PKCE redirect: swap the code for a key, go back. */
@Component({
  selector: 'app-openrouter-callback',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="plate">
      <span class="mark">OpenRouter</span>
      @if (error()) {
        <h1>The link did not go through</h1>
        <p>{{ error() }}</p>
        <a routerLink="/">Back to the worlds</a>
      } @else {
        <h1>Connecting your account…</h1>
      }
    </main>
  `,
  styles: [`
    :host { display: grid; place-items: center; min-height: 100vh; background: var(--paper); }
    .plate { max-width: 40ch; padding: var(--space-xl); display: flex; flex-direction: column; gap: var(--space-sm); }
    h1 { margin: 0; font-family: var(--ofm-font-display); font-style: italic; font-weight: 500; font-size: var(--ofm-size-xl); color: var(--ink); }
    p { margin: 0; color: var(--ink-2); line-height: var(--ofm-lead-body); }
    a { color: var(--cinnabar); }
  `],
})
export class OpenRouterCallback implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private openrouter = inject(OpenRouterService);

  error = signal<string | null>(null);

  async ngOnInit() {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (!code) {
      this.error.set('OpenRouter did not send back an authorisation code.');
      return;
    }
    try {
      const back = await this.openrouter.completeLogin(code);
      this.router.navigateByUrl(back, { replaceUrl: true });
    } catch (err: any) {
      this.error.set(err?.message ?? String(err));
    }
  }
}
