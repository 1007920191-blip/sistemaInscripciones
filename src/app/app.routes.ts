import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login';
import { DashboardComponent } from './features/dashboard/dashboard';
import { ConfiguracionComponent } from './features/configuracion/configuracion';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'configuracion', component: ConfiguracionComponent },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' }
];