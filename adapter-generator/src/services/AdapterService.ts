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

  const [sourceApiId, sourceOperationId, sourceResponseId] = mapping.sourceId.split('_');
  const sourceOperation = { apiId: sourceApiId, operationId: sourceOperationId, responseId: sourceResponseId };

  const targetOperations = mapping.targetIds.map(id => {
    const [targetApiId, targetOperationId, targetResponseId] = id.split('_');
    return { apiId: targetApiId, operationId: targetOperationId, responseId: targetResponseId };
  });

  logger.info(`Loading APIs`);
  const [source, ...targets] = await Promise.all([
    ApiService.getApi(sourceApiId),
    ...targetOperations.map(api => ApiService.getApi(api.apiId))
  ]);

  const fileId = uuidv4();
  const filePath = `${STORAGE_PATH}/${fileId}`;

  logger.info(`Writing specs`);
  fs.mkdirSync(filePath, { recursive: true });

  fs.mkdirSync(`${filePath}/source/`);
  fs.writeFileSync(`${filePath}/source/apiSpec.json`, source.openApiSpec);

  fs.mkdirSync(`${filePath}/targets/`);
  for (const target of targets) {
    fs.mkdirSync(`${filePath}/targets/${target.id}/`);
    fs.writeFileSync(`${filePath}/targets/${target.id}/apiSpec.json`, target.openApiSpec);
  }

  logger.info(`Select adapter generator`);
  switch (adapterType) {
    case AdapterType.JAVASCRIPT: await createJavaScriptAdapter(filePath, mapping, sourceOperation, targetOperations); break;
    default: throw new Error("Unkown adapter type");
  }

  //Create zip file
  var zip = new Zip();
  zip.addLocalFolder(filePath);
  zip.writeZip(`${filePath}.zip`);

  return fileId;
}

async function createJavaScriptAdapter(
  filePath: string, mapping: IMapping,
  sourceOperation: { apiId: string; operationId: string; responseId: string; },
  targetOperations: { apiId: string; operationId: string; responseId: string; }[]
) {
  const responseMapping = Buffer.from(escapeQuote(stringifyedToJsonata(mapping.responseMapping))).toString('base64');
  const requestMapping = Buffer.from(escapeQuote(stringifyedToJsonata(mapping.requestMapping))).toString('base64');

  const additionalParameters: string[] = [];
  additionalParameters.push(`operationId=${camelcase(sourceOperation.operationId)}`);
  additionalParameters.push(`sourceFullId=${sourceOperation.apiId}_${sourceOperation.operationId}_${sourceOperation.responseId}`);
  additionalParameters.push(`requestMapping=${requestMapping}`);
  additionalParameters.push(`responseMapping=${responseMapping}`);
  additionalParameters.push(`usePromises=true`);
  additionalParameters.push(`projectVersion=0.0.1`);

  const targetInfos: string[] = [];
  for (const target of targetOperations) {
    const targetPath = `${filePath}/targets/${target.apiId}`;

    await generateOpenApiInterface('javascript-target', targetPath, `operationId=${camelcase(target.operationId)},usePromises=true,projectVersion=0.0.1`);
    const { targetApiName, targetHasBody, targetBodyName, targetBodyRequired, targetOptions, targetHasOptional } = parseJavaScriptTarget(targetPath);

    const targetInfo: { [key: string]: string | boolean } = {
      targetApiId: target.apiId,
      targetFullId: `${target.apiId}_${target.operationId}_${target.responseId}`,
      targetApiPath: `../../../targets/${target.apiId}`,
      targetApiName
    }
    if (targetOptions) targetInfo.targetOptions = targetOptions.join('.');
    if (targetHasBody) targetInfo.targetHasBody = true;
    if (targetBodyName) targetInfo.targetBodyName = targetBodyName;
    if (targetHasOptional) targetInfo.targetHasOptional = true;

    targetInfos.push(Buffer.from(JSON.stringify(targetInfo)).toString('base64'));
  }
  additionalParameters.push(`targets=${targetInfos.join('.')}`);

  await generateOpenApiInterface(
    'javascript-adapter',
    `${filePath}/source`,
    additionalParameters.join(',')
  );
}

function parseJavaScriptTarget(filePath: string): { targetApiName: string, targetHasBody: boolean, targetBodyName: string, targetBodyRequired: boolean, targetOptions: Array<string>, targetHasOptional: boolean } {
  const targetApiFilePath = `${filePath}/parsed-target.txt`;
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
  const executable = "java -cp openapi-generator/javascript-adapter-openapi-generator-1.0.0.jar:openapi-generator/javascript-target-openapi-generator-1.0.0.jar:openapi-generator/openapi-generator-cli.jar org.openapitools.codegen.OpenAPIGenerator";

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
