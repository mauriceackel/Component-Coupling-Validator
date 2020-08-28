import { Injectable } from "@angular/core";
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/auth';
import { User } from 'firebase';
import { AuthError } from '../utils/errors/auth-error';
import { take, map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthenticationService {

  private _user?: User;
  public get User(): User | undefined {
    return this._user;
  }

  private _user$?: Observable<User>;
  public get User$(): Observable<User> {
    return this._user$;
  }

  constructor(private router: Router, private firebaseAuth: AngularFireAuth) {
    this._user$ = this.firebaseAuth.authState;
    this.firebaseAuth.user.subscribe((user) => {
      this._user = user;
    });
  }

  public async login(email: string, password: string) {
    try {
      await this.firebaseAuth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      switch(err.code) {
        case "auth/user-not-found": throw new AuthError("Invalid username or passsword"); break;
        case "auth/invalid-password": throw new AuthError("Invalid username or passsword"); break;
        case "auth/too-many-requests": throw new AuthError("Too many request"); break;
        case "auth/user-disabled": throw new AuthError("This account is disabled"); break;
        default: throw new AuthError("Unknown error during authentication");
      }
    }
  }

  public async logout() {
    await this.firebaseAuth.signOut();
    this.router.navigate(["/home/login"]);
  }

}

@Injectable()
export class AuthGuard implements CanActivate {

  constructor(private authService: AuthenticationService, private router:Router) { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
    return this.authService.User$.pipe(
      take(1),
      map((user: User) => {
        if (user) {
          return true;
        }
        this.router.navigate(['/home/login'], { queryParams: { returnUrl: state.url }});
        return false;
      })
    )
  }
}
