import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { LoginComponent } from './views/login/login.component';
import { AuthenticationService, AuthGuard } from './services/authentication.service';
import { HomeComponent } from './views/home/home.component';
import { ManualComponent } from './views/manual/manual.component';
import { TransformationComponent } from './views/transformation/transformation.component';
import { JsonldComponent } from './views/jsonld/jsonld.component';

const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
  },
  {
    path: 'manual',
    canActivate: [AuthGuard],
    component: ManualComponent,
  },
  {
    path: 'transformation',
    canActivate: [AuthGuard],
    component: TransformationComponent,
  },
  {
    path: 'jsonld',
    canActivate: [AuthGuard],
    component: JsonldComponent,
  },
  {
    path: 'home',
    canActivate: [AuthGuard],
    component: HomeComponent,
  },
  {
    path: '**',
    redirectTo: '/home',
    pathMatch: 'full',
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
