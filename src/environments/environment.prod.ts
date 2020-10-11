const adapterServiceBase = "iot.informatik.uni-mannheim.de";
const adapterServicePort = "8200";

export const environment = {
  production: true,
  adapterServiceBase,
  adapterServicePort,
  adapterServiceBaseUrl: `https://${adapterServiceBase}:${adapterServicePort}`,
  firebase: {
    apiKey: "AIzaSyAzYN7Id-HtrJxZt6SNGUwDJ11gLDOlFDg",
    authDomain: "integrateit-41c60.firebaseapp.com",
    databaseURL: "https://integrateit-41c60.firebaseio.com",
    projectId: "integrateit-41c60",
    storageBucket: "integrateit-41c60.appspot.com",
    messagingSenderId: "287628349300",
    appId: "1:287628349300:web:70bba41d86cba288446621"
  }
};
