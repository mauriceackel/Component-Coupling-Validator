import { Injectable } from "@angular/core";
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class IdentificationService implements CanActivate {

  private userName?: string;
  public get UserName(): string {
    return this.userName;
  }
  public set UserName(value: string) {
    this.userName = value;
  }

  constructor(private router: Router) {
    //TODO: Remove
    this.userName = "Maurice"
  }

  public async canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {

    if(this.userName === undefined) {
      return this.router.createUrlTree(['/identification'], { queryParams: { returnUrl: state.url }});
    }
    return true;
  }
}
