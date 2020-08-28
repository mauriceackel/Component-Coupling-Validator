import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { AngularFireModule } from '@angular/fire';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { environment } from '../environments/environment';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AuthenticationService, AuthGuard } from './services/authentication.service';
import { DisableChildrenModule } from './utils/directives/disable-children.directive';
import { BaseModule as OpenApiBaseModule } from './views/open-api/base.module';
import { BaseModule as AsyncApiBaseModule } from './views/async-api/base.module';
import { HomeModule } from './views/home/home.module';
import { LoginModule } from './views/login/login.module';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    CommonModule,
    AngularFireModule.initializeApp(environment.firebase),
    HttpClientModule,
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MatIconModule,
    HomeModule,
    OpenApiBaseModule,
    AsyncApiBaseModule,
    LoginModule,
    DisableChildrenModule,
  ],
  providers: [
    AuthGuard,
    AuthenticationService,
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
