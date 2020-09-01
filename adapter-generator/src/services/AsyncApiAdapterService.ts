import { logger, sleep } from "../Service";
import { AdapterType } from "../models/AdapterModel";
import { IAsyncApiMapping } from "../models/MappingModel";
import { exec } from "child_process";
import { STORAGE_PATH } from "../config/Config";
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import * as ApiService from './ApiService';
import { IAsyncApi } from "../models/ApiModel";
import { camelcase } from "../utils/camelcase";
import Zip from "adm-zip";
import { escapeQuote, stringifyedToJsonata } from "../utils/sanitize";
const AsyncApiGenerator = require('@asyncapi/generator');

export async function createAdapter(adapterType: AdapterType, mapping: IAsyncApiMapping): Promise<string> {
  logger.info(`Trying to create adapter for type: ${adapterType}`);

  const adapterTypeKeys: string[] = Object.keys(AdapterType)
  const adapterTypes: AdapterType[] = adapterTypeKeys.map((k) => AdapterType[k as keyof typeof AdapterType]);
  if (!adapterTypes.includes(adapterType)) {
    throw new Error("Unkown adapter type");
  }

  const [sourceApiId, sourceOperationId] = mapping.sourceId.split('_');
  const sourceOperation = { apiId: sourceApiId, operationId: sourceOperationId, topic: '', server: '' };

  const targetOperations = mapping.targetIds.map(id => {
    const [targetApiId, targetOperationId] = id.split('_');
    return { apiId: targetApiId, operationId: targetOperationId, topic: '', server: '' };
  });

  logger.info(`Loading APIs`);
  const [source, ...targets] = await Promise.all([
    ApiService.getAsyncApi(sourceApiId),
    ...targetOperations.map(api => ApiService.getAsyncApi(api.apiId))
  ]);

  sourceOperation.topic = mapping.topics.source;
  sourceOperation.server = mapping.servers.source;
  targetOperations.forEach(t => {
    t.topic = mapping.topics.targets[`${t.apiId}_${t.operationId}`];
    t.server = mapping.servers.targets[`${t.apiId}_${t.operationId}`];
  });

  const fileId = uuidv4();
  const filePath = `${STORAGE_PATH}/${fileId}`;

  logger.info(`Writing specs`);
  fs.mkdirSync(filePath, { recursive: true });

  fs.mkdirSync(`${filePath}/source/`);
  fs.writeFileSync(`${filePath}/source/apiSpec.json`, source.asyncApiSpec);

  fs.mkdirSync(`${filePath}/targets/`);
  for (const target of targets) {
    fs.mkdirSync(`${filePath}/targets/${target.id}/`);
    fs.writeFileSync(`${filePath}/targets/${target.id}/apiSpec.json`, target.asyncApiSpec);
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
  filePath: string, mapping: IAsyncApiMapping,
  sourceOperation: { apiId: string; operationId: string; topic: string; server: string },
  targetOperations: { apiId: string; operationId: string; topic: string; server: string }[]
) {
  const targets: { id: string, fullId: string, topic: string, mapping: string }[] = [];

  for (const target of targetOperations) {
    const generator = new AsyncApiGenerator('./asyncapi-generator/target-template', `${filePath}/targets/${target.apiId}`, {
      templateParams: {
        server: target.server,
      }
    });
    const targetPath = `${filePath}/targets/${target.apiId}/apiSpec.json`;

    targets.push({
      id: target.apiId,
      fullId: `${target.apiId}_${target.operationId}`,
      mapping: escapeQuote(stringifyedToJsonata(mapping.messageMappings[`${target.apiId}_${target.operationId}`])),
      topic: target.topic
    });

    await await generator.generateFromFile(targetPath);
  }

  const generator = new AsyncApiGenerator('./asyncapi-generator/source-template', `${filePath}/source`, {
    templateParams: {
      server: sourceOperation.server,
      sourceId: `${sourceOperation.apiId}_${sourceOperation.operationId}`,
      sourceTopic: sourceOperation.topic,
      mappingDirection: mapping.direction.toString(),
      targets
    }
  });
  await generator.generateFromFile(`${filePath}/source/apiSpec.json`);
}
