import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {
  email = '';
  password = '';
  emailRec = '';
  showRecover = false;
  showSuccess = false;

  constructor(private auth: AuthService, private router: Router) {}

  async login() {
    try {
      await this.auth.login(this.email, this.password);
      location.href = '/dashboard';
      this.router.navigate(['/dashboard']);   // más adelante creamos esta ruta
    } catch {
      alert('Correo o contraseña incorrectos');
    }
  }

  openRecover() {
    this.showRecover = true;
  }

  async sendRecovery() {
    try {
      await this.auth.resetPassword(this.email);
      this.showRecover = false;
      this.showSuccess = true;
    } catch {
      alert('Email no registrado');
    }
  }

  closeSuccess() {
    this.showSuccess = false;
    this.email = '';
  }
}