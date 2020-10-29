// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.
const adapterServiceBase = "localhost";
const adapterServicePort = "8080";

export const environment = {
  production: false,
  adapterServiceBase,
  adapterServicePort,
  adapterServiceBaseUrl: `https://${adapterServiceBase}:${adapterServicePort}`,
  firebase: {
    apiKey: "AIzaSyBqprtWjwl-DRNKIQTiTOIpKT_btIHwBqM",
    authDomain: "eval-d2be2.firebaseapp.com",
    databaseURL: "https://eval-d2be2.firebaseio.com",
    projectId: "eval-d2be2",
    storageBucket: "eval-d2be2.appspot.com",
    messagingSenderId: "306037936402",
    appId: "1:306037936402:web:16af2bbc0e2bb2de9ea3cb",
    measurementId: "G-HRDK5LLMBK"
  }
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
