import fs from 'fs'

export const PORT: number = Number.parseInt(process.env.PORT || "8080");
export const HOST: string = process.env.HOST || "localhost";

export const STORAGE_PATH: string = process.env.STORAGE_PATH || "./tmp/adapter-generator";
export const LOG_PATH: string = process.env.LOG_PATH || "./log";

export const PRIVATE_KEY = fs.readFileSync('./bin/ssl/private.key');
export const CERTIFICATE = fs.readFileSync('./bin/ssl/public.cert');
