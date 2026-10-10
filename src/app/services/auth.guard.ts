import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseApp } from '../firebase-config';

/**
 * Guarda de sesión del panel de administración.
 *
 * - Si HAY sesión activa en ESTE navegador => entra al panel ✔
 * - Si NO hay sesión (por ejemplo, alguien abre un link compartido
 *   como /dashboard o /configuracion en otro equipo o navegador)
 *   => SIEMPRE se le envía al inicio de sesión ✔
 *
 * Nota: la sesión vive en el navegador (no viaja en el link). Aun así,
 * esta guarda garantiza que ninguna dirección abra el panel sin sesión.
 */
export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = getAuth(firebaseApp);

  // Si Firebase ya tiene la sesión restaurada, se entra directo
  if (auth.currentUser) {
    return true;
  }

  // Si aún no ha restaurado la sesión, se espera un momento (máx. 3 s)
  const usuario = await new Promise<any>((resolve) => {
    let resuelto = false;
    const terminar = (u: any) => {
      if (!resuelto) { resuelto = true; resolve(u); }
    };
    const cancelar = onAuthStateChanged(auth, (u) => { cancelar(); terminar(u); });
    setTimeout(() => { try { cancelar(); } catch {} terminar(auth.currentUser); }, 3000);
  });

  if (usuario) {
    return true;
  }

  // Sin sesión: siempre al inicio de sesión (sin importar el link)
  return router.createUrlTree(['/login']);
};
