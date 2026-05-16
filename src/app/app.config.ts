import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';

import { provideRouter } from '@angular/router';

import { provideHttpClient } from '@angular/common/http';

import {
  provideFirebaseApp,
  initializeApp
} from '@angular/fire/app';

import {
  provideFirestore,
  getFirestore
} from '@angular/fire/firestore';

import { environment } from '../environments/environment';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [

    provideZoneChangeDetection({
      eventCoalescing: true,
      runCoalescing: true
    }),

    provideRouter(routes),

    provideHttpClient(),

    provideFirebaseApp(() =>
      initializeApp(environment.firebase)
    ),

    provideFirestore(() =>
      getFirestore()
    )
  ]
};