import { logger, sleep } from "../Service";
import { AdapterType } from "../models/AdapterModel";
import { IMapping } from "../models/MappingModel";
import { exec } from "child_process";
import { STORAGE_PATH } from "../config/Config";
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import * as ApiService from '../services/ApiService';
import { IApi } from "../models/ApiModel";
import { camelcase } from "../utils/camelcase";
import Zip from "adm-zip";

export async function createAdapter(adapterType: AdapterType, mapping: IMapping): Promise<string> {
    logger.info(`Trying to create adapter for type: ${adapterType}`);

    const adapterTypeKeys: string[] = Object.keys(AdapterType)
    const adapterTypes: AdapterType[] = adapterTypeKeys.map((k) => AdapterType[k as keyof typeof AdapterType]);
    if (!adapterTypes.includes(adapterType)) {
        throw new Error("Unkown adapter type");
    }

    const [sourceApiId, sourceOperationId, sourceResponseId] = mapping.sourceId.split('.');
    const [targetApiId, targetOperationId, targetResponseId] = mapping.targetId.split('.');

    logger.info(`Loading APIs`);
    const [source, target] = await Promise.all([
        ApiService.getApi(sourceApiId),
        ApiService.getApi(targetApiId)
    ]);

    const fileId = uuidv4();
    const filePath = `${STORAGE_PATH}/${fileId}`;

    logger.info(`Writing specs`);
    fs.mkdirSync(filePath, { recursive: true });

    fs.mkdirSync(`${filePath}/source/`);
    fs.writeFileSync(`${filePath}/source/apiSpec.json`, source.openApiSpec);
    fs.mkdirSync(`${filePath}/target/`);
    fs.writeFileSync(`${filePath}/target/apiSpec.json`, target.openApiSpec);

    logger.info(`Select adapter generator`);
    switch (adapterType) {
        case AdapterType.JAVASCRIPT: await createJavaScriptAdapter(filePath, mapping, source, sourceOperationId, target, targetOperationId); break;
        default: throw new Error("Unkown adapter type");
    }

    //Create zip file
    var zip = new Zip();
    zip.addLocalFolder(filePath);
    zip.writeZip(`${filePath}.zip`);

    return fileId;
}

async function createJavaScriptAdapter(filePath: string, mapping: IMapping, source: IApi, sourceOperationId: string, target: IApi, targetOperationId: string) {
    await generateOpenApiInterface('javascript-target', `${filePath}/target`, `operationId=${camelcase(targetOperationId)},usePromises=true,projectVersion=0.0.1`);
    const { targetApiName, targetHasBody, targetBodyName, targetBodyRequired, targetOptions, targetHasOptional } = parseJavaScriptTarget(filePath);

    const responseMapping = Buffer.from(escapeQuote(stringifyedToJsonata(mapping.responseMapping))).toString('base64');
    const requestMapping =  Buffer.from(escapeQuote(stringifyedToJsonata(mapping.requestMapping))).toString('base64');

    await generateOpenApiInterface(
        'javascript-adapter',
        `${filePath}/source`,
        `operationId=${camelcase(sourceOperationId)},targetApiName=${targetApiName},targetOptions=${targetOptions.join('.')},targetHasBody=${targetHasBody},targetBodyName=${targetBodyName},targetHasOptional=${targetHasOptional},requestMapping=${requestMapping},responseMapping=${responseMapping},usePromises=true,projectVersion=0.0.1`
    );
}

function parseJavaScriptTarget(filePath: string): { targetApiName: string, targetHasBody: boolean, targetBodyName: string, targetBodyRequired: boolean, targetOptions: Array<string>, targetHasOptional: boolean } {
    const targetApiFilePath = `${filePath}/target/parsed-target.txt`;
    const targetApiFile = fs.readFileSync(targetApiFilePath, { encoding: "utf-8" });

    const [targetApiName, targetHasBody, targetBodyName, targetBodyRequired, targetOptions, targetHasOptional] = targetApiFile.split('\n');

    fs.unlinkSync(targetApiFilePath);

    return {
        targetApiName,
        targetHasBody: targetHasBody === 'true',
        targetBodyName,
        targetBodyRequired: targetBodyRequired === 'true',
        targetOptions: targetOptions.split(',').map(o => o.trim()).filter(o => o !== 'opts'),
        targetHasOptional: targetHasOptional === 'true'
    };
}


async function generateOpenApiInterface(generator: string, path: string, options?: string) {
    const additionalOptions = options ? ` -p=${options}` : '';
    const executable = "java -cp lib/javascript-adapter-openapi-generator-1.0.0.jar:lib/javascript-target-openapi-generator-1.0.0.jar:lib/openapi-generator-cli.jar org.openapitools.codegen.OpenAPIGenerator";

    const command = `${executable} generate -g ${generator} -i ${path}/apiSpec.json -o ${path}${additionalOptions}`;

    return new Promise((resolve, reject) => {
        const child = exec(command, (error, stdout, stderr) => console.log(error, stdout, stderr));
        child.on('close', resolve);
        child.on('error', reject);
    })
}

/**
   * Method that takes a stringified JSON object as input and removes the quotes of all string properties.
   *
   * Exmaple:
   * { "foo":"bar" } --> { "foo":bar }
   */
export function stringifyedToJsonata(obj: string) {
    const keyValueRegex = /(?:\"|\')([^"]*)(?:\"|\')(?=:)(?:\:\s*)(?:\"|\')?(true|false|(?:[^"]|\\\")*)(?:"(?=\s*(,|})))/g;
    return obj.replace(keyValueRegex, '"$1":$2').replace(/\\\"/g, '"');
}

function escapeQuote(input: string) {
    return input.replace(/"/g, "\\\"")
}