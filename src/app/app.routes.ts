import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login';
import { DashboardComponent } from './features/dashboard/dashboard';
import { ConfiguracionComponent } from './features/configuracion/configuracion';
import { authGuard } from './services/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'configuracion', component: ConfiguracionComponent, canActivate: [authGuard] },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' }
];