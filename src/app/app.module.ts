import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { NgModule } from '@angular/core';

import { CommonModule } from '@angular/common';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';

import { HomeModule } from './views/home/home.module';
import { LoginModule } from './views/login/login.module';
import { ManualModule } from './views/manual/manual.module';
import { TransformationModule } from './views/transformation/transformation.module';
import { JsonldModule } from './views/jsonld/jsonld.module';
import { AngularFireModule } from '@angular/fire';
import { environment } from '../environments/environment';
import { AuthenticationService, AuthGuard } from './services/authentication.service';
import { MatIconModule } from '@angular/material/icon';

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
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    HomeModule,
    ManualModule,
    TransformationModule,
    JsonldModule,
    LoginModule,
  ],
  providers: [
    AuthGuard,
    AuthenticationService,
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
