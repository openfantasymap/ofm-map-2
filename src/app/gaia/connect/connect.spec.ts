import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { GaiaConnectDialog } from './connect';

describe('GaiaConnectDialog', () => {
  const close = jasmine.createSpy('close');

  beforeEach(async () => {
    close.calls.reset();
    await TestBed.configureTestingModule({
      imports: [GaiaConnectDialog],
      providers: [provideZonelessChangeDetection(), { provide: MatDialogRef, useValue: { close } }],
    }).compileComponents();
  });

  it('closes with a login request', () => {
    TestBed.createComponent(GaiaConnectDialog).componentInstance.login();
    expect(close).toHaveBeenCalledWith({ action: 'login' });
  });

  it('only accepts a non-blank pasted key', () => {
    const c = TestBed.createComponent(GaiaConnectDialog).componentInstance;
    c.pastedKey = '   ';
    c.useKey();
    expect(close).not.toHaveBeenCalled();
    c.pastedKey = ' sk-or-abc ';
    c.useKey();
    expect(close).toHaveBeenCalledWith({ action: 'key', key: 'sk-or-abc' });
  });
});
