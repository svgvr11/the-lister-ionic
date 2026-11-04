import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withHashLocation } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { assertValidRuntimeMode } from './app/core/auth/runtime-mode/runtime-mode';
import { AuthService } from './app/services/auth.service';
import { BoardRepository } from './app/services/board.repository';
import { BoardSessionService } from './app/services/board-session.service';
import { MockAuthService } from './app/services/mock-auth.service';
import { MockBoardRepository } from './app/services/mock-board.repository';
import { MockBoardSessionService } from './app/services/mock-board-session.service';
import { environment } from './environments/environment';

assertValidRuntimeMode(environment);

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withHashLocation()),
    { provide: AuthService, useClass: MockAuthService },
    { provide: BoardRepository, useClass: MockBoardRepository },
    { provide: BoardSessionService, useClass: MockBoardSessionService }
  ]
}).catch((error) => console.error(error));
