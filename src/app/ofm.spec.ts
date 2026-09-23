import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { OfmService } from './ofm';

describe('OfmService.getWorldGuide', () => {
  let service: OfmService;
  let http: HttpTestingController;
  const url = 'https://staticfiles.fantasymaps.org/claude/WORLD.md';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(OfmService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('emits the Markdown when the world has a guide', () => {
    let out: string | null | undefined;
    service.getWorldGuide('claude').subscribe(v => (out = v));
    http.expectOne(url).flush('# Claude');
    expect(out).toBe('# Claude');
  });

  it('emits null when the world has no guide', () => {
    let out: string | null | undefined;
    service.getWorldGuide('claude').subscribe(v => (out = v));
    http.expectOne(url).flush('not found', { status: 404, statusText: 'Not Found' });
    expect(out).toBeNull();
  });

  it('treats an empty file as no guide', () => {
    let out: string | null | undefined;
    service.getWorldGuide('claude').subscribe(v => (out = v));
    http.expectOne(url).flush('  \n');
    expect(out).toBeNull();
  });
});
