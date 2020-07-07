import Express, { Application } from 'express';
import bodyParser from 'body-parser';
import AdapterController from './controller/AdapterController';
import FileController from './controller/FileController';
import * as Config from './config/Config';
import https from 'https';
/// <reference lib="dom" />
import * as firebase from 'firebase';
import Winston, { format, transports, Logger } from 'winston';
import { SuccessResponse } from './utils/responses/ApiResponse';

export var logger: Logger;
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class Service {

  private static instance: Service;
  public static get Instance(): Service {
    return this.instance || (this.instance = new this());
  }

  private httpServer?: https.Server;
  private express?: Application;

  private running: boolean;

  private constructor() {
    this.running = false;
    this.express = Express();

    this.initLogging();
    this.initFirebase();
    this.initRoutes();

    process.on('SIGINT', () => {
      this.stop();
    });
  }

  /**
   * Run the service with the config specified in ./config/Config.ts
   */
  public async start() {
    if (!this.running) {
      logger.info('Attempting start of adapter-service.');

      //Start http server
      logger.info(`Trying to start http server at ${Config.HOST}:${Config.PORT}.`);
      try {
        this.httpServer = https
          .createServer({
            key: Config.PRIVATE_KEY,
            cert: Config.CERTIFICATE
          }, this.express)
          .listen(Config.PORT, Config.HOST);
      } catch (err) {
        logger.error('Http server creation failed: ', err);
        process.exit(1);
      }
      logger.info(`Http server creation successful. Listening on host ${Config.HOST}, port ${Config.PORT}.`);

      this.running = true;
    }
  }

  /**
   * Stop the service gracefully, exit hard on error
   */
  public async stop() {
    if (this.running) {
      process.removeAllListeners();
      logger.info('Attempting graceful shutdown of adapter-service.');

      try {
        //Stop http server if existing.
        if (this.httpServer) {
          logger.info('Trying to stop http server.');
          let httpPromise = new Promise((resolve, reject) => {
            this.httpServer!.close((err: any) => {
              if (err) {
                logger.error('Http server could not be stopped.');
                return reject(err);
              }
              logger.info('Http server successfully stopped.');
              resolve();
            });
          });
          await httpPromise;
        }

        logger.info('Shutting down gracefully');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown: ', err);
        process.exit(1);
      }
    }
  }

  /**
   * Initialize the logger for this service's logging
   */
  private initLogging() {
    logger = Winston.createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        format.errors({ stack: true }),
        format.splat(),
        format.json()
      ),
      defaultMeta: { service: 'adapter-service' },
      transports: [
        // Write to all logs with level 'info' and below to 'combined.log'
        // Write all logs error (and below) to 'error.log'
        new transports.File({ filename: `${Config.LOG_PATH}/error.log`, level: 'error' }),
        new transports.File({ filename: `${Config.LOG_PATH}/warn.log`, level: 'warn' }),
        new transports.File({ filename: `${Config.LOG_PATH}/combined.log` })
      ]
    });

    // If we're not in production then **ALSO** log to the 'console' with the colorized simple format.
    if (process.env.NODE_ENV !== 'production') {
      logger.add(new transports.Console({
        format: format.combine(
          format.colorize(),
          format.simple()
        )
      }));
    }
  }

  /**
   * Setup firebase
   */
  private initFirebase(): void {
    const firebaseConfig = {
      apiKey: "AIzaSyAzYN7Id-HtrJxZt6SNGUwDJ11gLDOlFDg",
      authDomain: "integrateit-41c60.firebaseapp.com",
      databaseURL: "https://integrateit-41c60.firebaseio.com",
      projectId: "integrateit-41c60",
      storageBucket: "integrateit-41c60.appspot.com",
      messagingSenderId: "287628349300",
      appId: "1:287628349300:web:70bba41d86cba288446621"
    };

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);

    firebase.auth().signInWithEmailAndPassword("adapter-service@example.com", "rm4I8Izs0IZKPsiAEiie3zC9S4PkJbRb");
  }

  /**
   * Setup all the controllers for the REST api
   */
  private initRoutes(): void {
    if (this.express) {
      this.express.use("*", function (req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', '*');
        res.header('Access-Control-Allow-Headers', '*');
        res.header('Access-Control-Allow-Credentials', 'true');
        if ('OPTIONS' === req.method) {
          //respond with 204
          res.sendStatus(204);
        } else {
          next();
        }
      });

      // Set our api routes
      this.express.use(bodyParser.json());
      this.express.use(bodyParser.urlencoded({ extended: false }));
      this.express.use(bodyParser.raw());

      //Register routes with no or only partial authentication
      this.express.use('/create-adapter', AdapterController);
      this.express.use('/download', FileController);

      //If no validation checks failed before, give the OK to the API Gateway
      this.express.use("*", (req, res, next) => {
        let response = new SuccessResponse(404);
        res.status(response.Code).send(response);
      })
    } else {
      logger.error('Express is undefined. Exiting.')
    }
  }
}

// ------------------------ Main ------------------------
Service.Instance.start();
