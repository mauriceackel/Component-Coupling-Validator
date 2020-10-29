const adapterServiceBase = "iot.informatik.uni-mannheim.de";
const adapterServicePort = "8199";

export const environment = {
  production: true,
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
