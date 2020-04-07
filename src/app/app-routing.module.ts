import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { IdentificationComponent } from './views/identification/identification.component';
import { IdentificationService } from './services/identification.service';
import { HomeComponent } from './views/home/home.component';
import { ManualComponent } from './views/manual/manual.component';
import { TransformationComponent } from './views/transformation/transformation.component';
import { JsonldComponent } from './views/jsonld/jsonld.component';


const routes: Routes = [
  {
    path: 'identification',
    component: IdentificationComponent,
  },
  {
    path: 'manual',
    canActivate: [IdentificationService],
    component: ManualComponent,
  },
  {
    path: 'transformation',
    canActivate: [IdentificationService],
    component: TransformationComponent,
  },
  {
    path: 'jsonld',
    canActivate: [IdentificationService],
    component: JsonldComponent,
  },
  {
    path: 'home',
    canActivate: [IdentificationService],
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
