import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
//import { LoginComponent } from './features/auth/login/login';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('sistemaInscripciones');
}
