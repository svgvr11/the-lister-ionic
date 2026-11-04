import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoginPage } from './login.page';
import { AuthService } from '../../services/auth.service';
import { MockAuthService } from '../../services/mock-auth.service';

describe('LoginPage en modo mock', () => {
  let auth: MockAuthService;
  const navigateByUrl = vi.fn(async () => true);

  beforeEach(() => {
    TestBed.resetTestingModule();
    auth = new MockAuthService();
    navigateByUrl.mockClear();
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        { provide: AuthService, useValue: auth },
        {
          provide: Router,
          useValue: {
            navigateByUrl,
            getCurrentNavigation: () => null
          }
        }
      ]
    });
  });

  it('muestra la entrada demo en vez de ofrecer OAuth', async () => {
    await auth.signOut();
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Entrar en modo demo');
    expect(fixture.nativeElement.textContent).not.toContain('Continuar con Google');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('el botón demo crea una sesión y vuelve al tablero', async () => {
    await auth.signOut();
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.signInWithGoogle();

    expect(auth.session?.user.id).toBe('mock-user-id');
    expect(navigateByUrl).toHaveBeenCalledWith('/board', { replaceUrl: true });
  });
});
