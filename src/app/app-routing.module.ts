import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './services/authentication.service';
import { BaseComponent as OpenApiBaseComponent } from './views/open-api/base.component';
import { EvaluationComponent as OpenApiHomeComponent } from './views/open-api/evaluation/evaluation.component';
import { DescribeComponent as OpenApiDescribe } from './views/open-api/describe/describe.component';
import { TransformationComponent as OpenApiTransform } from './views/open-api/transformation/transformation.component';
import { ManualComponent as OpenApiManual } from './views/open-api/manual/manual.component';
import { BaseComponent as AsyncApiBaseComponent } from './views/async-api/base.component';
import { EvaluationComponent as AsyncApiHomeComponent } from './views/async-api/evaluation/evaluation.component';
import { DescribeComponent as AsyncApiDescribe } from './views/async-api/describe/describe.component';
import { ManualComponent as AsyncApiManual } from './views/async-api/manual/manual.component';
import { TransformationComponent as AsyncApiTransform } from './views/async-api/transformation/transformation.component';
import { HomeComponent } from './views/home/home.component';
import { LoginComponent } from './views/login/login.component';

const routes: Routes = [
  {
    path: 'openapi',
    canActivate: [AuthGuard],
    component: OpenApiBaseComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full', },
      { path: 'home', component: OpenApiHomeComponent, },
      { path: 'transformation', component: OpenApiTransform, },
      { path: 'manual', component: OpenApiManual, },
      { path: 'describe', component: OpenApiDescribe, }
    ]
  },
  {
    path: 'asyncapi',
    canActivate: [AuthGuard],
    component: AsyncApiBaseComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full', },
      { path: 'home', component: AsyncApiHomeComponent, },
      { path: 'transformation', component: AsyncApiTransform, },
      { path: 'manual', component: AsyncApiManual, },
      { path: 'describe', component: AsyncApiDescribe, }
    ]
  },
  {
    path: 'home',
    component: HomeComponent,
    children: [
      { path: 'login', component: LoginComponent, },
    ]
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
