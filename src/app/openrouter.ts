import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const API = 'https://openrouter.ai/api/v1';
const KEY_STORAGE = 'ofm-openrouter-key';
const MODEL_STORAGE = 'ofm-openrouter-image-model';
const PKCE_STORAGE = 'ofm-openrouter-pkce';

export const DEFAULT_IMAGE_MODEL = 'google/gemini-2.5-flash-image';

/** Route OpenRouter redirects back to after login; see app.routes.ts. */
export const CALLBACK_PATH = '/auth/openrouter';

/**
 * OpenRouter account link for the GaiaWM "eye on the world".
 *
 * Login uses OpenRouter's OAuth PKCE flow, which mints a user-owned API key
 * directly in the browser. The key is kept in localStorage and only ever sent
 * to openrouter.ai — never to the Gaia backend — so image generation is billed
 * to the viewer's own OpenRouter account.
 */
@Injectable({ providedIn: 'root' })
export class OpenRouterService {
  private http = inject(HttpClient);

  readonly key = signal<string | null>(read(KEY_STORAGE));
  readonly imageModel = signal<string>(read(MODEL_STORAGE) || DEFAULT_IMAGE_MODEL);

  constructor() {
    // The previous implementation stored a raw OpenAI key under this name and
    // sent it to the backend in a query string. Drop it rather than keep a
    // secret around that nothing reads any more.
    remove('gaia-sora-key');
  }

  /** Redirect to OpenRouter; comes back to CALLBACK_PATH, then to `returnUrl`. */
  async login(returnUrl: string): Promise<void> {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = base64url(new Uint8Array(digest));
    sessionStorage.setItem(PKCE_STORAGE, JSON.stringify({ verifier, returnUrl }));

    const callback = window.location.origin + CALLBACK_PATH;
    window.location.href = 'https://openrouter.ai/auth'
      + '?callback_url=' + encodeURIComponent(callback)
      + '&code_challenge=' + challenge
      + '&code_challenge_method=S256';
  }

  /** Finish the PKCE flow. Resolves to the URL the user started from. */
  async completeLogin(code: string): Promise<string> {
    const pending = JSON.parse(sessionStorage.getItem(PKCE_STORAGE) || 'null');
    sessionStorage.removeItem(PKCE_STORAGE);
    if (!pending?.verifier) {
      throw new Error('This login was not started from this browser tab. Please try again.');
    }
    const res = await firstValueFrom(this.http.post<{ key: string }>(API + '/auth/keys', {
      code,
      code_verifier: pending.verifier,
      code_challenge_method: 'S256',
    }));
    if (!res?.key) throw new Error('OpenRouter did not return a key.');
    this.setKey(res.key);
    return pending.returnUrl || '/';
  }

  /** Manual fallback for people who already have an OpenRouter key. */
  setKey(key: string | null) {
    const k = key?.trim() || null;
    k ? write(KEY_STORAGE, k) : remove(KEY_STORAGE);
    this.key.set(k);
  }

  logout() {
    this.setKey(null);
  }

  setImageModel(model: string) {
    const m = model.trim() || DEFAULT_IMAGE_MODEL;
    write(MODEL_STORAGE, m);
    this.imageModel.set(m);
  }

  /**
   * Render `prompt` with an image-output model and return a data: URL.
   * An invalid or revoked key signs the user out so the next attempt
   * prompts for a fresh login instead of failing forever.
   */
  async generateImage(prompt: string): Promise<string> {
    const key = this.key();
    if (!key) throw new Error('Connect an OpenRouter account first.');
    try {
      const res: any = await firstValueFrom(this.http.post(API + '/chat/completions', {
        model: this.imageModel(),
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
      }, {
        headers: {
          Authorization: 'Bearer ' + key,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'OpenFantasyMap',
        },
      }));
      const url = res?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!url) throw new Error(`${this.imageModel()} returned no image — is it an image-output model?`);
      return url;
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) this.logout();
        throw new Error(err.error?.error?.message || `OpenRouter error ${err.status}`);
      }
      throw err;
    }
  }
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Storage can throw (private mode, blocked site data); treat that as "absent".
function read(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function write(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* not persisted */ }
}
function remove(k: string) {
  try { localStorage.removeItem(k); } catch { /* nothing to remove */ }
}
