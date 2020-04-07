import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, from } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { IdentificationService } from './identification.service';

@Injectable({
    providedIn: 'root'
})
export class AuthInterceptor implements HttpInterceptor {

    constructor(private identificationService: IdentificationService) { }

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        //Add access token to the request
        let authenticatedRequest = this.addAuthentication(request);

        //Perform request and validate result
        return next.handle(authenticatedRequest).pipe(
            map((event: HttpEvent<any>) => {
                if (event instanceof HttpResponse) {
                    console.log('request--->>>', authenticatedRequest);
                    console.log('response--->>>', event);
                }
                return event;
            }),
            catchError((error: HttpErrorResponse) => {
                //Only 401 errors need to be checked here
                let errorHeader = error.headers.get("WWW-Authenticate");
                //If it's not a 401 or if the reason is not an invalid token
                if (error.status != 401 || error.status == 401 && !(errorHeader && errorHeader.includes("invalid_token"))) {
                    return throwError(error);
                }
            })
        );
    }

    addAuthentication(request: HttpRequest<any>) {
        // Get access token from Local Storage
        const accessToken = btoa("admin:secret");

        // If access token is null the user is not logged in so we return the original request
        // If the authorization header is already set, we leave it untouched
        if (request.headers.get("Authorization") || !accessToken) {
            return request;
        }

        // Clone the request, as the original request is immutable
        return request.clone({
            setHeaders: {
                Authorization: `Basic ${accessToken}`
            }
        });
    }
}
