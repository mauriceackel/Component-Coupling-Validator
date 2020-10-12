import { logger, sleep } from "../Service";
import { AdapterType } from "../models/AdapterModel";
import { IOpenApiMapping, MappingType } from "../models/MappingModel";
import { exec } from "child_process";
import { STORAGE_PATH } from "../config/Config";
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import * as ApiService from './ApiService';
import { IOpenApi } from "../models/ApiModel";
import { camelcase } from "../utils/camelcase";
import mustache from 'mustache';
import path from 'path';
/// <reference lib="dom" />
import * as firebase from 'firebase';
import { escapeQuote, stringifyedToJsonata } from "../utils/sanitize";

export async function createAdapter(adapterType: AdapterType, mapping: IOpenApiMapping, taskReportId: string): Promise<string> {
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
    ApiService.getOpenApi(sourceApiId),
    ...targetOperations.map(api => ApiService.getOpenApi(api.apiId))
  ]);

  const fileId = uuidv4();
  const filePath = `${STORAGE_PATH}/${fileId}`;

  logger.info(`Writing specs`);
  fs.mkdirSync(filePath, { recursive: true });

  fs.mkdirSync(`${filePath}/source/`);
  fs.writeFileSync(`${filePath}/source/apiSpec.json`, source.openApiSpec);

  fs.mkdirSync(`${filePath}/targets/`);
  for (const target of targets) {
    try {
      fs.mkdirSync(`${filePath}/targets/${target.id}/`);
      fs.writeFileSync(`${filePath}/targets/${target.id}/apiSpec.json`, target.openApiSpec);
    } catch (err) {
      console.log(err);
    }
  }

  logger.info(`Select adapter generator`);
  switch (adapterType) {
    case AdapterType.JAVASCRIPT: await createJavaScriptAdapter(filePath, mapping, sourceOperation, targetOperations, taskReportId); break;
    default: throw new Error("Unkown adapter type");
  }

  if(taskReportId) {
    firebase.firestore().collection('task-reports').doc(taskReportId).update({
      fileId: fileId
    });
  }
  return fileId;
}

async function createJavaScriptAdapter(
  filePath: string, mapping: IOpenApiMapping,
  sourceOperation: { apiId: string; operationId: string; responseId: string; },
  targetOperations: { apiId: string; operationId: string; responseId: string; }[],
  taskReportId: string
) {
  if (mapping.type === MappingType.MANUAL) {
    return createManualJSAdapter(filePath, mapping, sourceOperation, targetOperations, taskReportId);
  }

  const responseMapping = Buffer.from(escapeQuote(stringifyedToJsonata(mapping.responseMapping))).toString('base64');
  const requestMapping = Buffer.from(escapeQuote(stringifyedToJsonata(mapping.requestMapping))).toString('base64');

  const additionalParameters: string[] = [];
  additionalParameters.push(`operationId=${camelcase(sourceOperation.operationId)}`);
  additionalParameters.push(`sourceFullId=${sourceOperation.apiId}_${sourceOperation.operationId}_${sourceOperation.responseId}`);
  additionalParameters.push(`requestMapping=${requestMapping}`);
  additionalParameters.push(`responseMapping=${responseMapping}`);
  additionalParameters.push(`usePromises=true`);
  additionalParameters.push(`projectVersion=0.0.1`);

  const targetInfos: { [key: string]: string | boolean }[] = [];
  for (const target of targetOperations) {
    const targetPath = `${filePath}/targets/${target.apiId}`;

    await generateOpenApiInterface('javascript-target', targetPath, `operationId=${camelcase(target.operationId)},usePromises=true,projectVersion=0.0.1`);
    const { targetApiName, targetHasBody, targetBodyName, targetBodyRequired, targetOptions, targetHasOptional } = parseJavaScriptTarget(targetPath);

    const targetInfo: { [key: string]: string | boolean } = {
      targetApiId: target.apiId,
      targetFullId: `${target.apiId}_${target.operationId}_${target.responseId}`,
      targetApiPath: `../../../targets/${target.apiId}`,
      targetApiName,
      targetFunctionName: target.operationId,
    }
    if (targetOptions && targetOptions.length > 0) targetInfo.targetOptions = targetOptions.join(', ');
    if (targetHasBody) targetInfo.targetHasBody = true;
    if (targetBodyName) targetInfo.targetBodyName = targetBodyName;
    if (targetHasOptional) targetInfo.targetHasOptional = true;

    targetInfos.push(targetInfo);
  }
  additionalParameters.push(`targets=${targetInfos.map(t => Buffer.from(JSON.stringify(t)).toString('base64')).join('.')}`);

  await generateOpenApiInterface(
    'javascript-adapter',
    `${filePath}/source`,
    additionalParameters.join(',')
  );

  const install = mustache.render(fs.readFileSync(path.resolve(__dirname, '../templates/open-api/install.mustache')).toString(), {
    targets: targetInfos.map(t => ({ id: t.targetApiId }))
  });
  fs.writeFileSync(`${filePath}/install.sh`, install);

  const test = mustache.render(fs.readFileSync(path.resolve(__dirname, '../templates/open-api/test.mustache')).toString(), {
    taskReportId
  });
  fs.writeFileSync(`${filePath}/test.js`, test);

  const packag = mustache.render(fs.readFileSync(path.resolve(__dirname, '../templates/open-api/package.mustache')).toString(), {
  });
  fs.writeFileSync(`${filePath}/package.json`, packag);
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


async function createManualJSAdapter(
  filePath: string, mapping: IOpenApiMapping,
  sourceOperation: { apiId: string; operationId: string; responseId: string; },
  targetOperations: { apiId: string; operationId: string; responseId: string; }[],
  taskReportId: string
) {
  await generateOpenApiInterface('javascript', `${filePath}/source`, 'usePromises=true');

  for (const target of targetOperations) {
    const targetPath = `${filePath}/targets/${target.apiId}`;
    await generateOpenApiInterface('javascript', targetPath, 'usePromises=true');
  }

  const install = mustache.render(fs.readFileSync(path.resolve(__dirname, '../templates/open-api/install.mustache')).toString(), {
    targets: targetOperations.map(t => ({ id: t.apiId }))
  });
  fs.writeFileSync(`${filePath}/install.sh`, install);

  const test = mustache.render(fs.readFileSync(path.resolve(__dirname, '../templates/open-api/test.mustache')).toString(), {
    taskReportId
  });
  fs.writeFileSync(`${filePath}/test.js`, test);

  const packag = mustache.render(fs.readFileSync(path.resolve(__dirname, '../templates/open-api/package.mustache')).toString(), {
  });
  fs.writeFileSync(`${filePath}/package.json`, packag);
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

